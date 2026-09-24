import type { ConceptId, Lang } from "../catalog/types.js";
import type { Concept, ConceptRelation, Facet, OntologyPack } from "./types.js";

/** Lowercase, strip accents/diacritics, unify apostrophes and whitespace. */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’'`´]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Singular/plural variants of the LAST token (es/en "-s/-es", it "-i/-e"). */
function tokenVariants(tok: string): string[] {
  const v = new Set([tok]);
  if (tok.length > 3) {
    if (tok.endsWith("es")) v.add(tok.slice(0, -2));
    if (tok.endsWith("s")) v.add(tok.slice(0, -1));
    if (tok.endsWith("i")) { v.add(tok.slice(0, -1) + "o"); v.add(tok.slice(0, -1) + "e"); }
    if (tok.endsWith("e")) v.add(tok.slice(0, -1) + "a");
  }
  return [...v];
}

export interface LexiconMatch {
  concept: ConceptId;
  facet: Facet;
  surface: string;   // normalized surface form that matched
  start: number;     // token index
  end: number;       // exclusive token index
}

export class Lexicon {
  readonly concepts = new Map<ConceptId, Concept>();
  private readonly forms = new Map<string, Set<ConceptId>>(); // normalized form -> concepts
  private maxTokens = 1;
  private readonly relations: ConceptRelation[];

  constructor(readonly pack: OntologyPack) {
    this.relations = pack.relations;
    for (const concept of pack.concepts) {
      this.concepts.set(concept.id, concept);
      const surfaces = [...Object.values(concept.labels), ...Object.values(concept.synonyms).flat()];
      for (const s of surfaces) this.addForm(s, concept.id);
    }
  }

  private addForm(surface: string, id: ConceptId) {
    const norm = normalizeText(surface);
    if (!norm) return;
    const toks = norm.split(" ");
    this.maxTokens = Math.max(this.maxTokens, toks.length);
    if (!this.forms.has(norm)) this.forms.set(norm, new Set());
    this.forms.get(norm)!.add(id);
  }

  /** All concept mentions in a free text; overlapping spans resolved longest-first. */
  match(text: string, facets?: Facet[]): LexiconMatch[] {
    const toks = normalizeText(text).split(" ").filter(Boolean);
    const found: LexiconMatch[] = [];
    for (let i = 0; i < toks.length; i++) {
      for (let len = Math.min(this.maxTokens, toks.length - i); len >= 1; len--) {
        const head = toks.slice(i, i + len - 1);
        for (const last of tokenVariants(toks[i + len - 1])) {
          const form = [...head, last].join(" ");
          const ids = this.forms.get(form);
          if (!ids) continue;
          for (const id of ids) {
            const concept = this.concepts.get(id)!;
            if (facets && !facets.includes(concept.facet)) continue;
            found.push({ concept: id, facet: concept.facet, surface: form, start: i, end: i + len });
          }
        }
      }
    }
    // Longest span wins over any span it overlaps; equal spans keep every concept.
    found.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
    const kept: LexiconMatch[] = [];
    for (const m of found) {
      const clash = kept.some((k) => m.start < k.end && k.start < m.end && (k.end - k.start) > (m.end - m.start));
      const dup = kept.some((k) => k.concept === m.concept && k.start === m.start && k.end === m.end);
      if (!clash && !dup) kept.push(m);
    }
    return kept.sort((a, b) => a.start - b.start);
  }

  facetOf(id: ConceptId): Facet | undefined {
    return this.concepts.get(id)?.facet;
  }

  label(id: ConceptId, lang: Lang): string {
    return this.concepts.get(id)?.labels[lang] ?? id;
  }

  /** is_a (reflexive, transitive): isA("material.velvet", "material.fabric") === true. */
  isA(id: ConceptId, ancestor: ConceptId): boolean {
    let cur: ConceptId | undefined = id;
    for (let guard = 0; cur && guard < 10; guard++) {
      if (cur === ancestor) return true;
      cur = this.concepts.get(cur)?.parent;
    }
    return false;
  }

  /** Neighbours of a concept through a relation type, symmetric. */
  neighbours(id: ConceptId, type: ConceptRelation["type"]): { to: ConceptId; distance: number; status: string }[] {
    const out: { to: ConceptId; distance: number; status: string }[] = [];
    for (const r of this.relations) {
      if (r.type !== type) continue;
      if (r.from === id) out.push({ to: r.to, distance: r.distance, status: r.status });
      else if (r.to === id) out.push({ to: r.from, distance: r.distance, status: r.status });
    }
    return out.sort((a, b) => a.distance - b.distance);
  }

  byFacet(facet: Facet): Concept[] {
    return this.pack.concepts.filter((c) => c.facet === facet);
  }
}
