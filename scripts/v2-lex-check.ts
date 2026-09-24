import { Lexicon, FURNITURE_PACK } from "../packages/assistant-engine/src/index.js";
const lx = new Lexicon(FURNITURE_PACK);
for (const q of ["sofá en L", "sofá curvo", "sofá de cuero", "sofá de piel", "sofá rojo", "sofá color vino", "algo elegante", "algo fino", "mesa redonda", "rinconero", "terciopelo", "velluto", "mostaza", "estilo nórdico"]) console.log(q.padEnd(20), lx.match(q).map((m) => m.concept).join(", ") || "—");
const facets = ["shape", "material", "color", "style", "category", "mood"] as const;
for (const f of facets) { const cs = lx.byFacet(f); console.log(f.padEnd(9), cs.length, "conceptos,", cs.reduce((n, c) => n + Object.values(c.synonyms).flat().length, 0), "sinónimos"); }
