#!/usr/bin/env node
// Infers `style` and `compatible_with` for every product in
// clients/febal-casa/catalog.json (both fields new — see catalog-engine's
// ProductSchema doc comments for what they mean and how they differ from
// `category`/`alternatives_group`). Source data is the client's own
// original Italian product descriptions + the products' real staged
// panorama placement — never external/invented content.
//
// style: keyword-matched from description text (client's own marketing
// copy) against a small controlled vocabulary, with a category-based
// default when a description is pure boilerplate ("X — pieza de la
// colección Febal Casa, sección Y.") and has no descriptive adjectives to
// match on. `colors`/`materials` stay empty here — this catalog's scraped
// descriptions are generic marketing copy that essentially never names a
// specific finish/material, so there's nothing real to infer them from
// (confirmed by inspection: 0/95 products have any such wording). Filling
// those would need per-product spec-sheet data, out of scope here.
//
// compatible_with: the strongest real signal already in this catalog is
// which products share a `media_name` — Febal's own stylists physically
// staged those pieces together in the same real photographed room, which
// IS the "designed to pair together" relationship the client described
// wanting (as opposed to `alternatives_group`, which this deliberately
// excludes — a same-room OTHER PRODUCT is a companion piece, not a
// substitute for this one).

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CATALOG_PATH = path.join(ROOT, "clients", "febal-casa", "catalog.json");

const STYLE_KEYWORDS = {
  Minimal: ["minimal", "essenzial", "rigore", "lineare", "lineari", "pulit", "sobri"],
  "Contemporáneo": [
    "contemporane", "moderno", "moderna", "moderni", "distintivo", "attuale", "geometric", "architettonic",
  ],
  "Clásico elegante": ["elegante", "eleganza", "classico", "classici", "raffinat", "prezios", "sartorial", "senza tempo"],
  "Cálido acogedor": ["accogliente", "accoglienza", "avvolgente", "avvolgenza", "calore", "morbid", "comfort", "confort"],
};

// Only used when a description is pure boilerplate and matches none of the
// keyword lists above — a reasonable category-level prior, not a per-product guess.
const CATEGORY_STYLE_DEFAULT = {
  "cocinas": "Contemporáneo",
  "sistemas modulares": "Contemporáneo",
  "paneles decorativos": "Minimal",
  "armarios": "Contemporáneo",
  "dormitorio": "Clásico elegante",
};
const FALLBACK_STYLE = "Contemporáneo";

const MAX_COMPATIBLE = 4;

function inferStyles(product) {
  const haystack = product.description.toLowerCase();
  const hits = [];
  for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
    const count = keywords.reduce((n, kw) => n + (haystack.includes(kw) ? 1 : 0), 0);
    if (count > 0) hits.push({ style, count });
  }
  if (hits.length === 0) {
    return [CATEGORY_STYLE_DEFAULT[product.category] ?? FALLBACK_STYLE];
  }
  hits.sort((a, b) => b.count - a.count);
  // Keep at most the top 2 distinct styles — enough to reflect a product
  // that genuinely reads as e.g. both "elegant" and "cozy", without diluting
  // the wishlist's style-counting with every loosely-matched tag.
  return hits.slice(0, 2).map((h) => h.style);
}

function inferCompatibleWith(product, catalog) {
  const roommatesRaw = catalog.filter(
    (p) =>
      p.product_id !== product.product_id &&
      p.media_name === product.media_name &&
      p.alternatives_group !== product.alternatives_group
  );
  // Same-name dedup FIRST — several catalog rows are two separate hotspot
  // markers on the literal same physical piece staged in the same room
  // (confirmed live: e.g. two "Tavolino Rio" markers in media 11). Without
  // this, a product with two same-name roommates got that one companion
  // counted as two separate compatible_with entries, and get_product would
  // tell a visitor a sofa "combina con Tavolino Rio y Tavolino Rio" — the
  // same item listed twice as if they were different companions.
  const seenNames = new Set();
  const roommates = roommatesRaw.filter((rm) => {
    if (seenNames.has(rm.name)) return false;
    seenNames.add(rm.name);
    return true;
  });
  // Prefer category diversity first (a sofa's real companions are a coffee
  // table/chair/lamp, not three more sofas), then fall back to whatever's
  // left if there's room under the cap.
  const seenCategories = new Set();
  const diverse = [];
  const rest = [];
  for (const rm of roommates) {
    if (!seenCategories.has(rm.category)) {
      seenCategories.add(rm.category);
      diverse.push(rm);
    } else {
      rest.push(rm);
    }
  }
  return [...diverse, ...rest].slice(0, MAX_COMPATIBLE).map((p) => p.product_id);
}

function main() {
  const catalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));

  for (const product of catalog) {
    product.style = inferStyles(product);
  }
  // compatible_with computed in a second pass so it can see every
  // product's final data (not needed today, but keeps the two passes
  // independent/order-safe if either inference grows more fields later).
  for (const product of catalog) {
    product.compatible_with = inferCompatibleWith(product, catalog);
  }

  writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2) + "\n", "utf8");

  const styleCounts = {};
  let withCompat = 0;
  for (const p of catalog) {
    for (const s of p.style) styleCounts[s] = (styleCounts[s] ?? 0) + 1;
    if (p.compatible_with.length > 0) withCompat++;
  }
  console.log(`OK: ${catalog.length} products enriched.`);
  console.log("Style distribution:", styleCounts);
  console.log(`Products with >=1 compatible_with: ${withCompat}/${catalog.length}`);
}

main();
