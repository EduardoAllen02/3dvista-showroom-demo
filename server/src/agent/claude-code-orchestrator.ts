import { query } from "@anthropic-ai/claude-agent-sdk";
import { searchCatalog, computeStyleProfile, type NavTarget } from "@3dvista-assistant/catalog-engine";
import type { ChatUsage } from "@3dvista-assistant/model-adapters";
import { config } from "../config.js";
import { loadCatalog } from "../catalog/catalog-loader.js";
import { buildSystemPrompt } from "./system-prompt.js";
import { buildFullCatalogListing } from "./catalog-listing.js";
import { lastProposal, type OrchestratorResult, type HistoryTurn } from "./orchestrator.js";
import { createChatbotToolServer, CHATBOT_ALLOWED_TOOLS, type ClaudeCodeToolAccumulator } from "./claude-code-tools.js";

/**
 * Renders history + the current message as plain conversational text — the
 * Agent SDK's query() takes a single `prompt` string, not a structured
 * message array, so there's no direct equivalent of orchestrator.ts's
 * toApiMessages(). This backend is stateless per-request either way (see
 * orchestrator.ts's doc comment on toApiMessages), so re-flattening history
 * into text on every call is consistent with that design, not a new
 * limitation introduced here.
 */
function toClaudeCodePrompt(history: HistoryTurn[], message: string): string {
  const historyText = history.map((h) => `${h.role === "user" ? "Usuario" : "Asistente"}: ${h.text}`).join("\n");
  return historyText ? `${historyText}\nUsuario: ${message}` : message;
}

/**
 * Fase 2 comparison path: same catalog, same prompt.md, same 5 tools as
 * handleChat() (orchestrator.ts) — only the model/harness differs. Runs
 * through the Claude Agent SDK's query() (authenticated via the local
 * machine's Claude Code CLI login, no ANTHROPIC_API_KEY needed) instead of
 * a raw provider.chat() call, so the tool-execution loop lives inside
 * query() itself rather than in a manual turn loop — see
 * claude-code-tools.ts's doc comment on why cards/navigate are captured via
 * a side-effecting accumulator instead of a return value.
 */
export async function handleChatViaClaudeCode(
  message: string,
  history: HistoryTurn[],
  wishlistProductIds: string[] = []
): Promise<OrchestratorResult> {
  const start = Date.now();
  const catalog = loadCatalog();
  const { candidates, lowConfidence } = searchCatalog(message, {}, catalog);
  const wishlist =
    wishlistProductIds.length > 0
      ? { productIds: wishlistProductIds, dominantStyle: computeStyleProfile(wishlistProductIds, catalog).dominantStyle }
      : null;
  const systemPrompt = buildSystemPrompt(
    candidates,
    lowConfidence ? buildFullCatalogListing(catalog) : null,
    lastProposal(history),
    wishlist
  );

  const acc: ClaudeCodeToolAccumulator = { cards: [], navigate: null, toolCallValid: true, proposalMade: false };
  const toolServer = createChatbotToolServer(acc);

  let reply = "";
  const usage: ChatUsage = { input_tokens: 0, cached_input_tokens: 0, reasoning_tokens: 0, output_tokens: 0 };
  let totalCostUsd = 0;

  for await (const msg of query({
    prompt: toClaudeCodePrompt(history, message),
    options: {
      model: config.MODEL_ID,
      systemPrompt,
      mcpServers: { "febal-chatbot": toolServer },
      allowedTools: CHATBOT_ALLOWED_TOOLS,
      // Deny (not prompt for) anything outside allowedTools — this backend
      // has no terminal/human to approve a permission dialog, and the
      // whole point of this path is that Claude gets ONLY the 5 chatbot
      // tools, never file/bash/web access. See claude-code-tools.ts.
      permissionMode: "dontAsk",
      // NOT the same constant as orchestrator.ts's MAX_TOOL_TURNS (4) — that
      // counts full request/response cycles in the manual OpenAI/Anthropic-
      // API loop, but the Agent SDK's maxTurns counts individual message
      // exchanges (each tool_use + its tool_result is its own turn, plus
      // the final text reply). Confirmed live: reusing 4 here made 4/45
      // battery calls fail with "Reached maximum number of turns (4)" on
      // completely ordinary exchanges (e.g. search_catalog -> get_product
      // -> final text already needs 3+ under this counting). 10 gives
      // realistic headroom for a couple of tool calls plus the reply.
      maxTurns: 10,
    },
  })) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content) {
        if (block.type === "text") reply += block.text;
      }
    } else if (msg.type === "result") {
      if (msg.subtype === "success") reply = msg.result;
      const u = msg.usage ?? {};
      usage.input_tokens = u.input_tokens ?? 0;
      usage.cached_input_tokens = u.cache_read_input_tokens ?? 0;
      usage.output_tokens = u.output_tokens ?? 0;
      totalCostUsd = msg.total_cost_usd ?? 0;
    }
  }

  return {
    reply,
    cards: acc.cards,
    navigate: acc.navigate,
    usage,
    latencyMs: Date.now() - start,
    toolCallValid: acc.toolCallValid,
    claudeCodeCostUsd: totalCostUsd,
  };
}
