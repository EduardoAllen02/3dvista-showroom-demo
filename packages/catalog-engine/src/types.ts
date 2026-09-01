import type { Product } from "./schema.js";

export interface NavTarget {
  media_name: string;
  yaw: number;
  pitch: number;
  fov: number;
  /**
   * The product's own hotspot label from the source catalog (e.g. "BOX 100
   * - B_106") — carried through so the frontend can derive the matching
   * "b106 dugme" overlay and open the SAME info panel a real hotspot click
   * would (see tour-bridge's openProductPanel). Null when the product has
   * no authored hotspot (coordinates missing) or the source data never had one.
   */
  hotspot_name: string | null;
}

export interface SearchFilters {
  category?: string;
  color?: string;
  material?: string;
  shape?: string;
  section?: string;
}

export interface SearchCandidate {
  product: Product;
  score: number;
}

/**
 * `lowConfidence` is true when fewer than 2 products scored a genuine
 * keyword/synonym/fuzzy match (see search.ts). The caller should NOT treat
 * `candidates` as a reliable proposal in that case — it may be empty or
 * have just one weak hit. Previously this case was silently padded with
 * arbitrary catalog-array-order filler up to 8 items, indistinguishable
 * from real matches to the model — a real bug (a "columna/esquinero"
 * query proposing an unrelated modular kitchen system just because it was
 * next in the array). Callers should react to `lowConfidence` by offering
 * the model a broader, explicitly-labeled fallback (e.g. the full active
 * catalog) instead of trusting `candidates` alone.
 */
export interface SearchResult {
  candidates: SearchCandidate[];
  lowConfidence: boolean;
}

export interface ValidationIssue {
  rule: string;
  product_id?: string;
  message: string;
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
}

export function toNavTarget(product: Product): NavTarget {
  return {
    media_name: product.media_name,
    yaw: product.yaw,
    pitch: product.pitch,
    fov: product.fov,
    hotspot_name: product.hotspot_name,
  };
}
