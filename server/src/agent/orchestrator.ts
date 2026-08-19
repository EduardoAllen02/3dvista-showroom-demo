import { searchCatalog, type NavTarget } from "@3dvista-assistant/catalog-engine";
import {
  createOpenAiAdapter,
  TOOL_SCHEMAS,
  type ChatMessage,
  type ChatUsage,
} from "@3dvista-assistant/model-adapters";
import { config } from "../config.js";
import { loadCatalog } from "../catalog/catalog-loader.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { runTool, type ProductCardPayload } from "./tools.js";

const MAX_TOOL_TURNS = 4;

const provider = createOpenAiAdapter(config.OPENAI_API_KEY);

export interface OrchestratorResult {
  reply: string;
  /** Proposal cards (get_product/get_alternatives) — render with buttons. */
  cards: ProductCardPayload[];
  /** Set when navigate_to_product ran this turn — apply immediately, no card/button. */
  navigate: NavTarget | null;
  usage: ChatUsage;
  latencyMs: number;
  toolCallValid: boolean;
}

export interface HistoryTurn {
  role: "user" | "assistant";
  text: string;
}

export async function handleChat(message: string, history: HistoryTurn[]): Promise<OrchestratorResult> {
  const start = Date.now();
  const catalog = loadCatalog();
  const candidates = searchCatalog(message, {}, catalog);
  const systemPrompt = buildSystemPrompt(candidates);

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...history.map((h): ChatMessage => ({ role: h.role, content: h.text })),
    { role: "user", content: message },
  ];

  const totalUsage: ChatUsage = { input_tokens: 0, cached_input_tokens: 0, reasoning_tokens: 0, output_tokens: 0 };
  const cards: ProductCardPayload[] = [];
  let navigate: NavTarget | null = null;
  let toolCallValid = true;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    const result = await provider.chat({ model: config.MODEL_ID, messages, tools: TOOL_SCHEMAS });

    totalUsage.input_tokens += result.usage.input_tokens;
    totalUsage.cached_input_tokens += result.usage.cached_input_tokens;
    totalUsage.reasoning_tokens += result.usage.reasoning_tokens;
    totalUsage.output_tokens += result.usage.output_tokens;

    if (!result.tool_calls.length) {
      return {
        reply: result.content ?? "",
        cards,
        navigate,
        usage: totalUsage,
        latencyMs: Date.now() - start,
        toolCallValid,
      };
    }

    messages.push({ role: "assistant", content: result.content, tool_calls: result.tool_calls });

    for (const call of result.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        toolCallValid = false;
      }
      const toolResult = runTool(call.function.name, args);
      if (!toolResult.valid) toolCallValid = false;
      cards.push(...toolResult.cards);
      if (toolResult.navigate) navigate = toolResult.navigate;
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        name: call.function.name,
        content: JSON.stringify(toolResult.output),
      });
    }
  }

  return {
    reply: "Tuve dificultades para resolver tu solicitud. ¿Puedes reformularla?",
    cards,
    navigate,
    usage: totalUsage,
    latencyMs: Date.now() - start,
    toolCallValid: false,
  };
}
