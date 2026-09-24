import type { ChatMessage, ChatRequest, ChatResult, ModelProvider, ToolCall } from "./provider.js";

const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 4096;

interface AnthropicTextBlock {
  type: "text";
  text: string;
}

interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | { type: string };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | Array<Record<string, unknown>>;
}

interface AnthropicResponse {
  content: AnthropicContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  error?: { message: string; type: string };
}

function toAnthropicTools(tools: ChatRequest["tools"]): Array<Record<string, unknown>> {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

/**
 * Translates the orchestrator's OpenAI-shaped ChatMessage[] (system/user/
 * assistant/tool roles, one message per tool result) into Anthropic's
 * Messages API shape: `system` is a separate top-level string, and — the
 * one non-trivial part — every `tool` role message must land inside a
 * `tool_result` content block, with ALL tool_results belonging to the same
 * assistant turn batched into a SINGLE user message (Anthropic rejects, or
 * at least trains the model away from parallel tool use on, one-result-
 * per-message). The orchestrator pushes one `tool` ChatMessage per call in
 * a row, so consecutive `tool` messages here get merged into one batch.
 */
function toAnthropicMessages(messages: ChatMessage[]): { system: string; messages: AnthropicMessage[] } {
  let system = "";
  const out: AnthropicMessage[] = [];
  let pendingToolResults: Array<Record<string, unknown>> | null = null;

  const flushToolResults = () => {
    if (pendingToolResults) {
      out.push({ role: "user", content: pendingToolResults });
      pendingToolResults = null;
    }
  };

  for (const m of messages) {
    if (m.role === "system") {
      system += (system ? "\n\n" : "") + (m.content ?? "");
      continue;
    }
    if (m.role === "tool") {
      if (!pendingToolResults) pendingToolResults = [];
      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: m.tool_call_id,
        content: m.content ?? "",
      });
      continue;
    }
    flushToolResults();
    if (m.role === "user") {
      out.push({ role: "user", content: m.content ?? "" });
    } else if (m.role === "assistant") {
      const blocks: Array<Record<string, unknown>> = [];
      if (m.content) blocks.push({ type: "text", text: m.content });
      for (const call of m.tool_calls ?? []) {
        blocks.push({
          type: "tool_use",
          id: call.id,
          name: call.function.name,
          input: JSON.parse(call.function.arguments || "{}"),
        });
      }
      out.push({ role: "assistant", content: blocks });
    }
  }
  flushToolResults();

  return { system, messages: out };
}

function toAnthropicToolChoice(choice: ChatRequest["tool_choice"]): Record<string, unknown> {
  return choice === "required" ? { type: "any" } : { type: "auto" };
}

function fromAnthropicResponse(body: AnthropicResponse): ChatResult {
  let content: string | null = null;
  const tool_calls: ToolCall[] = [];

  for (const block of body.content ?? []) {
    if (block.type === "text") {
      content = (content ?? "") + (block as AnthropicTextBlock).text;
    } else if (block.type === "tool_use") {
      const b = block as AnthropicToolUseBlock;
      tool_calls.push({
        id: b.id,
        type: "function",
        function: { name: b.name, arguments: JSON.stringify(b.input) },
      });
    }
  }

  const u = body.usage ?? {};
  const cachedTokens = u.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = u.cache_creation_input_tokens ?? 0;

  return {
    content,
    tool_calls,
    usage: {
      // Anthropic reports input_tokens / cache_read / cache_creation as three
      // disjoint buckets (none inclusive of the others). OpenAI's
      // prompt_tokens, by contrast, is a TOTAL that already includes its
      // cached subset. Summing all three here mirrors OpenAI's "total
      // input" convention so cost math in the Fase 2 comparison report can
      // treat both providers' `input_tokens` the same way; cached_input_tokens
      // stays a subset count on both sides.
      input_tokens: (u.input_tokens ?? 0) + cachedTokens + cacheWriteTokens,
      cached_input_tokens: cachedTokens,
      // Claude's extended-thinking tokens (when thinking is enabled) are
      // already billed as part of output_tokens, unlike OpenAI's o-series
      // models which break reasoning tokens out separately — there is no
      // equivalent separate figure to report here.
      reasoning_tokens: 0,
      output_tokens: u.output_tokens ?? 0,
    },
    raw: body,
  };
}

/**
 * Anthropic Messages API adapter — implements the same ModelProvider seam
 * as openai-adapter.ts, translating the orchestrator's OpenAI-shaped
 * ChatRequest/ChatResult to/from Anthropic's wire format. Uses raw fetch
 * (no @anthropic-ai/sdk dependency) to mirror openai-adapter.ts's own
 * approach — this keeps both provider implementations symmetric and avoids
 * adding an SDK dependency solely for this comparison experiment.
 */
export function createAnthropicAdapter(apiKey: string): ModelProvider {
  return {
    name: "anthropic",
    async chat(request: ChatRequest): Promise<ChatResult> {
      const { system, messages } = toAnthropicMessages(request.messages);

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          max_tokens: MAX_TOKENS,
          system,
          messages,
          tools: toAnthropicTools(request.tools),
          tool_choice: toAnthropicToolChoice(request.tool_choice),
        }),
      });

      const body = (await res.json()) as AnthropicResponse;

      if (!res.ok || body.error) {
        throw new Error(`Anthropic API error: ${body.error?.message ?? res.statusText}`);
      }

      return fromAnthropicResponse(body);
    },
  };
}
