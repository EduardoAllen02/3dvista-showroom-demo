import type { CanonicalCatalog, ConceptId } from "../catalog/types.js";
import type { Lexicon } from "../ontology/lexicon.js";
import { normalizeText } from "../ontology/lexicon.js";
import type { ActiveConstraint, ConstraintFacet } from "../engine/types.js";
import type { ConversationState, Topic } from "./state.js";
import { detectLang, foreignLang } from "./state.js";
import type { PlanConstraint, TurnPlan } from "./planner.js";

/**
 * Reducer: CODE applies the LLM's plan to the conversation state. It validates every id,
 * cross-checks concepts against the lexicon (false friends: "piel" can never become nubuck),
 * enforces the topic-change invariant, and decides the engine action. Nothing the LLM
 * proposes reaches the engine unvalidated.
 */

export type EngineAction =
  | { kind: "search"; constraints: ActiveConstraint[] }
  | { kind: "mood"; constraints: ActiveConstraint[] }
  | { kind: "list"; constraints: ActiveConstraint[] }
  | { kind: "alternatives"; exhibit: string }
  | { kind: "recommend"; seeds: string[]; seen: string[]; anchor?: string }
  | { kind: "locate"; target: string }
  | { kind: "detail"; exhibit: string; fields: string[]; asked?: { facet: "material" | "color"; value: string }[] }
  | { kind: "navigate"; exhibit: string }
  | { kind: "show"; exhibits: string[] }
  | { kind: "clarify"; candidates: string[]; reason: "ambiguous_ref" | "no_focus" | "empty" }
  | { kind: "template"; template: "out_of_scope" | "smalltalk" | "decline" | "greeting" | "price" };

export interface ReduceResult { state: ConversationState; action: EngineAction; notes: string[]; foreign?: string }

export class Reducer {
  private exhibitIds: Set<string>;
  private modelIds: Set<string>;
  private exhibitModel = new Map<string, string>();
  private exhibitCategory = new Map<string, ConceptId>();
  private broadStyles = new Set<string>();
  private nameIndex: { norm: string; model: string }[] = [];

  constructor(private catalog: CanonicalCatalog, private lx: Lexicon) {
    this.exhibitIds = new Set(catalog.exhibits.map((e) => e.id));
    this.modelIds = new Set(catalog.models.map((m) => m.id));
    for (const e of catalog.exhibits) { this.exhibitModel.set(e.id, e.model_id); this.exhibitCategory.set(e.id, e.category); }
    // Styles most of the showroom has ("elegante"): asked alone they narrow nothing, so ask the furniture type first.
    const styleCount = new Map<string, number>();
    for (const e of catalog.exhibits) if (e.styles.status === "known") for (const st of e.styles.value) styleCount.set(st, (styleCount.get(st) ?? 0) + 1);
    for (const [st, n] of styleCount) if (n / catalog.exhibits.length >= 0.3) this.broadStyles.add(st);
    // Distinctive model names mentioned in a message ("Melrose", "Profile Leather", "Madeira").
    const generic = new Set(["anta", "battente", "scorrevole", "origina", "square", "sistema", "struttura", "madia", "isola", "cassettiera", "camerette", "componibili", "per", "bambini", "e", "ragazzi"]);
    for (const m of catalog.models) {
      const norm = normalizeText(m.name).split(" ").filter((t) => !generic.has(t) && t.length > 2).join(" ");
      if (norm) this.nameIndex.push({ norm, model: m.id });
    }
  }

  exhibitsOfModel(model: string): string[] {
    return this.catalog.exhibits.filter((e) => e.model_id === model).map((e) => e.id);
  }

  /** Models named explicitly in the message. */
  namedModels(message: string): string[] {
    const msg = ` ${normalizeText(message)} `;
    return [...new Set(this.nameIndex.filter((n) => msg.includes(` ${n.norm} `)).map((n) => n.model))];
  }

  /** foreign: the visitor wrote in fr/de/pt and `message` is its English translation. */
  reduce(prev: ConversationState, plan: TurnPlan, message: string, foreign: string | null = foreignLang(message)): ReduceResult {
    const notes: string[] = [];
    const s: ConversationState = structuredClone(prev);
    s.turn += 1;
    s.lang = detectLang(message, prev.lang);
    if (s.lang !== plan.lang) notes.push(`lang: detector=${s.lang} plan=${plan.lang}`);
    // A language the assistant does not speak: answer in English (the offer of the three languages is added once).
    if (foreign) { s.lang = "en"; plan.lang = "en"; notes.push(`foreign language ${foreign} → English`); }

    // ---- references: only ids the visitor can actually be pointing at
    // The planner sometimes returns "FEB-101 Letto Arden": keep the id it contains.
    const canon = (x: string | null): string | null => (!x || this.exhibitIds.has(x) ? x : x.split(/[\s,;|()]+/).find((t) => this.exhibitIds.has(t)) ?? x);
    plan.focus = canon(plan.focus);
    for (const r of plan.refs) r.exhibit_id = canon(r.exhibit_id) ?? r.exhibit_id;
    const named = this.namedModels(message).flatMap((m) => this.exhibitsOfModel(m));
    const reachable = new Set([
      ...s.last_cards.groups.flatMap((g) => g.items), ...s.mentioned, ...s.wishlist, ...named,
      ...(s.viewer.centered ? [s.viewer.centered] : []), ...(s.focus ? [s.focus] : []),
      ...(s.pending && "exhibit_ids" in s.pending ? s.pending.exhibit_ids : []),
      ...(s.pending && "exhibit_id" in s.pending ? [s.pending.exhibit_id] : []),
    ]);
    const valid = (id: string | null): id is string => !!id && this.exhibitIds.has(id) && reachable.has(id);
    for (const r of plan.refs) if (!valid(r.exhibit_id)) notes.push(`ref rejected: ${r.phrase}→${r.exhibit_id}`);
    let focus = valid(plan.focus) ? plan.focus : null;
    if (plan.focus && !focus) notes.push(`focus rejected: ${plan.focus}`);
    if (!focus) {
      const refIds = plan.refs.map((r) => r.exhibit_id).filter(valid);
      if (refIds.length === 1) focus = refIds[0];
    }
    if (!focus && named.length && new Set(named.map((id) => this.exhibitModel.get(id))).size === 1) focus = named[0];

    // ---- constraints proposed by the plan, validated + lexicon cross-check
    for (const c of plan.add) c.value = c.value.trim().replace(/[^a-z0-9_.-]/gi, "").replace(/\.+$/, "");
    const proposed: PlanConstraint[] = plan.add.filter((c) => this.validValue(c, notes));
    const lexHits = this.lx.match(message, ["category", "material", "color", "shape", "style", "mood"]);
    const negated = negatedSpans(message);
    const lexByFacet = new Map<string, ConceptId[]>();
    for (const h of lexHits) lexByFacet.set(h.facet, [...(lexByFacet.get(h.facet) ?? []), h.concept]);
    // False friends: the lexicon's material wins over a different material from the LLM.
    const lexMats = lexByFacet.get("material") ?? [];
    for (const c of proposed) {
      if (c.facet === "material" && lexMats.length && !lexMats.includes(c.value)) {
        notes.push(`material corrected by lexicon: ${c.value}→${lexMats[0]}`);
        c.value = lexMats[0];
      }
    }
    // A negated word in the message ("que no sea negra") can never be an "is" constraint.
    for (const c of proposed) {
      const hit = lexHits.find((h) => h.concept === c.value);
      if (hit && c.op === "is" && negated(hit.start)) { c.op = "not"; notes.push(`negation restored: ${c.value}`); }
    }
    // "¿Lo tienes en amarillo?" right after several pieces asks about all of them (the kind just shown),
    // not about whichever one the planner picked: only a name, a demonstrative, an ordinal or the piece
    // in front of the camera singles one out.
    const lastShown = prev.last_cards.turn === prev.turn ? prev.last_cards.groups.flatMap((g) => g.items) : [];
    if (plan.intent === "variant" && focus && lastShown.length > 1 && lastShown.includes(focus) && !named.length
      && focus !== s.viewer.centered && !POINTER.test(` ${normalizeText(message)} `)) {
      notes.push(`variant→search (a pronoun after ${lastShown.length} pieces asks about all of them)`);
      plan.intent = "search";
      focus = null;
    }
    // A bare "sí" right after an offer accepts it, whatever the planner made of it (it sometimes re-runs
    // the previous search with the offer still pending).
    if (s.pending?.kind === "offer_group" && YES.test(` ${normalizeText(message)} `) && plan.intent !== "confirm") {
      notes.push(`${plan.intent}→confirm (yes to the pending offer)`);
      plan.intent = "confirm";
    }
    // "¿y cuánto pesa?": the planner sometimes asks for every field. Keep the ones the message names;
    // none named → one field, so the answer is about what was asked and not a dump of the page.
    if (plan.intent === "detail" && plan.detail_fields.length > 2) {
      const msg = ` ${normalizeText(message)} `;
      const named = plan.detail_fields.filter((f) => FIELD_WORDS[f]?.test(msg));
      plan.detail_fields = named.length ? named : ["dimensions"];
      notes.push(`detail fields narrowed to ${plan.detail_fields.join(",")}`);
    }
    // "¿La madia es de mármol?", "¿de qué color es el Balmoral?": a question about how the piece in the
    // showroom is made or looks. It is answered from the piece itself (yes/no + its finishes), so the
    // page's material list and fields the message doesn't name (dimensions) stay out.
    if (plan.intent === "detail") {
      const msg = ` ${normalizeText(message)} `;
      const asked = lexHits.filter((h) => (h.facet === "material" || h.facet === "color") && !negated(h.start));
      if (asked.length || COLOR_Q.test(msg)) {
        plan.detail_asked = asked.map((h) => ({ facet: h.facet as "material" | "color", value: h.concept }));
        plan.detail_fields = plan.detail_fields.filter((f) => f !== "materials" && f !== "options" && FIELD_WORDS[f]?.test(msg));
        notes.push(`detail about the piece itself: ${plan.detail_asked.map((a) => a.value).join(",") || "colour"}`);
      }
    }
    // Normalize the intent: "list" only for a bare category; "variant" needs a single focused piece.
    if (plan.intent === "list" && proposed.some((c) => c.facet !== "category") ) { plan.intent = "search"; notes.push("list→search (has attributes)"); }
    if (plan.intent === "variant" && !focus) { plan.intent = "search"; notes.push("variant→search (no single focus)"); }
    // "algo verde" is a search even when the planner calls it chit-chat or a recommendation.
    const concrete = lexHits.some((h) => ["category", "color", "material", "shape"].includes(h.facet) && !negated(h.start));
    if ((plan.intent === "smalltalk" || (plan.intent === "recommend" && !prev.wishlist.length)) && !focus && concrete) {
      notes.push(`${plan.intent}→search (the visitor named what they want)`);
      plan.intent = "search";
    }
    const moodOnly = proposed.length > 0 && proposed.every((c) => c.facet === "mood");
    if (plan.intent === "recommend" && moodOnly) { plan.intent = "search"; notes.push("recommend→mood search"); }
    // Concepts the visitor clearly said that the plan forgot (only for facets it left empty).
    const searching = ["search", "variant", "list"].includes(plan.intent);
    if (searching) {
      for (const facet of ["category", "material", "color", "shape", "style", "mood"] as const) {
        // A word that is also a mood ("acogedor") stays a soft mood preference, never a style filter.
        const hits = lexHits.filter((h) => h.facet === facet && !(facet === "style" && lexHits.some((m) => m.facet === "mood" && m.start === h.start)));
        if (hits.length && !proposed.some((c) => c.facet === facet)) {
          if (facet === "category" && plan.intent === "variant") continue;
          for (const h of facet === "mood" ? hits : hits.slice(0, 1)) {
            proposed.push({ facet, op: negated(h.start) ? "not" : "is", value: h.concept, emphasis: "normal" });
            notes.push(`added from lexicon: ${facet}${negated(h.start) ? "≠" : "="}${h.concept}`);
          }
        }
      }
    }

    if (plan.intent === "list" && proposed.some((c) => c.facet !== "category")) { plan.intent = "search"; notes.push("list→search (attributes from lexicon)"); }

    // A variant of the linked piece itself ("¿y la Arden en azul?" linked to Arden) is not a
    // "goes with X" topic: it would add "harmonizes with Arden" on top of "Arden in blue".
    if (plan.topic === "linked" && focus && valid(plan.linked_ref)
      && (plan.linked_ref === focus || (plan.intent === "variant" && this.exhibitModel.get(plan.linked_ref!) === this.exhibitModel.get(focus)))) {
      plan.topic = "continue";
      notes.push("linked → continue (variant of the linked piece itself)");
    }
    // Prices are never in the data: "¿cuánto cuesta?" is a detail (price) of the piece in focus.
    const priceAsked = PRICE.test(message);
    if (priceAsked && focus) {
      plan.intent = "detail";
      if (!plan.detail_fields.includes("price")) plan.detail_fields = [...plan.detail_fields, "price"];
      notes.push("price asked → detail(price)");
    }
    // ---- topic invariant: a different category without an explicit link = new topic
    const curCat = s.topic.constraints.find((c) => c.facet === "category" && c.op === "is")?.value;
    const newCat = proposed.find((c) => c.facet === "category" && c.op === "is")?.value;
    const related = (a: ConceptId, b: ConceptId) => this.lx.isA(a, b) || this.lx.isA(b, a);
    // Adding a furniture type to a search that had none ("algo elegante" → "sofás") narrows it.
    if (plan.topic === "new" && newCat && !curCat && s.topic.constraints.some((c) => c.facet !== "model")) {
      plan.topic = "continue";
      notes.push("new → continue (first furniture type for the current search)");
    }
    let topicMode = plan.topic;
    if (plan.topic !== "linked" && newCat && curCat && !related(newCat, curCat)) {
      if (plan.topic !== "new") notes.push("topic forced to new (category changed)");
      topicMode = "new";
    }
    if (plan.intent === "list" && newCat && curCat && newCat !== curCat) topicMode = "new";
    if (topicMode === "new" || topicMode === "linked") {
      s.topic_stack.push(s.topic);
      const t: Topic = { id: s.topic.id + 1, constraints: [], started_turn: s.turn };
      if (topicMode === "linked" && valid(plan.linked_ref)) t.linked_to = plan.linked_ref;
      s.topic = t;
      if (!focus || (newCat && !related(this.exhibitCategory.get(focus) ?? "", newCat))) focus = null;
    }

    // ---- apply to the topic's constraints
    const cons = s.topic.constraints.map((c) => ({ ...c, role: "frame" as const }));
    const removeFacets = new Set(plan.remove);
    let next: ActiveConstraint[] = cons.filter((c) => !removeFacets.has(c.facet as never));
    const mk = (c: PlanConstraint, role: "frame" | "new"): ActiveConstraint => ({
      id: `c${++s.constraint_seq}`, facet: c.facet as ConstraintFacet, op: c.op, value: c.value, role,
      emphasis: c.emphasis, strength: c.facet === "mood" ? "prefer" : "must",
    });
    for (const c of proposed) {
      if (c.op === "is") next = next.filter((x) => !(x.facet === c.facet && x.op === "is"));
      next = next.filter((x) => !(x.facet === c.facet && x.value === c.value));
      next.push(mk(c, "new"));
    }
    if (topicMode === "linked" && s.topic.linked_to) {
      next.push({ id: `c${++s.constraint_seq}`, facet: "color", op: "harmonizes_with", ref: s.topic.linked_to, role: "new", emphasis: "normal", strength: "must" });
    }
    // Variant of the focused piece: same model (identity) + its category, as frame.
    if (plan.intent === "variant" && focus) {
      const model = this.exhibitModel.get(focus)!;
      next = next.filter((x) => x.facet !== "model");
      next.unshift({ id: `c${++s.constraint_seq}`, facet: "model", op: "is", value: model, role: "frame", emphasis: "normal", strength: "must" });
      if (!next.some((x) => x.facet === "category")) {
        next.unshift({ id: `c${++s.constraint_seq}`, facet: "category", op: "is", value: this.exhibitCategory.get(focus)!, role: "frame", emphasis: "normal", strength: "must" });
      }
    } else if (plan.intent !== "variant") {
      next = next.filter((x) => x.facet !== "model" || proposed.some((p) => p.facet === "model"));
    }
    s.topic.constraints = next;
    if (focus) { s.focus = focus; s.mentioned = [focus, ...s.mentioned.filter((x) => x !== focus)].slice(0, 12); }

    // ---- action
    const action: EngineAction = priceAsked && !focus ? { kind: "template", template: "price" } : this.decide(plan, s, focus, named, notes);
    if (s.pending && s.pending.expires_turn < s.turn) s.pending = null;
    return { state: s, action, notes, foreign: foreign ?? undefined };
  }

  private validValue(c: PlanConstraint, notes: string[]): boolean {
    if (c.facet === "model") {
      if (this.modelIds.has(c.value)) return true;
      notes.push(`unknown model ${c.value}`);
      return false;
    }
    const facet = this.lx.facetOf(c.value);
    if (facet === c.facet) return true;
    notes.push(`invalid concept ${c.facet}=${c.value}`);
    return false;
  }

  private decide(plan: TurnPlan, s: ConversationState, focus: string | null, named: string[], notes: string[]): EngineAction {
    const cons = s.topic.constraints;
    switch (plan.intent) {
      case "search":
      case "variant":
        if (!cons.some((c) => c.strength === "must")) {
          if (cons.some((c) => c.facet === "mood")) return { kind: "mood", constraints: cons };
          return { kind: "clarify", candidates: [], reason: "empty" };
        }
        if (cons.filter((c) => c.strength === "must").every((c) => c.facet === "style" && this.broadStyles.has(c.value ?? ""))) {
          notes.push("broad style alone → ask the furniture type");
          return { kind: "clarify", candidates: [], reason: "empty" };
        }
        return { kind: "search", constraints: cons };
      case "list":
        if (!cons.some((c) => c.facet === "category")) return { kind: "clarify", candidates: [], reason: "empty" };
        return { kind: "list", constraints: cons };
      case "alternatives":
        return focus ? { kind: "alternatives", exhibit: focus } : { kind: "clarify", candidates: s.last_cards.groups.flatMap((g) => g.items).slice(0, 4), reason: "no_focus" };
      case "recommend": {
        const seeds = [...new Set([...(focus ? [focus] : []), ...s.wishlist])];
        // anchor: the piece asked about ("¿qué combina con el sofá Camden?"), which the answer must be able to name.
        return seeds.length ? { kind: "recommend", seeds, seen: s.seen, ...(focus ? { anchor: focus } : {}) } : { kind: "clarify", candidates: [], reason: "empty" };
      }
      case "locate": {
        const target = focus ?? named[0];
        return target ? { kind: "locate", target } : { kind: "clarify", candidates: [], reason: "no_focus" };
      }
      case "detail":
        return focus ? { kind: "detail", exhibit: focus, asked: plan.detail_asked ?? [],
          fields: plan.detail_asked || plan.detail_fields.length ? plan.detail_fields : ["materials", "dimensions"] }
          : { kind: "clarify", candidates: s.last_cards.groups.flatMap((g) => g.items).slice(0, 4), reason: "no_focus" };
      case "navigate": {
        // Explicit imperative with a single, resolved destination counts as confirmation (policy D4).
        const target = plan.nav_target && this.exhibitIds.has(plan.nav_target) ? plan.nav_target : focus;
        // Same model in several places: the one the visitor has in front of them wins
        // ("llévame a la Trenta" standing next to a Trenta).
        const inView = target ? this.exhibitsOfModel(this.exhibitModel.get(target)!).find((id) => s.viewer.visible.includes(id)) : undefined;
        if (inView && inView !== target) { notes.push(`navigate: ${inView} is in view (same model as ${target})`); return { kind: "navigate", exhibit: inView }; }
        if (target && named.length > 1 && new Set(named.map((id) => this.exhibitModel.get(id))).size === 1 && !plan.nav_target) {
          return { kind: "locate", target };
        }
        if (target) {
          const siblings = this.exhibitsOfModel(this.exhibitModel.get(target)!);
          if (siblings.length > 1 && !plan.nav_target && s.focus_source !== "card_click") return { kind: "locate", target };
          return { kind: "navigate", exhibit: target };
        }
        notes.push("navigate without target");
        return { kind: "clarify", candidates: s.last_cards.groups.flatMap((g) => g.items).slice(0, 4), reason: "no_focus" };
      }
      case "confirm":
        if (s.pending?.kind === "navigate") return { kind: "navigate", exhibit: s.pending.exhibit_id };
        if (s.pending?.kind === "offer_group") return { kind: "show", exhibits: s.pending.exhibit_ids };
        if (s.pending?.kind === "disambiguate_nav" && focus) return { kind: "navigate", exhibit: focus };
        return cons.length ? { kind: "search", constraints: cons } : { kind: "template", template: "greeting" };
      case "decline":
        s.pending = null;
        return { kind: "template", template: "decline" };
      case "out_of_scope":
        return { kind: "template", template: "out_of_scope" };
      default:
        return { kind: "template", template: "smalltalk" };
    }
  }
}

/** A message that is only a yes ("sí", "dale", "sì certo", "yes please"). */
const YES = /^ (si|sí|sip|claro|dale|ok|okay|va|vale|por favor|si por favor|sí por favor|certo|si certo|va bene|yes|yes please|sure|yeah) $/;

/** Words that name each detail field ("medidas", "material", "dove si trova"…), on normalized text. */
const FIELD_WORDS: Record<string, RegExp> = {
  dimensions: / (medida|medidas|mide|miden|dimension|dimensiones|tamano|ancho|alto|largo|profundo|misure|misura|dimensioni|grande|size|dimensions|wide|tall|long|big) /,
  materials: / (material|materiales|hecho|hecha|materiale|materiali|fatto|fatta|made|materials) /,
  style: / (estilo|stile|style) /,
  shape: / (forma|shape) /,
  options: / (colores|color|acabados|acabado|opciones|tapiceria|finiture|colori|opzioni|colours|colors|finishes|options) /,
  location: / (donde|dove|where|zona|ubicacion) /,
  price: / (precio|precios|cuesta|cuestan|vale|prezzo|costa|price|cost) /,
};

/** "¿De qué color es…?" in each language, on normalized text. */
const COLOR_Q = / (que color|de que colores?|che colore|di che colore|what colou?r|which colou?r) /;

/** Words that single out one piece of a list ("este", "el primero", "quello", "the last one"). */
const POINTER = / (este|esta|ese|esa|aquel|aquella|primer|primero|primera|segundo|segunda|tercer|tercero|tercera|ultimo|ultima|questo|questa|quello|quella|primo|secondo|seconda|terzo|terza|this|that|first|second|third|last|one) /;

const PRICE = /(cu[aá]nto\s+(cuesta|cuestan|vale|valen|sale|salen)|\bprecios?\b|\bprezz[oi]\b|quanto\s+cost|how\s+much|\bprices?\b|\bcost(o|s)?\b)/i;

const NEGATORS = new Set(["no", "sin", "ni", "non", "senza", "not", "without", "except", "excepto", "tranne", "nada"]);

/** Token positions governed by a negation ("que no sea negra", "senza metallo", "not grey"): within 3 tokens after a negator. */
function negatedSpans(message: string): (tokenIndex: number) => boolean {
  const toks = normalizeText(message).split(" ");
  const neg = toks.map((t, i) => (NEGATORS.has(t) ? i : -1)).filter((i) => i >= 0);
  return (idx: number) => neg.some((n) => idx > n && idx - n <= 3);
}
