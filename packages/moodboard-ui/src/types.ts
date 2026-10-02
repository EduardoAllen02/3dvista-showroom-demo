/**
 * Wire shapes of the backend's /moodboard routes (server/src/routes/
 * moodboard.ts builds them): keep both in step. Declared here rather than
 * imported so this package stays dependency-free and embeddable anywhere.
 */

export type MoodboardLocale = "it" | "es" | "en";

export interface MoodboardNavTarget {
  media_name: string;
  yaw: number;
  pitch: number;
  fov: number;
  hotspot_name: string | null;
}

/** One of the 1-2 saved products the moodboard is built from. */
export interface MoodboardAnchor {
  product_id: string;
  name: string;
  image_url: string;
  /** False when the catalog only has a stand-in image (the brand logo) for this piece. */
  photo: boolean;
  navTarget: MoodboardNavTarget;
}

export interface MoodboardPaletteColor {
  hex: string;
  name: string;
}

export interface MoodboardMaterialInfo {
  name: string;
  description: string;
}

export interface MoodboardAnalysisView {
  motto: string[];
  description: string;
  palette: MoodboardPaletteColor[];
  materials: MoodboardMaterialInfo[];
}

export interface MoodboardTextureView {
  index: number;
  material: string;
  /** Path on the backend ("/moodboard/assets/..."), or null if this texture couldn't be painted. */
  url: string | null;
}

export type MoodboardPlanResponse =
  | { available: false; reason: "no_style" }
  | {
      available: true;
      key: string;
      /** The wishlist's own "Il tuo stile" value, verbatim. */
      style: string;
      anchors: MoodboardAnchor[];
      analysis: MoodboardAnalysisView | null;
      textures: MoodboardTextureView[] | null;
    };

/**
 * All the moodboard needs from a wishlist: the saved product ids, in saving
 * order. assistant-core's WishlistState satisfies it as is; any other host
 * can pass a two-line adapter.
 */
export interface WishlistSource {
  getAll(): ReadonlyArray<{ product_id: string }>;
}
