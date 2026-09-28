import type { ConceptId, FactId } from "../catalog/types.js";

export type ConstraintFacet = "category" | "model" | "shape" | "material" | "color" | "tone" | "style" | "mood" | "zone";

export interface ActiveConstraint {
  id: string;                     // "c1"
  facet: ConstraintFacet;
  op: "is" | "not" | "harmonizes_with";
  /** Concept id; model id when facet = "model"; zone label when facet = "zone". */
  value?: ConceptId;
  /** Exhibit id for harmonizes_with ("cocinas que combinen con ese sofá"). */
  ref?: string;
  /** "frame" = inherited from earlier turns; "new" = asked in this turn. */
  role: "frame" | "new";
  emphasis: "normal" | "high" | "low";
  /** "prefer" never filters (moods, inferred wishes): it only ranks. */
  strength: "must" | "prefer";
}

export type Tri = "yes" | "no" | "unknown";
/** Per-constraint outcome on a card: yes/no/unknown, "sub:<concept>" when relaxed by substitution, "drop" when relaxed away. */
export type MatchMark = Tri | `sub:${string}` | "drop";

export interface Variant {
  group_id: string;
  group_name: string;             // collection as published: "BOSTON"
  option_ids: string[];
  option_names: string[];         // "Mustard", …
}

export interface CardRef {
  exhibit_id: string;
  model_id: string;
  /** "line": only the product line's palette has it — mention it with a "check the page" caveat. */
  availability: "exhibited" | "on_order" | "line" | "unknown";
  /** Official options that satisfy the request on order (coherent: same option for color + material). */
  variants?: Variant[];
  /** What the exhibited piece looks like (literal observation), for "en el showroom está en …". */
  shown_as?: string | null;
  match: Record<string, MatchMark>;
  evidence: FactId[];
}

export interface RelaxOp {
  kind: "substitute" | "drop";
  constraint: string;             // constraint id
  to?: ConceptId;
  via?: "near" | "harmonizes" | "sibling";
  relation_status?: "draft" | "signed";
  cost: number;
}

export type GroupRole =
  | "exact_exhibited" | "exact_on_order" | "line_on_order" | "unknown" | "alt_keep_frame" | "alt_keep_new"
  | "list" | "alternatives" | "recommend" | "locate" | "detail";

export interface CardGroup {
  id: string;                     // "g1"
  role: GroupRole;
  relaxation: RelaxOp[];
  cards: CardRef[];
  /** Total cards available for this group before the display cap (lists). */
  total: number;
}

export type Outcome =
  | "exact" | "on_order_only" | "line_only" | "no_exact" | "unknown_only" | "list" | "empty_list"
  | "alternatives" | "recommend" | "locate" | "detail" | "not_found";

export interface Bundle {
  query_id: string;
  mode: "search" | "list" | "alternatives" | "recommend" | "locate" | "detail";
  constraints: ActiveConstraint[];
  outcome: Outcome;
  groups: CardGroup[];
  /** Obligations the answer text must meet (checked by the verifier). */
  obligations: string[];
  /** Alternatives mode: the piece the alternatives are for (not one of the cards). */
  source?: string;
  /** For a requested value with zero support in scope: the real values that exist. */
  available_values: { constraint: string; facet: ConstraintFacet; values: ConceptId[] }[];
  /** Detail mode: facts per requested field. */
  /** concepts: the same datum as concepts, so it can be said in the visitor's language (the text is the page's Italian). */
  details?: { exhibit_id: string; field: string; status: "known" | "unknown"; text?: string; concepts?: ConceptId[]; facts: FactId[] }[];
}

export interface RelaxPolicy {
  base_weight: Record<ConstraintFacet, number>;
  role_factor: { frame: number; new: number };
  emphasis_factor: { high: number; normal: number; low: number };
  max_cost: number;
  max_candidates: number;
  max_cards: number;
  list_max_cards: number;
  /** When only on-order matches exist, also show something physical (P9, default yes). */
  show_physical_when_only_on_order: boolean;
  /** Use DRAFT (unsigned) harmony relations. Must be false in strict/production until the client signs them. */
  allow_draft_harmonies: boolean;
}

export const DEFAULT_POLICY: RelaxPolicy = {
  base_weight: { category: 100, model: 50, shape: 6, material: 5, color: 4, tone: 3, style: 3, mood: 2, zone: 2 },
  role_factor: { frame: 1.5, new: 1 },
  emphasis_factor: { high: 3, normal: 1, low: 0.3 },
  max_cost: 70,
  max_candidates: 12,
  max_cards: 8,
  list_max_cards: 12,
  show_physical_when_only_on_order: true,
  allow_draft_harmonies: true,
};
