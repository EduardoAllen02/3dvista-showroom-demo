import { readFileSync } from "node:fs";
const R = "../";
import { Lexicon } from "../packages/assistant-engine/src/ontology/lexicon.js";
import { FURNITURE_PACK } from "../packages/assistant-engine/src/ontology/furniture-pack.js";
import { QueryEngine } from "../packages/assistant-engine/src/engine/engine.js";
const cat = JSON.parse(readFileSync("clients/febal-casa/catalog.v2.json", "utf8"));
const lx = new Lexicon(FURNITURE_PACK); const eng = new QueryEngine(cat, lx);
const name = (id: string) => eng.exhibits.get(id)?.name;
let n = 0;
const C = (facet: string, value: string, role = "new", extra: any = {}) => ({ id: `c${++n}`, facet, op: "is", value, role, emphasis: "normal", strength: "must", ...extra });
const show = (title: string, b: any) => {
  console.log(`\n### ${title} → ${b.outcome}  oblig=${b.obligations.join(",")}`);
  for (const g of b.groups) console.log(`  [${g.id} ${g.role}${g.relaxation.length ? " " + g.relaxation.map((o: any) => `${o.kind}:${o.constraint}${o.to ? "→" + o.to : ""}(${o.cost.toFixed(1)})`).join("+") : ""}] ` +
    g.cards.map((c: any) => `${c.exhibit_id} ${name(c.exhibit_id)} [${c.availability}${c.variants ? ": " + c.variants.map((v: any) => v.group_name + " " + v.option_names.slice(0, 3).join("/")).join("; ") : ""}] ${JSON.stringify(c.match)}`).join("\n      "));
  if (b.available_values.length) console.log("  vals:", JSON.stringify(b.available_values));
};
show("UC-1 sofá de cuero", eng.search([C("category", "category.sofa", "frame"), C("material", "material.leather")]));
n = 0; show("UC-3a sofás de ángulo", eng.search([C("category", "category.sofa", "frame"), C("shape", "shape.corner")]));
n = 0; show("UC-3b ...en amarillo", eng.search([C("category", "category.sofa", "frame"), C("shape", "shape.corner", "frame"), C("color", "color.yellow")]));
n = 0; show("UC-2 Balmoral (FEB-003) en café", eng.search([C("category", "category.sofa", "frame"), C("model", "balmoral", "frame"), C("color", "color.brown")]));
n = 0; show("UC-6 mesa redonda", eng.search([C("category", "category.table", "frame"), C("shape", "shape.round")]));
n = 0; show("UC-7 sofá rosa", eng.search([C("category", "category.sofa", "frame"), C("color", "color.pink")]));
n = 0; show("UC-7 estilo industrial", eng.search([C("style", "style.industrial")]));
n = 0; show("UC-13 todos los sofás", eng.list([C("category", "category.sofa", "frame")]));
n = 0; show("UC-4 cocinas", eng.list([C("category", "category.kitchen", "frame")]));
show("UC-10 dónde está Madeira", eng.locate("madeira"));
show("UC-12 medidas Madeira", eng.detail("FEB-052", ["dimensions", "materials"]));
show("UC-8 recomienda con Balmoral", eng.recommend(["FEB-003"]));
