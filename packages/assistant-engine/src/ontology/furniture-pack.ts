import type { OntologyPack } from "./types.js";
import FURNITURE from "../packs/furniture.json" with { type: "json" };

/**
 * Ontology pack "furniture" (es / it / en), as data: src/packs/furniture.json.
 * Everything in it is vocabulary and domain knowledge, not product data: which surface
 * forms mean the same concept, which concepts are close, which colours combine (a DRAFT
 * until the client signs it), moods, and the furniture rules the engine and the compiler
 * need (what goes with what, which part of a piece its options dress…).
 * Another kind of venue (a decoration shop, a museum) is another pack file, not new code.
 */
export const FURNITURE_PACK = FURNITURE as unknown as OntologyPack;
