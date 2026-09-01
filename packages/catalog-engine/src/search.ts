import type { Product } from "./schema.js";
import type { SearchCandidate, SearchFilters, SearchResult } from "./types.js";
import { normalize, stem, tokenize } from "./normalize.js";

const MAX_CANDIDATES = 8;
// Fewer than this many genuine (score > 0) matches marks the result as
// low-confidence — see SearchResult's doc comment for why this replaced
// the old array-order padding fallback.
const MIN_REAL_MATCHES = 2;

function levenshtein(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array<number>(b.length + 1).fill(0).map((_, j) => (i === 0 ? j : 0))
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[a.length][b.length];
}

function fieldMatches(field: string | undefined, filterValue: string): boolean {
  if (!field) return false;
  return normalize(field) === normalize(filterValue);
}

function scoreProduct(product: Product, queryTokens: string[], stemmedQuery: string[]): number {
  let score = 0;
  const nameNorm = normalize(product.name);
  const queryJoined = queryTokens.join(" ");

  if (queryJoined.length > 0 && nameNorm.includes(queryJoined)) score += 10;

  for (const syn of product.synonyms) {
    if (normalize(syn).includes(queryJoined) && queryJoined.length > 0) score += 9;
  }

  const haystack = [
    product.category,
    ...product.keywords,
    ...product.colors,
    ...product.materials,
    product.section,
  ]
    .map(normalize)
    .join(" ");

  for (const token of queryTokens) {
    if (token.length < 2) continue;
    if (haystack.includes(token)) score += 3;
  }

  // Controlled fuzzy match on name tokens (distance cap keeps it "controlled").
  const nameTokens = tokenize(product.name).map(stem);
  for (const qt of stemmedQuery) {
    for (const nt of nameTokens) {
      if (qt.length < 3 || nt.length < 3) continue;
      const dist = levenshtein(qt, nt);
      if (dist <= 1) score += 2;
    }
  }

  return score;
}

export function searchCatalog(query: string, filters: SearchFilters, products: Product[]): SearchResult {
  const active = products.filter((p) => p.active);

  let pool = active;
  if (filters.category) pool = pool.filter((p) => fieldMatches(p.category, filters.category!));
  if (filters.section) pool = pool.filter((p) => fieldMatches(p.section, filters.section!));
  if (filters.color) {
    pool = pool.filter((p) => p.colors.some((c) => fieldMatches(c, filters.color!)));
  }
  if (filters.material) {
    pool = pool.filter((p) => p.materials.some((m) => fieldMatches(m, filters.material!)));
  }
  if (filters.shape) {
    pool = pool.filter((p) => fieldMatches(p.shape, filters.shape!));
  }

  const queryTokens = tokenize(query);

  // Empty query (e.g. a category/color/material-only filter call, no free
  // text) isn't "low confidence" — there's nothing to score against, so
  // the filtered pool itself IS the answer, taken as-is.
  if (queryTokens.length === 0) {
    const asIs = pool.slice(0, MAX_CANDIDATES).map((product) => ({ product, score: 0 }));
    return { candidates: asIs, lowConfidence: false };
  }

  const stemmedQuery = queryTokens.map(stem);

  const scored: SearchCandidate[] = pool
    .map((product) => ({ product, score: scoreProduct(product, queryTokens, stemmedQuery) }))
    .filter((c) => c.score > 0);

  scored.sort((a, b) => b.score - a.score);

  const lowConfidence = scored.length < MIN_REAL_MATCHES;

  return { candidates: scored.slice(0, MAX_CANDIDATES), lowConfidence };
}
