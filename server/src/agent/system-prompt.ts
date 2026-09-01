import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SearchCandidate } from "@3dvista-assistant/catalog-engine";
import { config } from "../config.js";
import type { CatalogListingEntry } from "./catalog-listing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

let cachedPromptTemplate: string | null = null;

function loadPromptTemplate(): string {
  if (cachedPromptTemplate) return cachedPromptTemplate;
  const promptPath = path.join(ROOT, "clients", config.TOUR_ID, "prompt.md");
  cachedPromptTemplate = readFileSync(promptPath, "utf8");
  return cachedPromptTemplate;
}

/**
 * Builds the system prompt: the tour's prompt.md (persona + hard rules),
 * optionally the full-catalog low-confidence fallback, then a compact
 * JSON summary of the current search candidates (id/name/category/section
 * only — never coordinates). The candidate list is presented as untrusted
 * data, not instructions.
 *
 * Ordering here is deliberate, for prompt-caching cost — not just style.
 * Every request is stateless (no server-side session memory — see
 * orchestrator.ts's doc comment on toApiMessages): if the SAME
 * conversation hits low confidence more than once, the full catalog has
 * to be resent from scratch each time, because nothing about a past
 * turn's system prompt is preserved in `history`. That resend is
 * unavoidable for the model to have anything to reason with — but its
 * TOKEN COST isn't, if the resent bytes are identical and providers can
 * serve them from a prompt cache at a discount instead of full price
 * (OpenAI does this automatically for a long enough, byte-identical
 * prefix). That only works if the STABLE content (prompt.md, and the full
 * catalog when present — neither depends on this turn's message) forms
 * one unbroken prefix at the very start, with the part that changes every
 * single turn (the narrow candidate list, built fresh from THIS message)
 * pushed to the end instead of sitting in the middle and breaking the
 * prefix match. Previously the candidate list sat between the template and
 * the full catalog, which meant the full catalog block — despite being
 * byte-identical turn to turn — could never actually be served from cache,
 * since the prefix leading up to it already differed by then.
 *
 * `lastProposal` (product_ids from the assistant's immediately-previous
 * turn, or null) is appended dead last, after the candidates — the most
 * recent thing the model reads before it has to respond. This replaced an
 * earlier design that interspersed a `system` note into the conversation
 * history itself after every turn with cards; that broke the plain
 * user/assistant alternation more and more as a conversation went on, and
 * a live test caught tool-calling degrading turn over turn as a result
 * (see orchestrator.ts's doc comment on toApiMessages for the full story).
 * A single note here, in the one always-fresh system message, avoids that
 * entirely — it exists in exactly one place, once, and never accumulates.
 */
export interface WishlistContext {
  productIds: string[];
  dominantStyle: string | null;
}

export function buildSystemPrompt(
  candidates: SearchCandidate[],
  fullCatalog: CatalogListingEntry[] | null = null,
  lastProposal: string[] | null = null,
  wishlist: WishlistContext | null = null
): string {
  const template = loadPromptTemplate();
  let prompt = `${template}\n`;

  if (fullCatalog) {
    prompt +=
      "\nCuando la búsqueda de candidatos de abajo encuentre pocos o ningún resultado relevante para el " +
      "mensaje del usuario, aquí tienes TODO el catálogo activo (con descripción breve) como respaldo — " +
      "úsalo solo si de verdad ayuda a identificar qué pidió el usuario; si nada encaja, dilo con honestidad " +
      "en vez de forzar una coincidencia. Sigue exactamente las mismas reglas: nunca describas ni ofrezcas " +
      "un producto de esta lista sin antes llamar a `get_product`/`get_alternatives` para confirmarlo.\n\n" +
      "```json\n" +
      JSON.stringify(fullCatalog, null, 2) +
      "\n```\n";
  }

  const candidateSummary = candidates.map((c) => ({
    product_id: c.product.product_id,
    name: c.product.name,
    category: c.product.category,
    section: c.product.section,
  }));

  prompt += "\n```json\n" + JSON.stringify(candidateSummary, null, 2) + "\n```\n";

  if (lastProposal) {
    prompt +=
      "\nEn tu turno anterior propusiste exactamente estos product_id: " +
      `${lastProposal.join(", ")}. Si el mensaje del usuario es una confirmación breve ` +
      "referida a eso ('sí', 'ese', 'el primero', etc.), úsalos directamente en tu siguiente " +
      "llamada a herramienta — no busques ni inventes otros.\n";
  }

  if (wishlist) {
    prompt +=
      "\nEl visitante tiene guardados en su wishlist estos product_id: " +
      `${wishlist.productIds.join(", ")}` +
      (wishlist.dominantStyle
        ? ` (estilo predominante detectado por el sistema: "${wishlist.dominantStyle}").`
        : ".") +
      " Si el usuario pide recomendaciones, más ideas, o qué más le podría gustar (basado en lo que " +
      "guardó, en su estilo, o de forma general sin especificar un producto), llama a " +
      "`get_recommendations` con exactamente estos product_id — no la llames si el usuario no tiene " +
      "wishlist guardada o no está pidiendo este tipo de sugerencia.\n";
  }

  return prompt;
}
