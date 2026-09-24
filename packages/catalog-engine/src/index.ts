export { ProductSchema, CatalogSchema } from "./schema.js";
export type { Product } from "./schema.js";
export type {
  NavTarget,
  SearchFilters,
  SearchCandidate,
  SearchResult,
  ValidationIssue,
  ValidationReport,
} from "./types.js";
export { toNavTarget } from "./types.js";
export { normalize, stem, tokenize } from "./normalize.js";
export { fieldMatches, shapeMatches } from "./matching.js";
export { buildSynonymIndex } from "./synonyms.js";
export { searchCatalog } from "./search.js";
export { validateCatalog } from "./validate.js";
export { computeStyleProfile, getRecommendations } from "./recommendations.js";
export type { StyleProfile } from "./recommendations.js";
export { COLOR_FAMILIES, closestAvailableColor } from "./color-families.js";
export type { ColorFamily } from "./color-families.js";
export { findVariant } from "./variants.js";
export type { VariantMatch, VariantLookupResult } from "./variants.js";
export { similarityScore, rankBySimilarity } from "./similarity.js";
export type { SimilarityAttribute } from "./similarity.js";
