import type { Product } from "@3dvista-assistant/catalog-engine";

export interface CatalogListingEntry {
  product_id: string;
  name: string;
  category: string;
  section: string;
  description: string;
}

/**
 * Compact full-catalog listing (id/name/category/section/description, no
 * coordinates) used ONLY as a low-confidence fallback — see
 * SearchResult.lowConfidence in catalog-engine. Includes descriptions
 * (unlike the normal per-turn candidate summary) specifically so the model
 * can reason about what a product actually IS when the deterministic
 * keyword search found fewer than 2 real matches, instead of guessing from
 * a bare name. This never bypasses the "model never gets real coordinates,
 * never navigates on an unvalidated id" rule — it's still just a menu of
 * ids for the model to pick from; get_product/navigate_to_product still
 * validate against the same trusted catalog either way.
 */
export function buildFullCatalogListing(catalog: Product[]): CatalogListingEntry[] {
  return catalog.map((p) => ({
    product_id: p.product_id,
    name: p.name,
    category: p.category,
    section: p.section,
    description: p.description,
  }));
}
