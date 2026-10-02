/**
 * Moodboard engine: shared types.
 *
 * Server-side and framework-agnostic on purpose. It knows nothing about
 * Fastify, 3DVista or the chatbot: a host backend adapts its own catalog to
 * `MoodboardProduct`, supplies the product images and exposes the HTTP
 * routes. That is what lets the same engine back the Febal tour today and
 * the future web platform's tours later.
 */

export type MoodboardLocale = "it" | "es" | "en";

/**
 * The slice of a catalog product the moodboard reads. catalog-engine's
 * `Product` satisfies it structurally, but it is declared here so this
 * package never imports a tour-specific schema.
 */
export interface MoodboardProduct {
  product_id: string;
  name: string;
  category: string;
  /** Style tags, strongest first (the order the catalog enrichment writes them in). */
  style: string[];
  colors: string[];
  materials: string[];
  finish: string[];
  shape?: string;
  image_url: string;
  /**
   * False when `image_url` is a stand-in rather than a photo of the piece
   * (Febal's is the red brand logo, 37 of 88 pieces today). Such a picture
   * must never reach the analysis: it would paint the palette red and white.
   * Absent means true.
   */
  has_photo?: boolean;
}

export type ColorRole = "dominant" | "secondary" | "accent";

export interface PaletteColor {
  /** "#RRGGBB", always normalized to upper case. */
  hex: string;
  name: string;
  role: ColorRole;
  /** Approximate share of the moodboard, 0-100. */
  weight: number;
}

/**
 * How hard a material is to draw. Decides which image model paints it:
 * flat, matte, repetitive surfaces look the same on the cheap model, so only
 * the hard ones pay for the better one (measured in moodboard-ai: $0.020
 * instead of $0.053 for four textures with one complex material).
 */
export type TextureDifficulty = "simple" | "complex";

export interface MoodboardMaterial {
  name: string;
  description: string;
  difficulty: TextureDifficulty;
  /** English prompt for the image model. Server-only: never sent to the browser. */
  texturePrompt: string;
}

/** What the analysis model writes. The style label is NOT here: it comes from the wishlist. */
export interface MoodboardAnalysis {
  /** Two short evocative lines. */
  motto: string[];
  description: string;
  palette: PaletteColor[];
  materials: MoodboardMaterial[];
}

/** Everything the moodboard is generated from. Identified by `key`, which the server derives. */
export interface MoodboardPlan {
  key: string;
  tourId: string;
  locale: MoodboardLocale;
  /** The wishlist's dominant style, verbatim. */
  style: string;
  /** The 1-2 saved products that embody that style. */
  anchors: MoodboardProduct[];
  contentVersion: number;
  createdAt: string;
}

export interface StoredAnalysis {
  analysis: MoodboardAnalysis;
  model: string;
  costUsd: number;
  ms: number;
  createdAt: string;
}

export interface StoredTexture {
  index: number;
  material: string;
  /** File name inside the plan's folder (e.g. "tex-0.webp"), or null if this texture failed. */
  file: string | null;
  model: string;
  costUsd: number;
  ms: number;
  error: string | null;
}

export interface UsageEntry {
  key: string;
  stage: "analysis" | "textures";
  models: string[];
  costUsd: number;
  ms: number;
}
