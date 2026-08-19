import type { ChatRequest, ChatResult, ModelProvider } from "./provider.js";

interface OpenAiChoiceMessage {
  content: string | null;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
}

interface OpenAiResponse {
  choices: Array<{ message: OpenAiChoiceMessage }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  error?: { message: string };
}

/**
 * OpenAI Chat Completions adapter (default provider for this demo — the
 * user has an OpenAI key ready). Model defaults to gpt-4o-mini via
 * MODEL_ID, per the doc's economical-baseline recommendation, and is
 * swappable without touching the orchestrator.
 */
export function createOpenAiAdapter(apiKey: string): ModelProvider {
  return {
    name: "openai",
    async chat(request: ChatRequest): Promise<ChatResult> {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          tools: request.tools,
          tool_choice: "auto",
        }),
      });

      const body = (await res.json()) as OpenAiResponse;

      if (!res.ok || body.error) {
        throw new Error(`OpenAI API error: ${body.error?.message ?? res.statusText}`);
      }

      const choice = body.choices[0]?.message;
      if (!choice) {
        throw new Error("OpenAI API returned no choices.");
      }

      return {
        content: choice.content ?? null,
        tool_calls: choice.tool_calls ?? [],
        usage: {
          input_tokens: body.usage?.prompt_tokens ?? 0,
          cached_input_tokens: body.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          reasoning_tokens: body.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
          output_tokens: body.usage?.completion_tokens ?? 0,
        },
        raw: body,
      };
    },
  };
}
