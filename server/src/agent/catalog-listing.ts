import type { Product } from "@3dvista-assistant/catalog-engine";

export interface CatalogListingEntry {
  product_id: string;
  name: string;
  category: string;
  section: string;
  description: string;
  shape: string | null;
  style: string[];
  colors: string[];
  materials: string[];
}

/**
 * Compact full-catalog listing (id/name/category/section/description +
 * structured attributes, no coordinates) used ONLY as a low-confidence
 * fallback — see SearchResult.lowConfidence in catalog-engine. Includes
 * descriptions (unlike the normal per-turn candidate summary) specifically
 * so the model can reason about what a product actually IS when the
 * deterministic keyword search found fewer than 2 real matches, instead of
 * guessing from a bare name. This never bypasses the "model never gets real
 * coordinates, never navigates on an unvalidated id" rule — it's still just
 * a menu of ids for the model to pick from; get_product/navigate_to_product
 * still validate against the same trusted catalog either way.
 *
 * `shape`/`style`/`colors`/`materials` are included so a filtered search
 * that matched nothing (e.g. shape="angolare") can still be rescued here —
 * the model can see which of these attributes genuinely exist across the
 * catalog and offer them as real alternatives instead of a dead end. Empty
 * arrays / null `shape` are expected for products this data hasn't been
 * filled in for yet — the model should never treat that as "this product
 * has no shape/style", only "unknown", per the catalog's own honesty rules.
 */
export function buildFullCatalogListing(catalog: Product[]): CatalogListingEntry[] {
  return catalog.map((p) => ({
    product_id: p.product_id,
    name: p.name,
    category: p.category,
    section: p.section,
    description: p.description,
    shape: p.shape ?? null,
    style: p.style,
    colors: p.colors,
    materials: p.materials,
  }));
}
