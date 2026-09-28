import type { ConceptId, Lang } from "../catalog/types.js";
import type { OntologyPack, RelationType } from "./types.js";

/**
 * Client edits to the vocabulary, kept as data outside the code
 * (clients/<tour>/ontology.overrides.json, written by scripts/import-database-xlsx.py):
 * labels and synonyms per concept, status/distance of a relation, and mood preferences.
 * Only existing concepts and relations can be edited; the concept set stays the pack's.
 */
export interface PackOverrides {
  concepts?: Record<ConceptId, { labels?: Partial<Record<Lang, string>>; synonyms?: Partial<Record<Lang, string[]>> }>;
  relations?: { from: ConceptId; to: ConceptId; type: RelationType; status?: "draft" | "signed"; distance?: number }[];
  moods?: Record<ConceptId, ConceptId[]>;
}

export function applyOverrides(pack: OntologyPack, o: PackOverrides | null | undefined): OntologyPack {
  if (!o) return pack;
  const concepts = pack.concepts.map((c) => {
    const e = o.concepts?.[c.id];
    return e ? { ...c, labels: { ...c.labels, ...e.labels }, synonyms: { ...c.synonyms, ...e.synonyms } } : c;
  });
  const key = (r: { from: string; to: string; type: string }) => `${r.type}|${r.from}|${r.to}`;
  const edits = new Map((o.relations ?? []).map((r) => [key(r), r]));
  const relations = pack.relations.map((r) => {
    const e = edits.get(key(r));
    return e ? { ...r, status: e.status ?? r.status, distance: e.distance ?? r.distance } : r;
  });
  const moods = pack.moods.map((m) => (o.moods?.[m.mood] ? { ...m, prefer: o.moods[m.mood] } : m));
  return { ...pack, version: `${pack.version}+client`, concepts, relations, moods };
}
