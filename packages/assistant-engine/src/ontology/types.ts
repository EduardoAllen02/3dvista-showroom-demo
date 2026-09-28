import type { ConceptId, Lang } from "../catalog/types.js";

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
}
