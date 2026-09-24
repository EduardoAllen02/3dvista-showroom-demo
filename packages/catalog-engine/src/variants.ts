import type { Product } from "./schema.js";
import { fieldMatches, shapeMatches } from "./matching.js";

export interface VariantMatch {
  product: Product;
  matchedField: "finish" | "color" | "shape";
  matchedValue: string;
}

export interface VariantLookupResult {
  /** Every active product sharing the anchor's exact `name`, INCLUDING the anchor itself. */
  siblings: Product[];
  match: VariantMatch | null;
}

/**
 * Resolves "¿lo tienes en X?" against the SAME physical design as `anchor`.
 * "Same design" is defined as exact `name` equality, not `alternatives_group`
 * (that's a separate, broader relation — other substitutable products in the
 * same category, see tools.ts's distinctAlternatives). Name-based grouping
 * needs no new catalog column: it's how Febal's own data already works (one
 * shared landing page/model name per design, confirmed live on
 * febalcasa.com) — confirmed via a live client voice note that same-name
 * catalog duplicates (e.g. two "Divano Camden" entries) are genuinely
 * different configurations of one modular design, not redundant markers.
 *
 * Checks finish first (Febal's own named rivestimento lines — controlled
 * vocabulary, most likely to be what "velvet" refers to), then color, then
 * shape. The anchor itself is included in `siblings` so a request that
 * already matches the shown product resolves as a same-product "yes"
 * instead of a dead end.
 */
export function findVariant(anchor: Product, requestedValue: string, catalog: Product[]): VariantLookupResult {
  const siblings = catalog.filter((p) => p.active && p.name === anchor.name);

  for (const p of siblings) {
    if (p.finish.some((f) => fieldMatches(f, requestedValue))) {
      return { siblings, match: { product: p, matchedField: "finish", matchedValue: requestedValue } };
    }
  }
  for (const p of siblings) {
    if (p.colors.some((c) => fieldMatches(c, requestedValue))) {
      return { siblings, match: { product: p, matchedField: "color", matchedValue: requestedValue } };
    }
  }
  for (const p of siblings) {
    if (shapeMatches(p.shape, requestedValue)) {
      return { siblings, match: { product: p, matchedField: "shape", matchedValue: requestedValue } };
    }
  }
  return { siblings, match: null };
}
