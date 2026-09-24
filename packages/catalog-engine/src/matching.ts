import { normalize } from "./normalize.js";

/** Strict normalized equality — for controlled-vocabulary fields (category, section, color, material, finish). */
export function fieldMatches(field: string | undefined, filterValue: string): boolean {
  if (!field) return false;
  return normalize(field) === normalize(filterValue);
}

// `shape`/`style` are free-form descriptive phrases (not controlled enums
// like category/section), so a caller can reasonably pass "angolo" or "ad
// angolo" or "a L" for the exact same stored value, or "elegante" for a
// stored "Classico elegante" — strict equality made a real, reproduced bug: a
// shape filter of "angolo" against a stored "ad angolo" returned zero
// matches even though the product genuinely has that shape, which silently
// killed the very use case (search by shape) this field exists for.
// Bidirectional substring match tolerates that phrasing variance without
// turning into a fuzzy/unbounded match.
export function shapeMatches(field: string | undefined, filterValue: string): boolean {
  if (!field) return false;
  const f = normalize(field);
  const v = normalize(filterValue);
  return f.includes(v) || v.includes(f);
}
