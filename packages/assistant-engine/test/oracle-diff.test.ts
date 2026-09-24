/**
 * L1 differential test: engine vs independent oracle over every 1–3 constraint combination
 * of the values present in the catalog. Must report 0 differences.
 *   npm test -w packages/assistant-engine
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CanonicalCatalog } from "../src/catalog/types.js";
import { Lexicon } from "../src/ontology/lexicon.js";
import { FURNITURE_PACK } from "../src/ontology/furniture-pack.js";
import { QueryEngine } from "../src/engine/engine.js";
import type { ActiveConstraint } from "../src/engine/types.js";
import { Oracle, type OracleConstraint } from "../../../eval/oracle.js";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const catalog: CanonicalCatalog = JSON.parse(readFileSync(path.join(ROOT, "clients/febal-casa/catalog.v2.json"), "utf8"));
const lx = new Lexicon(FURNITURE_PACK);
const engine = new QueryEngine(catalog, lx);
const oracle = new Oracle(catalog, FURNITURE_PACK);

const present = (facet: string) => [...new Set(FURNITURE_PACK.concepts.filter((c) => c.facet === facet).map((c) => c.id))];
const categories = [...new Set(catalog.exhibits.map((e) => e.category))].concat("category.seating", "category.table", "category.bedroom", "category.wardrobe");
const colors = present("color");
const materials = present("material");
const shapes = present("shape");
const styles = present("style");

function toEngine(cs: OracleConstraint[]): ActiveConstraint[] {
  return cs.map((c, i) => ({ id: `c${i + 1}`, facet: c.facet as ActiveConstraint["facet"], op: c.op, value: c.value, role: i === cs.length - 1 ? "new" : "frame", emphasis: "normal", strength: "must" }));
}

function* combos(): Generator<OracleConstraint[]> {
  const is = (facet: string, value: string): OracleConstraint => ({ facet, op: "is", value });
  const others = [...colors.map((v) => is("color", v)), ...materials.map((v) => is("material", v)), ...shapes.map((v) => is("shape", v)), ...styles.map((v) => is("style", v))];
  for (const o of others) yield [o];
  for (const cat of [...new Set(categories)]) {
    yield [is("category", cat)];
    for (const o of others) yield [is("category", cat), o];
    for (const col of colors) {
      yield [is("category", cat), { facet: "color", op: "not", value: col }];
      for (const o of [...materials.map((v) => is("material", v)), ...shapes.map((v) => is("shape", v))]) yield [is("category", cat), o, is("color", col)];
    }
  }
}

test("engine ≡ oracle on every 1–3 constraint combination (exhibited and on-order sets)", () => {
  let n = 0;
  const diffs: string[] = [];
  for (const cs of combos()) {
    n++;
    const r = engine.evaluate(toEngine(cs));
    const e1 = new Set(r.T1.map((c) => c.exhibit_id)), o1 = oracle.exhibited(cs);
    const e2 = new Set(r.T2.map((c) => c.model_id)), o2 = oracle.onOrder(cs);
    const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
    if (!same(e1, o1) || !same(e2, o2)) {
      diffs.push(`${JSON.stringify(cs)} T1 engine=[${[...e1]}] oracle=[${[...o1]}] T2 engine=[${[...e2]}] oracle=[${[...o2]}]`);
    }
  }
  if (diffs.length) console.log(diffs.slice(0, 10).join("\n"));
  console.log(`checked ${n} combinations, ${diffs.length} differences`);
  assert.equal(diffs.length, 0);
});
