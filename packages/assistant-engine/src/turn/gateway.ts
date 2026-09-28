import type { CanonicalCatalog, Lang } from "../catalog/types.js";
import type { Lexicon } from "../ontology/lexicon.js";
import { QueryEngine } from "../engine/engine.js";
import type { Bundle, CardRef } from "../engine/types.js";
import { MemoryStateStore, newState, detectLang, foreignLang, type ConversationState, type StateStore } from "./state.js";
import { PLAN_SCHEMA, parsePlan, plannerSystemPrompt, plannerUserPrompt, type TurnPlan } from "./planner.js";
import { Reducer, type EngineAction } from "./reducer.js";
import { Renderer, type UiCard } from "./render.js";
import { Verifier, type Segment } from "./verifier.js";
import { COMPOSER_SCHEMA, COMPOSER_SYSTEM, composerUserPrompt, parseSegments, repairUserPrompt } from "./composer.js";
import { FOREIGN_OFFER, clarifyAnswer, completeObligations, fixedAnswer, navigationAnswer, oneClosingQuestion, templateAnswer } from "./templates.js";

const TRANSLATE_SYSTEM = "Translate the visitor's message to English, literally: keep every colour, material, shape and product name, add nothing. Output JSON {\"english\": \"...\"}.";
const TRANSLATE_SCHEMA = { type: "object", additionalProperties: false, required: ["english"], properties: { english: { type: "string" } } };

/** Provider seam: one JSON-structured completion. The server wires OpenAI (gpt-4o-mini today). */
export interface LlmJsonClient {
  readonly model: string;
  json(req: { system: string; user: string; schemaName: string; schema: object; maxTokens: number }): Promise<{
    text: string; usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number }; latency_ms: number;
  }>;
}

export interface TurnRequest {
  session_id: string;
  message: string;
  history: { role: "user" | "assistant"; text: string }[];
  wishlist: string[];
  viewer?: { media_name: string | null; centered: string | null; visible: string[] };
  /** A card click ("Ver alternativas", "Llévame") that the widget reports as context. */
  clicked?: { exhibit_id: string; action: "alternatives" | "take_me" | "sheet" };
}

export interface TurnTrace {
  plan: TurnPlan | null;
  reducer_notes: string[];
  action: EngineAction["kind"];
  bundle: { outcome: string; groups: { id: string; role: string; cards: string[] }[]; obligations: string[] } | null;
  composer: { attempts: number; violations: string[][]; template_used: boolean; completed_by_code: boolean };
  usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number; llm_calls: number };
  latency_ms: { planner: number; composer: number; total: number };
}

export interface TurnResult {
  reply: string;
  lang: Lang;
  cards: UiCard[];
  navigate: UiCard["navTarget"] | null;
  trace: TurnTrace;
}

export class TurnGateway {
  readonly engine: QueryEngine;
  readonly reducer: Reducer;
  readonly renderer: Renderer;
  readonly verifier: Verifier;
  private plannerSystem: string;

  constructor(readonly catalog: CanonicalCatalog, readonly lx: Lexicon, private llm: LlmJsonClient | null, readonly store: StateStore = new MemoryStateStore()) {
    this.engine = new QueryEngine(catalog, lx);
    this.reducer = new Reducer(catalog, lx);
    this.renderer = new Renderer(catalog, lx);
    this.verifier = new Verifier(catalog, lx);
    this.plannerSystem = plannerSystemPrompt(catalog, lx);
  }

  async turn(req: TurnRequest): Promise<TurnResult> {
    const t0 = Date.now();
    const usage = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, llm_calls: 0 };
    const addUsage = (u: { input_tokens: number; cached_input_tokens: number; output_tokens: number }) => {
      usage.input_tokens += u.input_tokens; usage.cached_input_tokens += u.cached_input_tokens; usage.output_tokens += u.output_tokens; usage.llm_calls++;
    };
    const prev = this.store.get(req.session_id) ?? newState(req.session_id, detectLang(req.message, "it"));
    prev.wishlist = req.wishlist.filter((id) => this.renderer.exhibit(id));
    if (req.viewer) prev.viewer = req.viewer;
    if (req.clicked && this.renderer.exhibit(req.clicked.exhibit_id)) {
      prev.focus = req.clicked.exhibit_id; prev.focus_source = "card_click";
      prev.mentioned = [req.clicked.exhibit_id, ...prev.mentioned.filter((x) => x !== req.clicked!.exhibit_id)];
    }

    // 0) a language the assistant does not speak: the turn runs on an English translation (the lexicon
    //    and the planner understand English; a German colour word would otherwise be lost).
    let plannerMs = 0;
    const foreignIn = foreignLang(req.message);
    let message = req.message;
    if (foreignIn && this.llm) {
      try {
        const r = await this.llm.json({ system: TRANSLATE_SYSTEM, user: req.message, schemaName: "translation", schema: TRANSLATE_SCHEMA, maxTokens: 200 });
        plannerMs += r.latency_ms; addUsage(r.usage);
        const t = (JSON.parse(r.text) as { english?: string }).english?.trim();
        if (t) message = t;
      } catch { /* keep the original: the reducer still answers in English with the offer */ }
    }

    // 1) plan (LLM) — degraded lexicon plan when no LLM / failure
    let plan: TurnPlan | null = null;
    if (this.llm) {
      try {
        const r = await this.llm.json({
          system: this.plannerSystem, user: plannerUserPrompt(prev, req.history, message, (id) => this.renderer.exhibit(id)?.name ?? id),
          schemaName: "turn_plan", schema: PLAN_SCHEMA, maxTokens: 500,
        });
        plannerMs += r.latency_ms; addUsage(r.usage); plan = parsePlan(r.text);
      } catch { plan = null; }
    }
    plan ??= this.degradedPlan(message, prev);

    // 2) reduce (code) → action
    const { state, action, notes, foreign } = this.reducer.reduce(prev, plan, message, foreignIn);
    if (message !== req.message) notes.unshift(`translated: "${message}"`);
    const lang = state.lang;

    // 3) engine
    let bundle: Bundle | null = null;
    let fixed: Segment[] | null = null;
    let navigate: UiCard["navTarget"] | null = null;
    switch (action.kind) {
      case "search": bundle = this.engine.search(action.constraints); break;
      case "mood": bundle = this.engine.moodSearch(action.constraints, this.lx.pack.moods); break;
      case "list": bundle = this.engine.list(action.constraints); break;
      case "alternatives": bundle = this.engine.alternatives(action.exhibit); break;
      case "recommend": bundle = this.engine.recommend(action.seeds, action.seen); break;
      case "locate": bundle = this.engine.locate(action.target); break;
      case "detail": bundle = this.engine.detail(action.exhibit, action.fields); break;
      case "navigate": {
        bundle = this.showBundle([action.exhibit], "locate");
        fixed = navigationAnswer(action.exhibit, lang);
        const vp = this.catalog.viewpoints.find((v) => v.exhibit_id === action.exhibit)!;
        navigate = { media_name: vp.media_name, yaw: vp.yaw, pitch: vp.pitch, fov: vp.fov, hotspot_name: vp.hotspot_name };
        state.focus = action.exhibit; state.focus_source = "navigation";
        break;
      }
      case "show": {
        const offered = state.pending?.kind === "offer_group" && state.pending.cards?.length
          && state.pending.exhibit_ids.join() === action.exhibits.join() ? state.pending.cards : null;
        bundle = offered ? this.offerBundle(offered) : this.showBundle(action.exhibits, "list");
        break;
      }
      case "clarify": bundle = this.showBundle(action.candidates, "list"); fixed = clarifyAnswer(action.candidates, lang, action.reason); break;
      case "template": fixed = fixedAnswer(action.template, lang); break;
    }

    // 4) compose (LLM) → verify → repair once → template
    let segments: Segment[] = fixed ?? [];
    const violations: string[][] = [];
    let attempts = 0, templateUsed = false, composerMs = 0, completedByCode = false;
    if (!fixed && bundle) {
      const view = this.renderer.composerView(bundle, lang);
      if (this.llm) {
        let user = composerUserPrompt(view, lang, message);
        for (attempts = 1; attempts <= 2; attempts++) {
          try {
            const r = await this.llm.json({ system: COMPOSER_SYSTEM, user, schemaName: "answer", schema: COMPOSER_SCHEMA, maxTokens: 700 });
            composerMs += r.latency_ms; addUsage(r.usage);
            const parsed = parseSegments(r.text);
            if (!parsed) { violations.push(["JSON inválido"]); continue; }
            const segs = parsed.map((sg) => ({ ...sg, text: this.autoTag(sg.text, bundle!) }));
            const verdict = this.verifier.verify(segs, bundle, lang);
            if (verdict.ok) { segments = segs; break; }
            // Cheap fix first: a forgotten link. Anything else goes back to the LLM once; full
            // completion by code is the last resort before the template (it can duplicate prose).
            const completed = completeObligations(segs, bundle, lang, attempts === 1);
            if (completed && this.verifier.verify(completed, bundle, lang).ok) { segments = completed; completedByCode = true; break; }
            violations.push(verdict.violations);
            user = repairUserPrompt(view, lang, req.message, segs, verdict.violations);
          } catch (err) {
            violations.push([`error del proveedor: ${(err as Error).message}`]);
            break;
          }
        }
      }
      if (!segments.length) { segments = templateAnswer(bundle, lang, this.renderer); templateUsed = true; }
    }

    // 5) render + state bookkeeping
    let reply = segments.map((s) => this.renderer.renderTags(s.text, bundle ?? this.emptyBundle(), lang)).join(" ").replace(/\s+/g, " ").trim()
      .replace(/\b([\p{L}][\p{L} ]{2,40}?) \(\1\)/giu, "$1");   // "warm grey (warm grey)": the tag plus the value written by hand
    reply = oneClosingQuestion(reply);
    if (foreign && !state.langs_offered) { reply = `${FOREIGN_OFFER} ${reply}`; state.langs_offered = true; }
    const cards = bundle && action.kind !== "template" ? this.renderer.uiCards(bundle, lang) : [];
    if (bundle && cards.length) {
      state.last_cards = { turn: state.turn, groups: bundle.groups.map((g) => ({ id: g.id, role: g.role, items: g.cards.map((c) => c.exhibit_id) })) };
      const shown = cards.map((c) => c.product_id);
      state.mentioned = [...new Set([...(state.focus ? [state.focus] : []), ...shown, ...state.mentioned])].slice(0, 12);
      state.seen = [...new Set([...state.seen, ...shown])];
      if (cards.length === 1) { state.focus = cards[0].product_id; state.focus_source = state.focus_source ?? "mention"; }
      const off = bundle.groups.find((g) => bundle!.obligations.includes(`off:${g.id}`));
      if (off) state.pending = { kind: "offer_group", exhibit_ids: off.cards.map((c) => c.exhibit_id), cards: off.cards, expires_turn: state.turn + 1 };
      else if (bundle.obligations.includes("nav:ask")) state.pending = { kind: "disambiguate_nav", exhibit_ids: bundle.groups[0].cards.map((c) => c.exhibit_id), expires_turn: state.turn + 1 };
      else if (action.kind !== "navigate") state.pending = null;
    }
    this.store.set(state);

    return {
      reply, lang, cards, navigate,
      trace: {
        plan, reducer_notes: notes, action: action.kind,
        bundle: bundle ? { outcome: bundle.outcome, groups: bundle.groups.map((g) => ({ id: g.id, role: g.role, cards: g.cards.map((c) => c.exhibit_id) })), obligations: bundle.obligations } : null,
        composer: { attempts, violations, template_used: templateUsed, completed_by_code: completedByCode },
        usage, latency_ms: { planner: plannerMs, composer: composerMs, total: Date.now() - t0 },
      },
    };
  }

  /**
   * Small models sometimes type a product name instead of its tag. When that name belongs to a
   * piece of THIS answer's bundle, tagging it is lossless (the tag renders the same name);
   * names of pieces outside the bundle stay raw and the verifier rejects them.
   */
  autoTag(text: string, bundle: Bundle): string {
    let out = text;
    const seen = new Set<string>();
    for (const g of bundle.groups) for (const c of g.cards) {
      const name = this.renderer.displayName(c.exhibit_id);
      if (!name || seen.has(name.toLowerCase()) || name.length < 3) continue;
      seen.add(name.toLowerCase());
      const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(?<![\\w{:])(\\*\\*)?${esc}(\\*\\*)?(?![\\w}])`, "gi");
      out = out.split(/(\{\{[^}]+\}\})/).map((part) => (part.startsWith("{{") ? part : part.replace(re, `{{p:${c.exhibit_id}}}`))).join("");
    }
    // A name that is also the kind of piece ("Boiserie (boiserie)") ends up tagged twice: keep one.
    return out.replace(/\{\{p:([^}]+)\}\}\s*\(\{\{p:\1\}\}\)/g, "{{p:$1}}");
  }

  /** No LLM (provider down): lexicon-only plan. Correct by construction, less flexible. */
  private degradedPlan(message: string, state: ConversationState): TurnPlan {
    const hits = this.lx.match(message, ["category", "shape", "material", "color", "style"]);
    const named = this.reducer.namedModels(message);
    return {
      lang: detectLang(message, state.lang), intent: hits.length ? "search" : named.length ? "locate" : "smalltalk",
      topic: "continue", refs: [], focus: named.length ? this.reducer.exhibitsOfModel(named[0])[0] ?? null : null,
      add: hits.map((h) => ({ facet: h.facet as never, op: "is" as const, value: h.concept, emphasis: "normal" as const })),
      remove: [], linked_ref: null, detail_fields: [], nav_target: null, unknown_terms: [],
    };
  }

  private showBundle(ids: string[], mode: "list" | "locate"): Bundle {
    const cards: CardRef[] = ids.map((id) => this.renderer.exhibit(id)).filter((e): e is NonNullable<typeof e> => !!e)
      .map((e) => ({ exhibit_id: e.id, model_id: e.model_id, availability: "exhibited" as const, match: {}, evidence: [], shown_as: this.engine.shownAs(e) }));
    return { query_id: "show", mode, constraints: [], outcome: mode === "list" ? "list" : "locate", groups: cards.length ? [{ id: "g1", role: mode, relaxation: [], cards, total: cards.length }] : [], obligations: [], available_values: [] };
  }

  /** The visitor accepted an offered group: show it as an exact answer, keeping how each piece qualified. */
  private offerBundle(cards: CardRef[]): Bundle {
    const by = (a: CardRef["availability"]) => cards.filter((c) => c.availability === a);
    const [T1, T2, L, U] = [by("exhibited"), by("on_order"), by("line"), by("unknown")];
    const groups: Bundle["groups"] = [];
    const add = (role: Bundle["groups"][number]["role"], cs: CardRef[]) => { if (cs.length) groups.push({ id: `g${groups.length + 1}`, role, relaxation: [], cards: cs, total: cs.length }); };
    add("exact_exhibited", T1); add("exact_on_order", T2); add("line_on_order", L); add("unknown", U);
    const obligations = [...T2.slice(0, T1.length ? 2 : 3).map((c) => `ord:${c.exhibit_id}`), ...L.slice(0, 2).map((c) => `lin:${c.exhibit_id}`)];
    const outcome = T1.length ? "exact" : T2.length ? "on_order_only" : L.length ? "line_only" : "unknown_only";
    return { query_id: "offer", mode: "search", constraints: [], outcome, groups, obligations, available_values: [] };
  }

  private emptyBundle(): Bundle {
    return { query_id: "none", mode: "search", constraints: [], outcome: "not_found", groups: [], obligations: [], available_values: [] };
  }
}
