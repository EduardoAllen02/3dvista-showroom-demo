import type { ComponentRole, ConceptId, Lang } from "../catalog/types.js";

export type Facet = "category" | "shape" | "material" | "color" | "tone" | "style" | "mood";

export interface Concept {
  id: ConceptId;
  facet: Facet;
  /** is_a parent: "color.mustard" → "color.yellow", "material.velvet" → "material.fabric". */
  parent?: ConceptId;
  labels: Record<Lang, string>;
  /** Surface forms per language (any case/accents; matched normalized, longest match wins). */
  synonyms: Partial<Record<Lang, string[]>>;
  /** Short definition for confusables, shown to the LLM planner. */
  note?: string;
}

export type RelationType = "near" | "harmonizes";

export interface ConceptRelation {
  from: ConceptId;
  to: ConceptId;
  type: RelationType;
  /** 0 = identical … 1 = far. Symmetric unless stated. */
  distance: number;
  /** Harmonies are an interior-design judgement: "draft" until the client signs them. */
  status: "draft" | "signed";
}

export interface MoodExpansion {
  mood: ConceptId;
  prefer: ConceptId[]; // soft preferences (rank only, never filter)
}

export interface OntologyPack {
  id: string;
  version: string;
  concepts: Concept[];
  relations: ConceptRelation[];
  moods: MoodExpansion[];
  /**
   * Phrases that contain a concept word but are a name or a part, never that concept:
   * "anta square" is a door model (not a square shape), "schienali scorrevoli" are sliding
   * backrests (not sliding doors). Matched like synonyms; a longer stop phrase hides the
   * shorter concept inside it and yields nothing itself.
   */
  stop_phrases?: string[];
  /** Domain rules that are knowledge about the kind of products, not product data. */
  domain?: DomainRules;
}

export interface DomainRules {
  /** Categories that go well next to a category ("what goes with this sofa"): recommendations rank them up. */
  complements?: Record<ConceptId, ConceptId[]>;
  /** Where a vague wish with no category looks ("algo acogedor"): the living area, for furniture. */
  mood_scope?: ConceptId[];
  /** Which part of a piece its options dress when the source does not say (a sofa's upholstery, a table's top). */
  option_roles?: Record<ConceptId, ComponentRole[]>;
  /** The part that decides how a piece looks ("a grey sofa" = grey upholstery). */
  dominant_role?: Record<ConceptId, ComponentRole>;
  /** Words whose shape depends on the piece: a "penisola" is a chaise on a sofa but a peninsula in a kitchen. */
  shape_by_category?: { from: ConceptId; to: ConceptId; in?: ConceptId[]; not_in?: ConceptId[] }[];
  /** For the planner prompt: how visitors name things, as "a/b/c → concept" examples in several languages. */
  planner_hint?: string;
}
