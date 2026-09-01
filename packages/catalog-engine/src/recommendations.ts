import type { Product } from "./schema.js";

const MAX_RECOMMENDATIONS = 6;

export interface StyleProfile {
  /** The single most-represented style tag across the saved items, or null if none scored. */
  dominantStyle: string | null;
  /** Raw per-style counts, for callers that want more than just the top pick. */
  styleCounts: Record<string, number>;
}

/**
 * Pure aggregation over already-saved product_ids — counts each saved
 * product's `style` tags and picks the most frequent one. Deliberately NOT
 * an LLM call: the client's own request for this feature was explicit that
 * the "brain" should be the database doing statistics, not a model
 * improvising a style label — this is that statistic.
 */
export function computeStyleProfile(savedIds: string[], catalog: Product[]): StyleProfile {
  const byId = new Map(catalog.map((p) => [p.product_id, p]));
  const styleCounts: Record<string, number> = {};

  for (const id of savedIds) {
    const product = byId.get(id);
    if (!product) continue;
    for (const style of product.style) {
      styleCounts[style] = (styleCounts[style] ?? 0) + 1;
    }
  }

  let dominantStyle: string | null = null;
  let max = 0;
  for (const [style, count] of Object.entries(styleCounts)) {
    if (count > max) {
      max = count;
      dominantStyle = style;
    }
  }

  return { dominantStyle, styleCounts };
}

/**
 * Ranks the rest of the (active) catalog against a visitor's saved wishlist.
 * Scoring, highest weight first:
 *   +5  an explicit `compatible_with` edge in either direction (a saved
 *       item lists this candidate as a pairing, or vice versa) — these are
 *       curated "designed/staged together" links, the strongest signal.
 *   +2 per saved item that shares one of the candidate's style tags —
 *       weighted by how common that style already is in the wishlist, so a
 *       style the visitor has saved 3 times outweighs one saved once.
 *   +1  shares a material with something saved.
 *   +1  shares a color with something saved.
 * Never recommends something already saved. Pure/deterministic — no LLM.
 */
export function getRecommendations(savedIds: string[], catalog: Product[], limit = MAX_RECOMMENDATIONS): Product[] {
  const active = catalog.filter((p) => p.active);
  const savedSet = new Set(savedIds);
  const savedProducts = active.filter((p) => savedSet.has(p.product_id));
  if (savedProducts.length === 0) return [];

  const { styleCounts } = computeStyleProfile(savedIds, catalog);
  const savedMaterials = new Set(savedProducts.flatMap((p) => p.materials.map((m) => m.toLowerCase())));
  const savedColors = new Set(savedProducts.flatMap((p) => p.colors.map((c) => c.toLowerCase())));
  const compatTargets = new Set(savedProducts.flatMap((p) => p.compatible_with));
  // Several catalog entries are two separate hotspot markers on the exact
  // same physical piece (confirmed live: "Divano Camden" has two distinct
  // product_ids in the same room) — excluding by product_id alone isn't
  // enough, that same-name twin would otherwise get "recommended" as if it
  // were a different product. See tools.ts's distinctAlternatives for the
  // same fix applied to get_alternatives.
  const savedNames = new Set(savedProducts.map((p) => p.name));

  const scored = active
    .filter((p) => !savedSet.has(p.product_id) && !savedNames.has(p.name))
    .map((product) => {
      let score = 0;
      if (compatTargets.has(product.product_id)) score += 5;
      if (product.compatible_with.some((id) => savedSet.has(id))) score += 5;
      for (const style of product.style) score += (styleCounts[style] ?? 0) * 2;
      if (product.materials.some((m) => savedMaterials.has(m.toLowerCase()))) score += 1;
      if (product.colors.some((c) => savedColors.has(c.toLowerCase()))) score += 1;
      return { product, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((c) => c.product);
}
