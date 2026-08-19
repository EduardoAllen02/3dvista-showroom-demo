#!/usr/bin/env -S npx tsx
// Validates clients/<tour>/catalog.json against the canonical schema and
// cross-record rules (unique id, known media_name, no raw HTML/JS, etc).
// Usage: tsx scripts/validate-catalog.mjs <tour-name>
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateCatalog } from "../packages/catalog-engine/src/index.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function main() {
  const tour = process.argv[2];
  if (!tour) {
    console.error("Usage: tsx scripts/validate-catalog.mjs <tour-name>");
    process.exit(1);
  }

  const clientDir = path.join(ROOT, "clients", tour);
  const catalogPath = path.join(clientDir, "catalog.json");
  const configPath = path.join(clientDir, "tour.config.json");

  const catalog = JSON.parse(readFileSync(catalogPath, "utf8"));
  const tourConfig = JSON.parse(readFileSync(configPath, "utf8"));
  const knownMediaNames = (tourConfig.media ?? []).map((m) => m.media_name ?? m);

  const report = validateCatalog(catalog, knownMediaNames);

  if (report.ok) {
    console.log(`OK: ${catalog.length} productos válidos en ${path.relative(ROOT, catalogPath)}`);
    process.exit(0);
  }

  console.error(`FALLÓ la validación de ${path.relative(ROOT, catalogPath)}:\n`);
  for (const issue of report.issues) {
    const idPart = issue.product_id ? ` [${issue.product_id}]` : "";
    console.error(`  - (${issue.rule})${idPart} ${issue.message}`);
  }
  process.exit(1);
}

main();
