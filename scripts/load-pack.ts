/**
 * The ontology pack a tour runs with: the code's FURNITURE_PACK plus the client's edits
 * (clients/<tour>/ontology.overrides.json, written by scripts/import-database-xlsx.py).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { FURNITURE_PACK } from "../packages/assistant-engine/src/ontology/furniture-pack.js";
import { applyOverrides, type PackOverrides } from "../packages/assistant-engine/src/ontology/overrides.js";
import type { OntologyPack } from "../packages/assistant-engine/src/ontology/types.js";
import { resolveProfile, type AssistantProfile } from "../packages/assistant-engine/src/turn/profile.js";

export function loadPack(tour: string): OntologyPack {
  const p = path.resolve(import.meta.dirname, "..", "clients", tour, "ontology.overrides.json");
  return applyOverrides(FURNITURE_PACK, existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as PackOverrides) : null);
}

/** Who the assistant is in that tour (clients/<tour>/assistant.json); defaults when absent. */
export function loadProfile(tour: string): AssistantProfile {
  const p = path.resolve(import.meta.dirname, "..", "clients", tour, "assistant.json");
  return resolveProfile(existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as Partial<AssistantProfile>) : null);
}
