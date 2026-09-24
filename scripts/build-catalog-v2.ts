/**
 * Builds the canonical v2 catalog for a tour from its sourced product facts.
 *
 *   npx tsx scripts/build-catalog-v2.ts febal-casa           # dev mode (pending facts usable)
 *   npx tsx scripts/build-catalog-v2.ts febal-casa --strict  # only facts validated by the client
 *
 * Inputs:  tour-project/<tour>/product-facts/{models,model-attributes,placements?}.json,
 *          *.reviewed.json (client review, when present), clients/<tour>/catalog.json (tour binding).
 * Outputs: clients/<tour>/catalog.v2.json and clients/<tour>/catalog.v2.gates.json
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compileCatalog, type RawObservation, type RawReview } from "../packages/assistant-engine/src/catalog/compile.js";
import { Lexicon } from "../packages/assistant-engine/src/ontology/lexicon.js";
import { FURNITURE_PACK } from "../packages/assistant-engine/src/ontology/furniture-pack.js";

const tour = process.argv[2] ?? "febal-casa";
const strict = process.argv.includes("--strict");
const root = path.resolve(import.meta.dirname, "..");
const facts = path.join(root, "tour-project", tour, "product-facts");
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));

// Tour observations: captures (placements.json) when present, else the earlier sample.
const observations: Record<string, RawObservation> = {};
const placementsPath = path.join(facts, "placements.json");
const samplePath = path.join(root, ".scratch", "enrichment-findings.json");
if (existsSync(placementsPath)) {
  for (const p of read(placementsPath) as { product_id: string; observed?: RawObservation }[]) {
    if (p.observed) observations[p.product_id] = p.observed;
  }
} else if (existsSync(samplePath)) {
  for (const [id, o] of Object.entries(read(samplePath) as Record<string, RawObservation>)) {
    if ((o.colors?.length ?? 0) || (o.materials?.length ?? 0)) observations[id] = o;
  }
}
const reviewPath = path.join(facts, "review.reviewed.json");
const review: RawReview | undefined = existsSync(reviewPath) ? read(reviewPath) : undefined;

const { catalog, report } = compileCatalog({
  tour_id: tour,
  data_version: new Date().toISOString().slice(0, 10) + (strict ? "-strict" : "-dev"),
  mode: strict ? "strict" : "dev",
  models: read(path.join(facts, "models.json")),
  attributes: read(path.join(facts, "model-attributes.json")),
  pieces: read(path.join(root, "clients", tour, "catalog.json")),
  observations,
  ignore_legacy_values: ["FEB-026", "FEB-027"], // seeded test data (HANDOFF_FEBAL_CASA.md)
  review,
  lexicon: new Lexicon(FURNITURE_PACK),
});

writeFileSync(path.join(root, "clients", tour, "catalog.v2.json"), JSON.stringify(catalog));
writeFileSync(path.join(root, "clients", tour, "catalog.v2.gates.json"), JSON.stringify(report, null, 1));
console.log(`catalog.v2 (${catalog.mode}): ${catalog.models.length} models, ${catalog.exhibits.length} exhibits, ${catalog.facts.length} facts, ` +
  `${catalog.models.reduce((n, m) => n + m.option_groups.reduce((k, g) => k + g.options.length, 0), 0)} options`);
for (const g of report.gates) console.log(`  ${g.ok ? "OK " : "-- "}${g.id} ${g.label}: ${g.pass}/${g.total}`);
