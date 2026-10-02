import type { Lang } from "../catalog/types.js";
import type { ActiveConstraint, CardRef } from "../engine/types.js";

/**
 * Server-side conversation state (clean-room §4). Updated only by the reducer (code),
 * from a plan proposed by the LLM. Topic changes reset the constraints; the wishlist
 * and language survive.
 */
export interface Topic {
  id: number;
  constraints: ActiveConstraint[];
  /** "cocinas que combinen con ese sofá": the linked exhibit. */
  linked_to?: string;
  started_turn: number;
}

export type PendingAction =
  /** cards: the offered pieces as they were offered (on order in the asked colour…), so a "yes" keeps that. */
  | { kind: "offer_group"; exhibit_ids: string[]; cards?: CardRef[]; expires_turn: number }
  | { kind: "navigate"; exhibit_id: string; expires_turn: number }
  | { kind: "disambiguate_nav"; exhibit_ids: string[]; expires_turn: number };

export interface ConversationState {
  session_id: string;
  turn: number;
  lang: Lang;
  topic: Topic;
  topic_stack: Topic[];
  focus: string | null;                 // exhibit id
  focus_source: "card_click" | "navigation" | "mention" | "viewer" | "list_position" | null;
  mentioned: string[];                  // exhibit ids by recency (most recent first)
  last_cards: { turn: number; groups: { id: string; role: string; items: string[] }[] };
  viewer: { media_name: string | null; centered: string | null; visible: string[] };
  pending: PendingAction | null;
  wishlist: string[];
  seen: string[];
  last_activity: number;
  constraint_seq: number;
  /** The English + three-languages offer was already made (visitor wrote in another language). */
  langs_offered?: boolean;
}

export function newState(sessionId: string, lang: Lang = "it"): ConversationState {
  return {
    session_id: sessionId, turn: 0, lang,
    topic: { id: 1, constraints: [], started_turn: 0 }, topic_stack: [],
    focus: null, focus_source: null, mentioned: [], last_cards: { turn: 0, groups: [] },
    viewer: { media_name: null, centered: null, visible: [] }, pending: null, wishlist: [], seen: [],
    last_activity: Date.now(), constraint_seq: 0,
  };
}

export interface StateStore {
  get(sessionId: string): ConversationState | undefined;
  set(state: ConversationState): void;
}

/** One backend instance per tour (EC2): in-memory with idle expiry. Swap for Redis behind the same interface. */
export class MemoryStateStore implements StateStore {
  private map = new Map<string, ConversationState>();
  constructor(private ttlMs = 30 * 60 * 1000, private maxSessions = 5000) {}
  get(id: string): ConversationState | undefined {
    const s = this.map.get(id);
    if (!s) return undefined;
    if (Date.now() - s.last_activity > this.ttlMs) { this.map.delete(id); return undefined; }
    return s;
  }
  set(state: ConversationState): void {
    state.last_activity = Date.now();
    this.map.delete(state.session_id);
    this.map.set(state.session_id, state);
    while (this.map.size > this.maxSessions) this.map.delete(this.map.keys().next().value as string);
  }
}

// ---------------------------------------------------------------- language
const STOP: Record<Lang, string[]> = {
  es: ["el", "la", "los", "las", "de", "que", "y", "en", "un", "una", "tienes", "tienen", "hay", "quiero", "busco", "con", "para", "por", "lo", "me", "sí", "si", "gracias", "algo", "como", "cuál", "dónde", "donde", "llévame", "muéstrame", "otro", "otra", "esto", "este", "esta", "puedes", "también"],
  it: ["il", "lo", "la", "gli", "le", "di", "che", "e", "in", "un", "una", "avete", "hai", "c'è", "vorrei", "cerco", "con", "per", "mi", "sì", "grazie", "qualcosa", "come", "dove", "portami", "mostrami", "altro", "questo", "questa", "anche", "dei", "delle", "degli", "del", "della"],
  en: ["the", "a", "an", "of", "and", "in", "do", "you", "have", "is", "are", "want", "looking", "for", "with", "me", "yes", "thanks", "something", "like", "where", "take", "show", "other", "this", "that", "any", "also", "what", "which"],
};

/** Language of the LAST message; short/neutral messages ("ok", "Melrose", "👍") keep the previous one. */
export function detectLang(text: string, previous: Lang): Lang {
  const toks = text.toLowerCase().normalize("NFC").split(/[^\p{L}']+/u).filter(Boolean);
  if (toks.length === 0) return previous;
  const score: Record<Lang, number> = { es: 0, it: 0, en: 0 };
  for (const l of Object.keys(STOP) as Lang[]) for (const t of toks) if (STOP[l].includes(t)) score[l]++;
  if (/[ñ¿¡]/.test(text)) score.es += 2;
  // Words only one language uses ("un armario elegante" is Spanish, "un armadio elegante" Italian).
  if (/(^|[^\p{L}])(ciao|grazie|avete|vorrei|cerco|mostrami|dove|qualcosa|divano|divani|cucina|cucine|tavolo|tavoli|armadio|armadi|sedia|sedie|letto|letti|poltrona|comodino)(?![\p{L}])/iu.test(text)) score.it += 1;
  if (/(^|[^\p{L}])(quiero|busco|tienen|tienes|muéstrame|muestrame|llévame|llevame|enséñame|ensename|dime|necesito|quisiera|dónde|donde|algo|armario|armarios|clóset|closet|mesa|mesas|silla|sillas|sillón|cama|camas|cocina|cocinas|recámara|buró|sofá|sofás|sala|salas|sillones|esquinero|hola|gracias|hay|qué|cuál|cuánto|cuesta)(?![\p{L}])/iu.test(text)) score.es += 1;
  const best = (Object.keys(score) as Lang[]).sort((a, b) => score[b] - score[a])[0];
  const second = (Object.keys(score) as Lang[]).sort((a, b) => score[b] - score[a])[1];
  if (score[best] === 0 || score[best] === score[second]) return previous;
  return best;
}

// Frequent words of languages the assistant does not speak.
const FOREIGN: Record<string, string[]> = {
  fr: ["le", "la", "les", "des", "du", "vous", "avez", "est", "une", "bonjour", "merci", "canapé", "canapés", "je", "nous", "pour", "avec", "cuir", "quel", "quelle", "chaise", "armoire", "cuisine", "oui", "très", "gris", "grise", "voudrais", "cherche"],
  de: ["der", "die", "das", "und", "ist", "haben", "sie", "ich", "wir", "ein", "eine", "hallo", "danke", "graue", "grau", "leder", "tisch", "stuhl", "bett", "schrank", "küche", "bitte", "mit", "nicht", "welche", "gibt", "suche"],
  pt: ["você", "vocês", "têm", "olá", "obrigado", "obrigada", "armário", "cozinha", "couro", "cinza", "não", "cadeira", "procuro", "gostaria"],
};

/** "fr" | "de" | "pt" when the message is clearly in a language the assistant does not speak. */
export function foreignLang(text: string): string | null {
  const toks = text.toLowerCase().normalize("NFC").split(/[^\p{L}']+/u).filter(Boolean);
  if (toks.length === 0) return null;
  const own = Math.max(...(Object.keys(STOP) as Lang[]).map((l) => toks.filter((t) => STOP[l].includes(t)).length));
  let best: string | null = null, bestScore = 0;
  for (const [l, words] of Object.entries(FOREIGN)) {
    const n = toks.filter((t) => words.includes(t)).length;
    if (n > bestScore) { best = l; bestScore = n; }
  }
  return best && bestScore >= 2 && bestScore > own ? best : null;
}
