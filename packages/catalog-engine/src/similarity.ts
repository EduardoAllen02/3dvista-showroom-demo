import type { Product } from "./schema.js";
import { fieldMatches, shapeMatches } from "./matching.js";

export type SimilarityAttribute = "shape" | "color" | "style" | "finish";

const ALL_ATTRIBUTES: SimilarityAttribute[] = ["shape", "color", "style", "finish"];

// A `preferred` match counts far more than the others so it dominates the
// sort — but doesn't exclude the rest, which still break ties between
// several preferred-matching candidates.
const PREFERRED_WEIGHT = 10;
const REGULAR_WEIGHT = 1;

function sharesShape(a: Product, b: Product): boolean {
  return !!a.shape && !!b.shape && shapeMatches(a.shape, b.shape);
}

function sharesArrayField(a: string[], b: string[]): boolean {
  return a.some((x) => b.some((y) => fieldMatches(x, y)));
}

/**
 * How many real attributes two products share with the SAME anchor,
 * confirmed-live use case: "Ver alternativas" on a round table was showing
 * square ones first, silently burying a real other round design, because
 * `distinctAlternatives` only dedupes/filters — it never ranks. This never
 * excludes anything (a 0-match candidate is still returned, just last) and
 * never fabricates a match — every point comes from a real shared field
 * value, same equality rules `search_catalog`'s filters already use
 * (`shapeMatches` for shape/style's free-form phrasing, `fieldMatches` for
 * the controlled-vocabulary fields).
 */
export function similarityScore(anchor: Product, candidate: Product, preferred?: SimilarityAttribute): number {
  let score = 0;
  for (const attr of ALL_ATTRIBUTES) {
    const weight = attr === preferred ? PREFERRED_WEIGHT : REGULAR_WEIGHT;
    switch (attr) {
      case "shape":
        if (sharesShape(anchor, candidate)) score += weight;
        break;
      case "color":
        if (sharesArrayField(anchor.colors, candidate.colors)) score += weight;
        break;
      case "style":
        if (sharesArrayField(anchor.style, candidate.style)) score += weight;
        break;
      case "finish":
        if (sharesArrayField(anchor.finish, candidate.finish)) score += weight;
        break;
    }
  }
  return score;
}

/**
 * Reorders `candidates` by how many real attributes each shares with
 * `anchor` (highest first), optionally weighting one attribute heavily when
 * the visitor's own request made it the deciding one (e.g. they asked by
 * color, not shape). A stable sort: when every candidate scores 0 (the
 * common case today, while most of the catalog still has no shape/color/
 * style/finish data), the original order is preserved exactly — this is a
 * pure reordering, never a filter, so it's a safe no-op wherever there's
 * nothing real to rank by yet.
 */
export function rankBySimilarity(anchor: Product, candidates: Product[], preferred?: SimilarityAttribute): Product[] {
  return candidates
    .map((product, index) => ({ product, index, score: similarityScore(anchor, product, preferred) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.product);
}
