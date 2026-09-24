import { normalize } from "./normalize.js";

export interface ColorFamily {
  id: string;
  members: string[];
}

/**
 * Seed grouping of "perceptually close" colors, used ONLY to rank an
 * honest fallback suggestion when a visitor's exact requested color isn't
 * available (see tools.ts's search_catalog color_fallback) — never to
 * silently match a filter (searchCatalog's strict `fieldMatches` still
 * governs exact color filtering, untouched by this file).
 *
 * THIS IS A GUESS, NOT REAL DATA: seeded from common Italian/Spanish
 * furniture-color vocabulary before Febal Casa's real `colors` values
 * existed in the catalog (colors was empty for all 95 products at the time
 * this was written). Revisit and correct these groupings once real color
 * names land from the client's own data entry — do not treat this table as
 * load-bearing truth about Febal's actual palette.
 */
export const COLOR_FAMILIES: ColorFamily[] = [
  { id: "neutros-calidos", members: ["cafe", "marron", "cognac", "tostado", "camel", "chocolate", "cuoio", "tabacco", "testa di moro", "avellana"] },
  { id: "neutros-oscuros", members: ["negro", "nero", "antracite", "gris antracita", "grafito"] },
  { id: "neutros-claros", members: ["blanco", "bianco", "hueso", "crema", "panna", "ecru", "marfil"] },
  { id: "grises", members: ["gris", "grigio", "tortora", "perla", "plomo"] },
  { id: "verdes", members: ["verde", "verde bosco", "verde salvia", "oliva", "musgo"] },
  { id: "azules", members: ["azul", "blu", "navy", "petrolio", "celeste"] },
  { id: "rojos", members: ["rojo", "rosso", "bordeaux", "terracota", "terracotta"] },
  { id: "beiges", members: ["beige", "arena", "sabbia", "taupe"] },
];

function familyOf(color: string): ColorFamily | undefined {
  const n = normalize(color);
  return COLOR_FAMILIES.find((f) => f.members.some((m) => normalize(m) === n));
}

/**
 * Returns the closest color to `requestedColor` among `availableColors`,
 * but ONLY if they share a known family — otherwise `null`, so the caller
 * never fabricates a "similar" claim for an unrelated color. If several
 * available colors share the requested color's family, the first match
 * (in `availableColors`' own order) wins — callers pass already-relevant,
 * already-filtered pools, so there's no meaningful ranking beyond that.
 */
export function closestAvailableColor(
  requestedColor: string,
  availableColors: string[]
): { color: string; sameFamily: boolean } | null {
  const requestedFamily = familyOf(requestedColor);
  if (requestedFamily) {
    const match = availableColors.find((c) => familyOf(c)?.id === requestedFamily.id);
    if (match) return { color: match, sameFamily: true };
  }
  return null;
}
