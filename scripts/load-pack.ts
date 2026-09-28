/**
 * The ontology pack a tour runs with: the code's FURNITURE_PACK plus the client's edits
 * (clients/<tour>/ontology.overrides.json, written by scripts/import-database-xlsx.py).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { FURNITURE_PACK } from "../packages/assistant-engine/src/ontology/furniture-pack.js";
import { applyOverrides, type PackOverrides } from "../packages/assistant-engine/src/ontology/overrides.js";
import type { OntologyPack } from "../packages/assistant-engine/src/ontology/types.js";

export function loadPack(tour: string): OntologyPack {
  const p = path.resolve(import.meta.dirname, "..", "clients", tour, "ontology.overrides.json");
  return applyOverrides(FURNITURE_PACK, existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as PackOverrides) : null);
}
