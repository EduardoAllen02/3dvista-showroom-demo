/**
 * Febal Casa source adapter: how febalcasa.com and the tour's piece list name things.
 * Not part of the assistant's core — another client's source gets its own adapter
 * (the generic compiler only asks for categories, names and roles).
 */
import type { ComponentRole, ConceptId } from "../../catalog/types.js";
import { normalizeText } from "../../ontology/lexicon.js";

/** Minimal shape of a piece row the Febal mapping reads. */
interface PieceRow { name: string; category: string }

export const NAME_OVERRIDES: Record<string, string> = {
  arden: "Arden", astrid: "Astrid", couple: "Couple", "febal-notte-gruppo-como-e-comodino-marlene": "Marlene",
  "tipologia-mobili-di-servizi-mobili-di-servizi-laundry": "Laundry", "tipologia-momenti-cameretta": "Momenti (camerette)",
};

export const CATEGORY_MAP: Record<string, ConceptId> = {
  divani: "category.sofa", poltrone: "category.armchair", pouf: "category.pouf", sedie: "category.chair",
  sgabelli: "category.stool", tavoli: "category.dining_table", tavolini: "category.coffee_table", madie: "category.sideboard",
  librerie: "category.bookcase", "sistemi modulari": "category.modular_system", cucine: "category.kitchen",
  armadi: "category.wardrobe", cassettiere: "category.drawer_unit", "camera da letto": "category.bed",
  boiserie: "category.boiserie", altro: "category.mirror",
};

/** Models with no piece in the tour take their category from the page ("gruppo notte: comodino, comò, settimino"). */
export const MODEL_CATEGORY: Record<string, ConceptId> = { astrid: "category.night_group" };

export function pieceCategory(p: PieceRow): ConceptId {
  const n = normalizeText(p.name);
  if (n.startsWith("cabina armadio")) return "category.walk_in_closet";
  if (n.startsWith("gruppo notte")) return "category.night_group";
  if (n.startsWith("specchio")) return "category.mirror";
  if (n.startsWith("tavolin")) return "category.coffee_table";   // "Tavolini Ink": its page says "coffee table"
  return CATEGORY_MAP[p.category] ?? "category.modular_system";
}

/** Febal pages name the part an option list dresses in their group titles ("Piedi", "Frontali", "Telaio"). */
export function febalRoleFromTitles(groupTitle: string | null, collection: string): ComponentRole[] | null {
  const g = normalizeText(groupTitle ?? ""), c = normalizeText(collection);
  if (/piedi|struttura|metallo$/.test(c) || g.startsWith("struttura")) return ["base", "legs"];
  if (g.startsWith("piano") || g === "top") return ["top"];
  if (/interne|interno|cassa interna/.test(g + " " + c)) return ["interior"];
  if (/frontali|anta/.test(g) || /vetro onda|^vetri?$|frontal/.test(c)) return ["front", "doors"];
  if (/telaio/.test(c)) return ["frame"];
  if (/fianchi|cassa|schien/.test(g)) return ["carcass"];
  return null;
}
