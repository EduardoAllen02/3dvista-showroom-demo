import type { MoodboardProduct } from "./types.js";

export const MAX_ANCHORS = 2;

/** Extra weight for a second anchor from a category not yet on the board. */
const DIVERSITY_BONUS = 2;

interface Candidate {
  product: MoodboardProduct;
  /** Position in the wishlist. WishlistState appends, so higher = saved more recently. */
  order: number;
  score: number;
}

/**
 * How strongly a saved product embodies `style`, the wishlist's dominant
 * style. The catalog enrichment writes a product's style tags strongest
 * first (sorted by keyword hits in its own description), so:
 *   +4  `style` is the product's primary tag
 *   +2  it is its only tag (a pure expression of the style)
 *   +1  each of colors / materials / finish is known: not a style signal,
 *       but real data the analysis can anchor the palette and textures on
 */
export function anchorScore(product: MoodboardProduct, style: string): number {
  let score = 0;
  if (product.style[0] === style) score += 4;
  if (product.style.length === 1) score += 2;
  if (product.colors.length > 0) score += 1;
  if (product.materials.length > 0) score += 1;
  if (product.finish.length > 0) score += 1;
  return score;
}

/** Different name, and not the same photo (a shared stand-in image doesn't make two pieces the same). */
function distinctPieces(a: MoodboardProduct, b: MoodboardProduct): boolean {
  if (a.name === b.name) return false;
  const bothPhotographed = a.has_photo !== false && b.has_photo !== false;
  return !bothPhotographed || a.image_url !== b.image_url;
}

/**
 * Picks the 1-2 saved products the moodboard is built from: the ones that
 * carry the wishlist's dominant style. Deterministic (same wishlist, same
 * anchors), which is what makes moodboards cacheable and shareable across
 * visitors.
 *
 * - Only products tagged with `style` qualify. `style` must be the value the
 *   wishlist itself displays (catalog-engine's computeStyleProfile), never a
 *   re-derivation, so the moodboard and the "Il tuo stile" label can't
 *   disagree.
 * - Pieces with a real photo come first: the photo is both the board's hero
 *   and what the analysis reads the palette from. A photo-less piece is
 *   only used when no photographed one carries the style.
 * - Then ranked by anchorScore, then most recently saved.
 * - Never two anchors with the same name or the same photo: several catalog
 *   rows are two hotspots on the same physical piece, and some different
 *   pieces share one catalog photo (e.g. "Boiserie" and "Boiserie camino").
 * - The second anchor gets a bonus for a different category: a sofa and a
 *   table read as a room, two sofas as a duplicate.
 */
export function pickStyleAnchors(
  savedIds: readonly string[],
  catalog: readonly MoodboardProduct[],
  style: string,
  max = MAX_ANCHORS
): MoodboardProduct[] {
  const byId = new Map(catalog.map((p) => [p.product_id, p]));
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  savedIds.forEach((id, order) => {
    const product = byId.get(id);
    if (!product || seen.has(id) || !product.style.includes(style)) return;
    seen.add(id);
    candidates.push({ product, order, score: anchorScore(product, style) });
  });

  const picked: MoodboardProduct[] = [];
  while (picked.length < max) {
    const pool = candidates.filter((c) => picked.every((p) => distinctPieces(p, c.product)));
    if (pool.length === 0) break;
    const effective = (c: Candidate): number =>
      c.score + (picked.length > 0 && picked.every((p) => p.category !== c.product.category) ? DIVERSITY_BONUS : 0);
    const photo = (c: Candidate): number => (c.product.has_photo === false ? 0 : 1);
    pool.sort(
      (a, b) =>
        photo(b) - photo(a) ||
        effective(b) - effective(a) ||
        b.order - a.order ||
        a.product.product_id.localeCompare(b.product.product_id)
    );
    picked.push(pool[0].product);
  }
  return picked;
}
