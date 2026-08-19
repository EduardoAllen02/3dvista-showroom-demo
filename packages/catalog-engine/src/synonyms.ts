import type { Product } from "./schema.js";
import { normalize } from "./normalize.js";

/**
 * Builds a synonym -> product_id lookup purely from each record's own
 * `synonyms` field. No external dictionary needed at this catalog size.
 */
export function buildSynonymIndex(products: Product[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const product of products) {
    const terms = [product.name, ...product.synonyms];
    for (const term of terms) {
      const key = normalize(term);
      const existing = index.get(key) ?? [];
      existing.push(product.product_id);
      index.set(key, existing);
    }
  }
  return index;
}
