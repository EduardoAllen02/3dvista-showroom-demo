import { searchCatalog, computeStyleProfile, type NavTarget } from "@3dvista-assistant/catalog-engine";
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
import { buildFullCatalogListing } from "./catalog-listing.js";

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
  /** product_id's the assistant actually proposed in this turn, if any. */
  product_ids?: string[];
}

/**
 * Plain passthrough — history stays a clean, natural user/assistant
 * alternation. TWO earlier versions tried to smuggle the "what did I just
 * propose" anchor into this array instead of the system prompt, and both
 * caused real, live-reproduced regressions:
 *   1st attempt: appended a trailing `[product_ids: ...]` line onto the
 *   assistant turn's own `content`. The model started literally copying
 *   that bracket syntax into its OWN new replies (visible to the visitor)
 *   — it reads its past "assistant" turns as a style example, so anything
 *   embedded inside that role's content gets treated as part of what an
 *   assistant reply looks like.
 *   2nd attempt: moved the note to its own interspersed `system` message
 *   right after each assistant turn that had cards. That stopped the
 *   copying, but a live 6-message test (Cocinas → Sofás → Armarios → …)
 *   showed tool-calling itself degrading after ~2 turns — cards stopped
 *   appearing even though the model still narrated products in prose. The
 *   accumulating system messages break the plain user/assistant
 *   alternation the model was trained on, and that non-standard shape
 *   compounds turn over turn as more of them pile up.
 * The anchor now lives in ONE place instead: a single block appended to
 * THIS turn's system prompt (see buildSystemPrompt's `lastProposal` param,
 * computed from just the most recent history entry, below) — present once,
 * at the very end where the model's attention is already highest, and
 * never duplicated into the conversation shape itself.
 */
function toApiMessages(history: HistoryTurn[]): ChatMessage[] {
  return history.map((h) => ({ role: h.role, content: h.text }));
}

/**
 * The product_ids from the LAST history turn, but only if that turn was
 * the assistant AND it actually had cards — mirrors prompt.md's rule that
 * a confirmation only ever anchors to the assistant's immediately prior
 * turn, never further back. If the most recent assistant turn was text-only
 * (no cards), this deliberately returns null: prompt.md already tells the
 * model that means nothing was verified yet, so it must search again
 * rather than navigate to something older.
 */
function lastProposal(history: HistoryTurn[]): string[] | null {
  const last = history[history.length - 1];
  if (last?.role === "assistant" && last.product_ids && last.product_ids.length > 0) {
    return last.product_ids;
  }
  return null;
}

export async function handleChat(
  message: string,
  history: HistoryTurn[],
  wishlistProductIds: string[] = []
): Promise<OrchestratorResult> {
  const start = Date.now();
  const catalog = loadCatalog();
  const { candidates, lowConfidence } = searchCatalog(message, {}, catalog);
  // Dominant style is a plain aggregation over the catalog's own `style`
  // tags (see catalog-engine's computeStyleProfile) — computed here, not by
  // the model, so it costs nothing beyond the few dozen tokens of the
  // resulting text block below.
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

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...toApiMessages(history),
    { role: "user", content: message },
  ];

  const totalUsage: ChatUsage = { input_tokens: 0, cached_input_tokens: 0, reasoning_tokens: 0, output_tokens: 0 };
  const cards: ProductCardPayload[] = [];
  let navigate: NavTarget | null = null;
  let toolCallValid = true;
  let proposalMade = false;

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    // Force a tool call on the FIRST completion of every user turn (see
    // ChatRequest.tool_choice's doc comment) — structural, not just a
    // prompt request, so it can't be skipped the way wording sometimes was.
    const result = await provider.chat({
      model: config.MODEL_ID,
      messages,
      tools: TOOL_SCHEMAS,
      tool_choice: turn === 0 ? "required" : "auto",
    });

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

      // At most ONE proposal-type call (get_product/get_alternatives) gets
      // to contribute cards per user turn. Without this, a live test showed
      // the model sometimes calling get_product for the top pick AND THEN
      // get_alternatives right after, in the same turn — dumping every
      // candidate as a full card in one message and making the resulting
      // "Ver alternativas" buttons meaningless (everything was already on
      // screen). prompt.md already asks the model for "one card + mention
      // the rest by name", but this makes it structurally true regardless
      // of whether the model follows that wording. A second proposal call
      // still runs and its real output still reaches the model (so it can
      // still talk about it in prose) — only its cards are dropped.
      const isProposalTool =
        call.function.name === "get_product" ||
        call.function.name === "get_alternatives" ||
        call.function.name === "get_recommendations";
      const suppressCards = isProposalTool && proposalMade;
      if (!suppressCards) {
        cards.push(...toolResult.cards);
        if (isProposalTool && toolResult.cards.length > 0) proposalMade = true;
      }
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
