/**
 * Canonical catalog (docs/chatbot-v2/03-decision-refactor.md §5).
 *
 * Three separate entities instead of one flat record per piece:
 *  - Model   = the official product page (what can be ORDERED, with its option lists);
 *  - Exhibit = a piece physically placed in the tour (what the visitor can SEE, "Llévame");
 *  - Fact    = one sourced, reviewable claim backing a value of either.
 *
 * Every queryable attribute is tri-state (`Attr`): "unknown" must never be read
 * as "no" — that is what makes "zero false negatives" and "zero invented claims"
 * checkable at the same time.
 */

export type ConceptId = string; // "category.sofa", "material.leather", "color.yellow", …
export type FactId = string;
export type Lang = "es" | "it" | "en";

export type ComponentRole =
  | "upholstery" | "structure" | "legs" | "base" | "top" | "doors" | "front"
  | "carcass" | "interior" | "frame" | "headboard" | "handle" | "shelves" | "whole";

export type UnknownReason = "not_captured" | "not_published" | "pending_review";

export type Attr<T> =
  | { status: "known"; value: T; facts: FactId[] }
  | { status: "unknown"; reason: UnknownReason }
  | { status: "not_applicable" };

export interface Fact {
  id: FactId;
  subject: string;
  claim: string;
  source: {
    kind: "official_page" | "tour_capture" | "curated" | "catalog_v1";
    url?: string;
    captured_at: string;
    evidence: string;
  };
  review: { status: "validated" | "pending" | "rejected"; by?: string; at?: string };
}

export interface Option {
  id: string;                 // "melrose/boston/mustard"
  official_name: string;      // "Mustard", "Rovere caffè"
  code: string | null;        // "F008", "R456 S1"
  color_family: ConceptId[];  // ["color.yellow"] — proposal until reviewed
  /** Only for heterogeneous groups (page-text options like "cristallo, superceramica, supermarmo"). */
  material?: ConceptId;
  tone?: "light" | "medium" | "dark";
  swatch?: { url: string | null; hex: string | null };
  fact: FactId;
}

/**
 * Where an option list comes from decides whether it may be asserted as
 * "available on order" for THIS model:
 *  - "model":           the page's own list ("Rivestimenti per Melrose") → assertable;
 *  - "text":            options stated in the page text ("disponibile in Rovere Dark, Rovere e Noce") → assertable;
 *  - "generic_palette": a category-wide palette shown on the page ("Finiture per NOTTE.",
 *                       the shared wardrobe palette) → NOT assertable per model; only "see the page".
 */
export type OptionScope = "model" | "text" | "generic_palette";

export interface OptionGroup {
  id: string;                  // "melrose/boston"
  name: string;                // collection name as published: "BOSTON", "LACCATO OPACO"
  group_title: string | null;  // page grouping: "Frontali", "NAVIGLI - CAT. 2", …
  applies_to: ComponentRole[];
  material: ConceptId | null;  // proposal until reviewed (line-materials)
  price_band: string | null;   // "CAT. 2"
  scope: OptionScope;
  options: Option[];
  fact: FactId;
}

export interface Dimension {
  label: string;               // "Rotondo fisso 6 posti", "Comò 3 cassetti"
  text: string;                // "D 130 H 75", "L 130 x H 78.9 x P 59.4"
}

export interface Model {
  id: string;                  // model_key from product-facts
  name: string;
  category: ConceptId;
  official_url: string | null; // "Ver en la web" link target
  shapes: Attr<ConceptId[]>;
  shape_text: string | null;   // literal description of forms/configurations
  styles: Attr<ConceptId[]>;
  style_text: string | null;
  materials: Attr<ConceptId[]>;
  materials_text: string[];
  dimensions: Attr<Dimension[]>;
  option_groups: OptionGroup[];
  /** true only when the model's OWN option lists are exhaustive (scope "model"/"text"). */
  options_complete: boolean;
  description_it: string | null;
  notes: string[];
}

export interface ConfiguredComponent {
  role: ComponentRole;
  dominant: boolean;
  option_ref?: string;         // Option.id when the exposed finish matches an official option unambiguously
  material: ConceptId | null;
  color_family: ConceptId[];
  observed_color: string | null; // literal observation: "verde oliva"
}

export interface Exhibit {
  id: string;                  // product_id "FEB-048" (kept: visitors' wishlists store it)
  model_id: string;
  name: string;                // display name as in the tour: "Divano Melrose"
  category: ConceptId;
  zone: string;                // "CASA 03 - AUDACE"
  configuration: Attr<ConfiguredComponent[]>;
  shape_as_shown: Attr<ConceptId[]>;
  styles: Attr<ConceptId[]>;
  co_exhibited_with: string[]; // same panorama: observable, not an opinion
  image_url: string;
  description: string;
}

/** Private: never serialized into any LLM context (LLM only handles exhibit ids). */
export interface Viewpoint {
  exhibit_id: string;
  media_name: string;
  yaw: number;
  pitch: number;
  fov: number;
  hotspot_name: string | null;
}

export interface CanonicalCatalog {
  tour_id: string;
  data_version: string;
  built_at: string;
  /** "strict": only validated facts are known; "dev": pending facts are used too (never for error-0 claims). */
  mode: "strict" | "dev";
  models: Model[];
  exhibits: Exhibit[];
  viewpoints: Viewpoint[];
  facts: Fact[];
}
