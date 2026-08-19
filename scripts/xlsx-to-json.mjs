#!/usr/bin/env node
// Converts clients/<tour>/catalog.xlsx -> clients/<tour>/catalog.json
// Usage: node scripts/xlsx-to-json.mjs <tour-name>
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import xlsx from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const ARRAY_FIELDS = new Set(["colors", "materials", "keywords", "synonyms"]);
const NUMBER_FIELDS = new Set(["yaw", "pitch", "fov"]);
const BOOLEAN_FIELDS = new Set(["active"]);
const NULLABLE_STRING_FIELDS = new Set(["hotspot_name", "detail_url"]);

function coerceCell(field, value) {
  if (value === undefined || value === null || value === "") {
    if (ARRAY_FIELDS.has(field)) return [];
    if (NULLABLE_STRING_FIELDS.has(field)) return null;
    return value ?? "";
  }
  if (ARRAY_FIELDS.has(field)) {
    return String(value)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (NUMBER_FIELDS.has(field)) return Number(value);
  if (BOOLEAN_FIELDS.has(field)) {
    const s = String(value).trim().toUpperCase();
    return s === "TRUE" || s === "1" || s === "YES";
  }
  return String(value).trim();
}

function main() {
  const tour = process.argv[2];
  if (!tour) {
    console.error("Usage: node scripts/xlsx-to-json.mjs <tour-name>");
    process.exit(1);
  }

  const clientDir = path.join(ROOT, "clients", tour);
  const xlsxPath = path.join(clientDir, "catalog.xlsx");
  const jsonPath = path.join(clientDir, "catalog.json");

  const buf = readFileSync(xlsxPath);
  const workbook = xlsx.read(buf, { type: "buffer" });
  const sheet = workbook.Sheets["products"] ?? workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    console.error(`No se encontró una hoja "products" (ni ninguna hoja) en ${xlsxPath}`);
    process.exit(1);
  }

  const rows = xlsx.utils.sheet_to_json(sheet, { defval: "" });
  const records = rows.map((row) => {
    const record = {};
    for (const [field, value] of Object.entries(row)) {
      record[field] = coerceCell(field, value);
    }
    return record;
  });

  writeFileSync(jsonPath, JSON.stringify(records, null, 2) + "\n", "utf8");
  console.log(`OK: ${records.length} productos escritos en ${path.relative(ROOT, jsonPath)}`);
}

main();
