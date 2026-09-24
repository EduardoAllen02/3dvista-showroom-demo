import type { CanonicalCatalog, ConceptId, ConfiguredComponent, Exhibit, Model, Option, OptionGroup } from "../catalog/types.js";
import type { Lexicon } from "../ontology/lexicon.js";
import {
  DEFAULT_POLICY, type ActiveConstraint, type Bundle, type CardGroup, type CardRef, type MatchMark, type Outcome,
  type RelaxOp, type RelaxPolicy, type Tri, type Variant,
} from "./types.js";

/**
 * Deterministic query engine (docs/chatbot-v2/02-arquitectura-clean-room.md §6).
 * Exhaustive tri-state evaluation over every exhibit and every model's official
 * options, tiers (exhibited → on order → unknown), and cost-based hierarchical
 * relaxation. No LLM here: same constraints ⇒ same bundle, checkable by an oracle.
 */

const ROLE_FACETS = new Set(["color", "material", "tone"]);
const COMPLEMENTS: Record<string, ConceptId[]> = {
  "category.sofa": ["category.coffee_table", "category.armchair", "category.pouf"],
  "category.armchair": ["category.sofa", "category.coffee_table", "category.pouf"],
  "category.pouf": ["category.sofa", "category.armchair"],
  "category.coffee_table": ["category.sofa", "category.armchair"],
  "category.table": ["category.chair", "category.sideboard"],
  "category.chair": ["category.table"],
  "category.stool": ["category.kitchen", "category.table"],
  "category.kitchen": ["category.stool", "category.table"],
  "category.bed": ["category.night_group", "category.wardrobe"],
  "category.night_group": ["category.bed", "category.wardrobe"],
  "category.wardrobe": ["category.bed", "category.night_group", "category.walk_in_closet"],
  "category.walk_in_closet": ["category.wardrobe", "category.drawer_unit"],
  "category.sideboard": ["category.table", "category.modular_system"],
  "category.bookcase": ["category.modular_system", "category.boiserie"],
  "category.modular_system": ["category.bookcase", "category.boiserie", "category.sofa"],
  "category.boiserie": ["category.modular_system", "category.sofa"],
};

export class QueryEngine {
  readonly exhibits: Map<string, Exhibit>;
  readonly models: Map<string, Model>;
  private queryCounter = 0;

  constructor(readonly catalog: CanonicalCatalog, readonly lx: Lexicon, readonly policy: RelaxPolicy = DEFAULT_POLICY) {
    this.exhibits = new Map(catalog.exhibits.map((e) => [e.id, e]));
    this.models = new Map(catalog.models.map((m) => [m.id, m]));
  }

  // ------------------------------------------------------------------ tri-state primitives
  private dominant(e: Exhibit): ConfiguredComponent[] {
    return e.configuration.status === "known" ? e.configuration.value.filter((c) => c.dominant) : [];
  }

  private anyIsA(values: ConceptId[], target: ConceptId): boolean {
    return values.some((v) => this.lx.isA(v, target));
  }

  private harmonizes(a: ConceptId[], b: ConceptId[]): boolean {
    for (const x of a) for (const y of b) {
      if (this.lx.neighbours(x, "harmonizes").some((n) => this.lx.isA(y, n.to) && (n.status === "signed" || this.policy.allow_draft_harmonies))) return true;
    }
    return false;
  }

  private invert(t: Tri, c: ActiveConstraint): Tri {
    if (c.op !== "not" || t === "unknown") return t;
    return t === "yes" ? "no" : "yes";
  }

  /** Does the exhibited piece itself satisfy c? */
  satExhibit(e: Exhibit, c: ActiveConstraint): Tri {
    if (c.strength === "prefer") return "yes";
    const v = c.value ?? "";
    let t: Tri;
    switch (c.facet) {
      case "category": t = this.lx.isA(e.category, v) ? "yes" : "no"; break;
      case "model": t = e.model_id === v ? "yes" : "no"; break;
      case "zone": t = e.zone === v ? "yes" : "no"; break;
      case "shape": t = e.shape_as_shown.status === "known" ? (this.anyIsA(e.shape_as_shown.value, v) ? "yes" : "no") : "unknown"; break;
      case "style": t = e.styles.status === "known" ? (this.anyIsA(e.styles.value, v) ? "yes" : "no") : "unknown"; break;
      case "color": {
        if (c.op === "harmonizes_with") {
          const ref = c.ref ? this.exhibits.get(c.ref) : undefined;
          const mine = this.dominant(e).flatMap((d) => d.color_family);
          const theirs = ref ? this.dominant(ref).flatMap((d) => d.color_family) : [];
          t = !mine.length || !theirs.length ? "unknown" : this.harmonizes(mine, theirs) ? "yes" : "no";
          return t;
        }
        const fams = this.dominant(e).flatMap((d) => d.color_family);
        t = fams.length ? (this.anyIsA(fams, v) ? "yes" : "no") : "unknown";
        break;
      }
      case "material": {
        const comps = e.configuration.status === "known" ? e.configuration.value : [];
        const mats = comps.map((d) => d.material).filter((m): m is ConceptId => !!m);
        t = mats.length ? (this.anyIsA(mats, v) ? "yes" : "no") : "unknown";
        break;
      }
      case "tone": {
        const obs = this.dominant(e).map((d) => d.observed_color ?? "").join(" ");
        const tones = this.lx.match(obs, ["tone"]).map((m) => m.concept);
        t = tones.length ? (tones.includes(v) ? "yes" : "no") : "unknown";
        break;
      }
      default: t = "unknown";
    }
    return this.invert(t, c);
  }

  /** Exhibit-level facets for an on-order card: the physical composition can be re-ordered in another finish. */
  private satExhibitShape(e: Exhibit, m: Model, c: ActiveConstraint): Tri {
    const own = this.satExhibit(e, c);
    if (own === "yes" || c.op === "not") return own;
    if (m.shapes.status === "known" && this.anyIsA(m.shapes.value, c.value ?? "")) return "yes";
    return own;
  }

  private optionMaterial(g: OptionGroup, o: Option): ConceptId | null {
    return o.material ?? g.material;
  }

  /**
   * Options of model m (assertable lists only: the model's own lists or options stated in
   * its page text) that satisfy ALL role-level constraints with the same option.
   */
  modelOptions(m: Model, roleCs: ActiveConstraint[]): { tri: Tri; variants: Variant[] } {
    const assertable = m.option_groups.filter((g) => g.scope !== "generic_palette" && g.options.length);
    if (!assertable.length) return { tri: "unknown", variants: [] };
    const variants: Variant[] = [];
    for (const g of assertable) {
      const ok = g.options.filter((o) => roleCs.every((c) => {
        let t: boolean;
        if (c.facet === "material") { const mat = this.optionMaterial(g, o); t = !!mat && this.lx.isA(mat, c.value ?? ""); }
        else if (c.facet === "color") t = this.anyIsA(o.color_family, c.value ?? "");
        else if (c.facet === "tone") t = o.tone === (c.value ?? "").replace("tone.", "");
        else t = true;
        return c.op === "not" ? !t : t;
      }));
      if (ok.length) variants.push({ group_id: g.id, group_name: g.name, option_ids: ok.map((o) => o.id), option_names: ok.map((o) => o.official_name) });
    }
    if (variants.length) return { tri: "yes", variants };
    return { tri: m.options_complete ? "no" : "unknown", variants: [] };
  }

  // ------------------------------------------------------------------ evaluation
  evaluate(cs: ActiveConstraint[]): { T1: CardRef[]; T2: CardRef[]; U: CardRef[] } {
    const must = cs.filter((c) => c.strength === "must");
    const roleCs = must.filter((c) => ROLE_FACETS.has(c.facet) && c.op !== "harmonizes_with");
    const T1: CardRef[] = [], U: CardRef[] = [];
    const t1Models = new Set<string>();
    const exhibitMarks = new Map<string, Record<string, MatchMark>>();

    for (const e of this.exhibits.values()) {
      const match: Record<string, MatchMark> = {};
      for (const c of must) match[c.id] = this.satExhibit(e, c);
      exhibitMarks.set(e.id, match);
      const marks = Object.values(match);
      if (marks.every((m) => m === "yes")) {
        T1.push(this.card(e, "exhibited", match));
        t1Models.add(e.model_id);
      }
    }

    const T2: CardRef[] = [];
    const t2Models = new Set<string>();
    if (roleCs.length) {
      for (const e of this.exhibits.values()) {
        const m = this.models.get(e.model_id);
        if (!m || t1Models.has(m.id) || t2Models.has(m.id)) continue;
        const match: Record<string, MatchMark> = {};
        let ok = true;
        for (const c of must) {
          if (roleCs.includes(c)) continue;
          const t = c.facet === "shape" || c.facet === "style" ? this.satExhibitShape(e, m, c) : this.satExhibit(e, c);
          match[c.id] = t;
          if (t !== "yes") ok = false;
        }
        if (!ok) continue;
        const own = roleCs.map((c) => this.satExhibit(e, c));
        if (own.every((t) => t === "yes")) continue; // would be T1
        const opt = this.modelOptions(m, roleCs);
        if (opt.tri !== "yes") continue;
        for (const c of roleCs) match[c.id] = "yes";
        T2.push({ ...this.card(e, "on_order", match), variants: opt.variants, shown_as: this.shownAs(e) });
        t2Models.add(m.id);
      }
    }

    for (const e of this.exhibits.values()) {
      if (t1Models.has(e.model_id) || t2Models.has(e.model_id)) continue;
      const match = exhibitMarks.get(e.id)!;
      const marks = Object.values(match);
      if (marks.includes("no") || !marks.includes("unknown")) continue;
      U.push(this.card(e, "unknown", match));
    }
    const order = (a: CardRef, b: CardRef) => a.exhibit_id.localeCompare(b.exhibit_id);
    return { T1: T1.sort(order), T2: T2.sort(order), U: U.sort(order) };
  }

  private card(e: Exhibit, availability: CardRef["availability"], match: Record<string, MatchMark>): CardRef {
    const evidence = [
      ...(e.configuration.status === "known" ? e.configuration.facts : []),
      ...(e.shape_as_shown.status === "known" ? e.shape_as_shown.facts : []),
    ];
    return { exhibit_id: e.id, model_id: e.model_id, availability, match, evidence, shown_as: this.shownAs(e) };
  }

  shownAs(e: Exhibit): string | null {
    return this.dominant(e).map((d) => d.observed_color).filter(Boolean).join(", ") || null;
  }

  // ------------------------------------------------------------------ search + relaxation
  weight(c: ActiveConstraint): number {
    if (c.facet === "category") return this.policy.base_weight.category;
    return this.policy.base_weight[c.facet] * this.policy.role_factor[c.role] * this.policy.emphasis_factor[c.emphasis];
  }

  private relaxOps(cs: ActiveConstraint[]): RelaxOp[] {
    const ops: RelaxOp[] = [];
    for (const c of cs) {
      if (c.strength !== "must" || c.op === "harmonizes_with") continue;
      const w = this.weight(c);
      const v = c.value ?? "";
      if (c.op === "is" && v) {
        if (c.facet === "color") {
          for (const n of this.lx.neighbours(v, "harmonizes")) {
            if (n.status === "draft" && !this.policy.allow_draft_harmonies) continue;
            ops.push({ kind: "substitute", constraint: c.id, to: n.to, via: "harmonizes", relation_status: n.status as "draft" | "signed", cost: w * n.distance });
          }
        }
        if (["color", "material", "shape", "style", "category"].includes(c.facet)) {
          for (const n of this.lx.neighbours(v, "near")) {
            ops.push({ kind: "substitute", constraint: c.id, to: n.to, via: c.facet === "category" ? "sibling" : "near", relation_status: "signed", cost: w * n.distance });
          }
        }
      }
      if (c.facet !== "category") ops.push({ kind: "drop", constraint: c.id, cost: c.facet === "model" ? w * 0.1 : w });
    }
    return ops.sort((a, b) => a.cost - b.cost);
  }

  private applyOps(cs: ActiveConstraint[], ops: RelaxOp[]): ActiveConstraint[] {
    const out: ActiveConstraint[] = [];
    for (const c of cs) {
      const op = ops.find((o) => o.constraint === c.id);
      if (!op) out.push(c);
      else if (op.kind === "substitute") out.push({ ...c, value: op.to });
    }
    return out;
  }

  search(cs: ActiveConstraint[]): Bundle {
    const qid = `q${++this.queryCounter}`;
    const raw = this.evaluate(cs);
    // Presentation: one card per (model, look) — two identical exhibits of the same model add nothing.
    const T1 = dedupeByModel(raw.T1), T2 = raw.T2, U = dedupeByModel(raw.U);
    const groups: CardGroup[] = [];
    const obligations: string[] = [];
    let gi = 0;
    const cap = this.policy.max_cards;
    if (T1.length) groups.push({ id: `g${++gi}`, role: "exact_exhibited", relaxation: [], cards: T1.slice(0, cap), total: T1.length });
    if (T2.length) {
      groups.push({ id: `g${++gi}`, role: "exact_on_order", relaxation: [], cards: T2.slice(0, cap), total: T2.length });
      for (const c of T2.slice(0, cap)) obligations.push(`ord:${c.exhibit_id}`);
    }
    const unknownFacets = new Set(U.flatMap((c) => Object.entries(c.match).filter(([, m]) => m === "unknown").map(([id]) => cs.find((x) => x.id === id)?.facet)));
    const concreteUnknown = [...unknownFacets].every((f) => f === "color" || f === "material" || f === "shape");
    if (U.length && concreteUnknown && U.length <= 4 && (T1.length + T2.length === 0 || (T1.length + T2.length <= 1 && U.length <= 3))) {
      groups.push({ id: `g${++gi}`, role: "unknown", relaxation: [], cards: U.slice(0, cap), total: U.length });
      for (const c of U.slice(0, cap)) obligations.push(`unk:${c.exhibit_id}`);
    }
    const outcome: Outcome = T1.length ? "exact" : T2.length ? "on_order_only" : groups.some((g) => g.role === "unknown") ? "unknown_only" : "no_exact";
    if (outcome !== "exact") obligations.push(`abs:${qid}`);

    const physicalOnly = !T1.length && T2.length > 0 && this.policy.show_physical_when_only_on_order;
    const needRelax = (!T1.length && !T2.length) || physicalOnly;
    const available: Bundle["available_values"] = [];

    if (needRelax) {
      const shown = new Set([...T1, ...T2, ...U].map((c) => c.exhibit_id));
      const candidates = this.relaxCandidates(cs, physicalOnly, shown);
      const newCs = cs.filter((c) => c.role === "new" && c.facet !== "category" && c.strength === "must");
      const keepsNew = (k: RelaxCandidate) => newCs.every((c) => !k.ops.some((o) => o.constraint === c.id));
      // Only on-order matches: the on-order cards already keep the frame; what is missing is
      // something PHYSICAL in what was just asked (e.g. the yellow) → keep-new group only.
      const g1 = physicalOnly ? undefined : candidates[0];
      const g2 = candidates.find((k) => k !== g1 && keepsNew(k) && !sameItems(k.cards, g1?.cards ?? []));
      const picked = [g1, g2].filter((x): x is RelaxCandidate => !!x);
      picked.forEach((k, i) => {
        const id = `g${++gi}`;
        const role = k === g2 ? "alt_keep_new" : "alt_keep_frame";
        groups.push({ id, role, relaxation: k.ops, cards: k.cards.slice(0, cap), total: k.cards.length });
        obligations.push(role === "alt_keep_frame" ? `grp:${id}` : `off:${id}`);
        for (const op of k.ops) if (op.via === "harmonizes") obligations.push(`harm:${cs.find((c) => c.id === op.constraint)?.value}>${op.to}`);
      });
      // A requested value with zero support among the pieces of the same category: list real values.
      for (const c of newCs) {
        if (c.op !== "is" || !["color", "material", "shape", "style"].includes(c.facet)) continue;
        const scope = cs.filter((x) => x.facet === "category" || x.facet === "model");
        const probe = this.evaluate([...scope, c]);
        if (!probe.T1.length && !probe.T2.length) {
          available.push({ constraint: c.id, facet: c.facet, values: this.valuesInScope(c.facet, scope) });
          obligations.push(`vals:${c.id}`);
        }
      }
    }
    return { query_id: qid, mode: "search", constraints: cs, outcome, groups, obligations, available_values: available };
  }

  private relaxCandidates(cs: ActiveConstraint[], physicalOnly: boolean, exclude: Set<string>): RelaxCandidate[] {
    const ops = this.relaxOps(cs);
    const combos: RelaxOp[][] = ops.map((o) => [o]);
    for (let i = 0; i < ops.length; i++) for (let j = i + 1; j < ops.length; j++) {
      if (ops[i].constraint !== ops[j].constraint) combos.push([ops[i], ops[j]]);
    }
    combos.sort((a, b) => sum(a) - sum(b));
    const out: RelaxCandidate[] = [];
    for (const combo of combos) {
      const cost = sum(combo);
      if (cost > this.policy.max_cost) break;
      const relaxed = this.applyOps(cs, combo);
      const r = this.evaluate(relaxed);
      const pool = physicalOnly ? dedupeByModel(r.T1) : [...dedupeByModel(r.T1), ...r.T2];
      const cards = pool.filter((c) => !exclude.has(c.exhibit_id)).map((c) => this.markRelaxed(c, cs, combo));
      if (!cards.length) continue;
      // Same cost + same relaxed constraint (e.g. leather → nubuck | faux leather) merge into one group.
      const twin = out.find((k) => k.cost === cost && k.ops.length === 1 && combo.length === 1 && k.ops[0].constraint === combo[0].constraint && k.ops[0].kind === combo[0].kind);
      if (twin) {
        twin.ops.push(...combo);
        for (const c of cards) if (!twin.cards.some((x) => x.exhibit_id === c.exhibit_id)) twin.cards.push(c);
        continue;
      }
      out.push({ ops: [...combo], cost, cards });
      if (out.length >= this.policy.max_candidates) break;
    }
    return out;
  }

  private markRelaxed(card: CardRef, original: ActiveConstraint[], ops: RelaxOp[]): CardRef {
    const e = this.exhibits.get(card.exhibit_id)!;
    const match: Record<string, MatchMark> = {};
    for (const c of original) {
      const op = ops.find((o) => o.constraint === c.id);
      if (!op) match[c.id] = card.match[c.id] ?? this.satExhibit(e, c);
      else if (op.kind === "drop") match[c.id] = this.satExhibit(e, c) === "yes" ? "yes" : "drop";
      else match[c.id] = `sub:${op.to}`;
    }
    return { ...card, match };
  }

  valuesInScope(facet: ActiveConstraint["facet"], scope: ActiveConstraint[]): ConceptId[] {
    const vals = new Set<ConceptId>();
    for (const e of this.exhibits.values()) {
      if (!scope.every((c) => this.satExhibit(e, c) === "yes")) continue;
      const comps = e.configuration.status === "known" ? e.configuration.value : [];
      if (facet === "color") comps.filter((d) => d.dominant).forEach((d) => d.color_family.forEach((f) => vals.add(topFamily(this.lx, f))));
      if (facet === "material") comps.forEach((d) => d.material && vals.add(d.material));
      if (facet === "shape" && e.shape_as_shown.status === "known") e.shape_as_shown.value.forEach((s) => vals.add(s));
      if (facet === "style" && e.styles.status === "known") e.styles.value.forEach((s) => vals.add(s));
      const m = this.models.get(e.model_id);
      if (m) for (const g of m.option_groups) {
        if (g.scope === "generic_palette") continue;
        if (facet === "color") g.options.forEach((o) => o.color_family.forEach((f) => vals.add(topFamily(this.lx, f))));
        if (facet === "material") { if (g.material) vals.add(g.material); g.options.forEach((o) => o.material && vals.add(o.material)); }
      }
    }
    return [...vals].sort();
  }

  // ------------------------------------------------------------------ other modes
  list(cs: ActiveConstraint[]): Bundle {
    const qid = `q${++this.queryCounter}`;
    const { T1, T2, U } = this.evaluate(cs);
    const all = [...T1, ...U];
    const cards = all.slice(0, this.policy.list_max_cards);
    const groups: CardGroup[] = all.length ? [{ id: "g1", role: "list", relaxation: [], cards, total: all.length }] : [];
    if (T2.length) groups.push({ id: "g2", role: "exact_on_order", relaxation: [], cards: T2.slice(0, this.policy.max_cards), total: T2.length });
    return {
      query_id: qid, mode: "list", constraints: cs, outcome: all.length || T2.length ? "list" : "empty_list", groups,
      obligations: T2.slice(0, this.policy.max_cards).map((c) => `ord:${c.exhibit_id}`),
      available_values: [],
    };
  }

  alternatives(exhibitId: string): Bundle {
    const qid = `q${++this.queryCounter}`;
    const src = this.exhibits.get(exhibitId);
    if (!src) return notFound(qid, "alternatives");
    const srcModel = this.models.get(src.model_id);
    const srcDom = this.dominant(src);
    const scored: { card: CardRef; score: number }[] = [];
    for (const e of this.exhibits.values()) {
      if (e.id === exhibitId) continue;
      const sameCat = this.lx.isA(e.category, src.category) || this.lx.isA(src.category, e.category);
      const nearCat = this.lx.neighbours(src.category, "near").some((n) => this.lx.isA(e.category, n.to));
      if (!sameCat && !nearCat) continue;
      let score = sameCat ? 10 : 0;
      const shared: Record<string, MatchMark> = {};
      if (e.model_id === src.model_id) { score += 5; shared["model"] = "yes"; }
      const eDom = this.dominant(e);
      const colorShared = srcDom.some((d) => d.color_family.some((f) => eDom.some((x) => x.color_family.some((g) => topFamily(this.lx, g) === topFamily(this.lx, f)))));
      if (colorShared) { score += 2; shared["color"] = "yes"; }
      const matShared = srcDom.some((d) => d.material && eDom.some((x) => x.material && (this.lx.isA(x.material, d.material!) || this.lx.isA(d.material!, x.material))));
      if (matShared) { score += 2; shared["material"] = "yes"; }
      const eShapes = e.shape_as_shown.status === "known" ? e.shape_as_shown.value : [];
      if (src.shape_as_shown.status === "known" && src.shape_as_shown.value.some((s) => eShapes.includes(s))) { score += 2; shared["shape"] = "yes"; }
      const eModel = this.models.get(e.model_id);
      if (srcModel?.styles.status === "known" && eModel?.styles.status === "known" && srcModel.styles.value.some((s) => eModel.styles.status === "known" && eModel.styles.value.includes(s))) { score += 1; shared["style"] = "yes"; }
      scored.push({ card: this.card(e, "exhibited", shared), score });
    }
    scored.sort((a, b) => b.score - a.score || a.card.exhibit_id.localeCompare(b.card.exhibit_id));
    const cards = dedupeByModel(scored.map((s) => s.card)).slice(0, this.policy.max_cards);
    return {
      query_id: qid, mode: "alternatives", constraints: [], outcome: cards.length ? "alternatives" : "not_found",
      groups: cards.length ? [{ id: "g1", role: "alternatives", relaxation: [], cards, total: scored.length }] : [], obligations: [], available_values: [],
    };
  }

  recommend(seedIds: string[], seen: string[] = []): Bundle {
    const qid = `q${++this.queryCounter}`;
    const seeds = seedIds.map((id) => this.exhibits.get(id)).filter((e): e is Exhibit => !!e);
    if (!seeds.length) return notFound(qid, "recommend");
    const scored: { card: CardRef; score: number }[] = [];
    for (const e of this.exhibits.values()) {
      if (seedIds.includes(e.id) || seen.includes(e.id)) continue;
      let score = 0;
      const why: Record<string, MatchMark> = {};
      for (const s of seeds) {
        if (s.co_exhibited_with.includes(e.id)) { score += 3; why["co_exhibited"] = "yes"; }
        if ((COMPLEMENTS[s.category] ?? []).some((c) => this.lx.isA(e.category, c))) { score += 2; why["complement"] = "yes"; }
        const sm = this.models.get(s.model_id), em = this.models.get(e.model_id);
        if (sm?.styles.status === "known" && em?.styles.status === "known" && sm.styles.value.some((x) => em.styles.status === "known" && em.styles.value.includes(x))) { score += 2; why["style"] = "yes"; }
        const sf = this.dominant(s).flatMap((d) => d.color_family), ef = this.dominant(e).flatMap((d) => d.color_family);
        if (sf.length && ef.length && this.harmonizes(ef, sf)) { score += 1; why["harmony"] = "yes"; }
      }
      if (score > 0) scored.push({ card: this.card(e, "exhibited", why), score });
    }
    scored.sort((a, b) => b.score - a.score || a.card.exhibit_id.localeCompare(b.card.exhibit_id));
    const cards = dedupeByModel(scored.map((s) => s.card)).slice(0, 6);
    return {
      query_id: qid, mode: "recommend", constraints: [], outcome: cards.length ? "recommend" : "not_found",
      groups: cards.length ? [{ id: "g1", role: "recommend", relaxation: [], cards, total: scored.length }] : [], obligations: [], available_values: [],
    };
  }

  /**
   * Vague wishes only ("algo acogedor para un salón pequeño"): rank pieces by the curated mood
   * expansions (preferences, never filters) within the requested categories, and declare the inference.
   */
  moodSearch(cs: ActiveConstraint[], moods: { mood: ConceptId; prefer: ConceptId[] }[]): Bundle {
    const qid = `q${++this.queryCounter}`;
    const scope = cs.filter((c) => c.strength === "must");
    const wanted = cs.filter((c) => c.facet === "mood").flatMap((c) => moods.find((m) => m.mood === c.value)?.prefer ?? []);
    const living = ["category.sofa", "category.armchair", "category.pouf", "category.coffee_table"];
    const scored: { card: CardRef; score: number }[] = [];
    for (const e of this.exhibits.values()) {
      if (scope.length ? !scope.every((c) => this.satExhibit(e, c) === "yes") : !living.some((cat) => this.lx.isA(e.category, cat))) continue;
      const m = this.models.get(e.model_id);
      const feats = [
        e.category,
        ...(e.configuration.status === "known" ? e.configuration.value.flatMap((d) => [d.material ?? "", ...d.color_family]) : []),
        ...(m?.styles.status === "known" ? m.styles.value : []),
      ];
      const why: Record<string, MatchMark> = {};
      let score = 0;
      for (const w of wanted) if (feats.some((f) => f && this.lx.isA(f, w))) { score++; why[w] = "yes"; }
      if (score > 0) scored.push({ card: this.card(e, "exhibited", why), score });
    }
    scored.sort((a, b) => b.score - a.score || a.card.exhibit_id.localeCompare(b.card.exhibit_id));
    const cards = dedupeByModel(scored.map((s) => s.card)).slice(0, 4);
    return {
      query_id: qid, mode: "recommend", constraints: cs, outcome: cards.length ? "recommend" : "not_found",
      groups: cards.length ? [{ id: "g1", role: "recommend", relaxation: [], cards, total: scored.length }] : [],
      obligations: cs.filter((c) => c.facet === "mood").map((c) => `inf:${c.value}`), available_values: [],
    };
  }

  locate(target: string): Bundle {
    const qid = `q${++this.queryCounter}`;
    const modelId = this.models.has(target) ? target : this.exhibits.get(target)?.model_id;
    const cards = [...this.exhibits.values()].filter((e) => e.model_id === modelId)
      .map((e) => ({ ...this.card(e, "exhibited", {}), shown_as: this.shownAs(e) }));
    return {
      query_id: qid, mode: "locate", constraints: [], outcome: cards.length ? "locate" : "not_found",
      groups: cards.length ? [{ id: "g1", role: "locate", relaxation: [], cards, total: cards.length }] : [],
      obligations: cards.length > 1 ? ["nav:ask"] : [], available_values: [],
    };
  }

  detail(exhibitId: string, fields: string[]): Bundle {
    const qid = `q${++this.queryCounter}`;
    const e = this.exhibits.get(exhibitId);
    const m = e ? this.models.get(e.model_id) : undefined;
    if (!e || !m) return notFound(qid, "detail");
    const details: NonNullable<Bundle["details"]> = [];
    for (const f of fields) {
      if (f === "dimensions") details.push(m.dimensions.status === "known"
        ? { exhibit_id: e.id, field: f, status: "known", text: m.dimensions.value.map((d) => `${d.label}: ${d.text}`).join(" · "), facts: m.dimensions.facts }
        : { exhibit_id: e.id, field: f, status: "unknown", facts: [] });
      else if (f === "materials") details.push(m.materials.status === "known"
        ? { exhibit_id: e.id, field: f, status: "known", text: m.materials_text.join("; "), facts: m.materials.facts }
        : { exhibit_id: e.id, field: f, status: "unknown", facts: [] });
      else if (f === "style") details.push(m.styles.status === "known"
        ? { exhibit_id: e.id, field: f, status: "known", text: m.style_text ?? "", facts: m.styles.facts }
        : { exhibit_id: e.id, field: f, status: "unknown", facts: [] });
      else if (f === "shape") details.push(m.shapes.status === "known"
        ? { exhibit_id: e.id, field: f, status: "known", text: m.shape_text ?? "", facts: m.shapes.facts }
        : { exhibit_id: e.id, field: f, status: "unknown", facts: [] });
      else if (f === "options") {
        const own = m.option_groups.filter((g) => g.scope !== "generic_palette");
        details.push(own.length
          ? { exhibit_id: e.id, field: f, status: "known", text: own.map((g) => `${g.name} (${g.options.length})`).join(", "), facts: own.map((g) => g.fact) }
          : { exhibit_id: e.id, field: f, status: "unknown", facts: [] });
      } else if (f === "location") details.push({ exhibit_id: e.id, field: f, status: "known", text: e.zone, facts: [] });
      else details.push({ exhibit_id: e.id, field: f, status: "unknown", facts: [] });
    }
    return {
      query_id: qid, mode: "detail", constraints: [], outcome: "detail",
      groups: [{ id: "g1", role: "detail", relaxation: [], cards: [{ ...this.card(e, "exhibited", {}), shown_as: this.shownAs(e) }], total: 1 }],
      obligations: [
        ...details.filter((d) => d.status === "unknown").map((d) => `unk:${e.id}:${d.field}`),
        ...details.filter((d) => d.status === "known").map((d) => `fact:${d.field}`),
      ], available_values: [], details,
    };
  }
}

interface RelaxCandidate { ops: RelaxOp[]; cost: number; cards: CardRef[] }

const sum = (ops: RelaxOp[]) => ops.reduce((s, o) => s + o.cost, 0);

function sameItems(a: CardRef[], b: CardRef[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a.map((c) => c.exhibit_id));
  return b.every((c) => sa.has(c.exhibit_id));
}

/** One card per model: the same model exposed twice would duplicate the answer (keep the first). */
function dedupeByModel(cards: CardRef[]): CardRef[] {
  const seen = new Set<string>();
  return cards.filter((c) => (seen.has(c.model_id + "|" + (c.shown_as ?? "")) ? false : (seen.add(c.model_id + "|" + (c.shown_as ?? "")), true)));
}

function topFamily(lx: Lexicon, id: ConceptId): ConceptId {
  let cur = id;
  for (let i = 0; i < 5; i++) {
    const p = lx.concepts.get(cur)?.parent;
    if (!p) break;
    cur = p;
  }
  return cur;
}

function notFound(qid: string, mode: Bundle["mode"]): Bundle {
  return { query_id: qid, mode, constraints: [], outcome: "not_found", groups: [], obligations: [], available_values: [] };
}
