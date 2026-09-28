#!/usr/bin/env node
// Assembles the final clients/febal-casa/catalog.json (and a matching .xlsx,
// for consistency with the rest of the pipeline) from:
//   - matched-catalog.json / unmatched-products.json (Fase 2 output)
//   - manual-captures.json (Fase 3 output, optional — may not exist yet)
//   - scraped-products.json (Fase 4 output, may be partial while scraping runs)
// Re-runnable: just run again after any of those inputs change.
//
// Usage: node scripts/build-febal-catalog.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOUR_DIR = path.join(ROOT, "tour-project", "febal-casa");
const CLIENT_DIR = path.join(ROOT, "clients", "febal-casa");
// Official images that show another product (Navigli's is a kitchen drawer) or a model it no longer is (FEB-037).
const TOUR_IMAGE_OVERRIDES = new Set(["FEB-037", "FEB-066"]);
function tourImage(productId, scrapedEntry) {
  const tour = path.join(CLIENT_DIR, "assets", "products", "tour", `${productId}.jpg`);
  const official = scrapedEntry && scrapedEntry.image_local_path;
  if (official && !TOUR_IMAGE_OVERRIDES.has(productId)) return official;
  return fs.existsSync(tour) ? `assets/febal-casa/products/tour/${productId}.jpg` : official || null;
}
fs.mkdirSync(CLIENT_DIR, { recursive: true });

function readJsonIfExists(p, fallback) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback;
}

const matched = readJsonIfExists(path.join(TOUR_DIR, "matched-catalog.json"), []);
const unmatched = readJsonIfExists(path.join(TOUR_DIR, "unmatched-products.json"), []);
const manualCaptures = readJsonIfExists(path.join(TOUR_DIR, "manual-captures.json"), []);
const scraped = readJsonIfExists(path.join(TOUR_DIR, "scraped-products.json"), {});

const manualByLabel = new Map(manualCaptures.map((c) => [c.product_label, c]));

// Enriched data (colors/materials/shape/style) only ever enters catalog.json
// via the catalog.xlsx -> xlsx-to-json.mjs roundtrip (Fase 3, human+Claude
// verified) or the style/compatible_with inference script — this build
// script has no source data for any of them. Re-running it (e.g. after new
// products get scraped/matched) must not silently wipe that prior work, so
// the previous catalog.json is loaded here and any existing non-empty
// colors/materials/shape/style for a product_id is carried forward instead
// of being reset to the hardcoded empty defaults below.
const previousCatalog = readJsonIfExists(path.join(CLIENT_DIR, "catalog.json"), []);

// product_id used to be `slugify(hotspot_name + name)` (e.g.
// "box-100-b-106-divano-balmoral") — long, and Andrea asked for short opaque
// codes instead ("FEB-001" style) since nothing in the codebase parses the
// id string (confirmed: it's only ever compared for exact equality). The
// short id itself can't double as the "is this the same row as before"
// lookup key anymore, so `naturalKey` (still the old slugify formula) plays
// that role internally: it's recomputed from each row's OWN hotspot_name+name
// every run, so it's stable regardless of what id scheme is active.
function naturalKey(hotspotName, name) {
  return slugify(`${hotspotName}-${name}`).slice(0, 80);
}

const previousByNaturalKey = new Map(
  previousCatalog.map((p) => [naturalKey(p.hotspot_name, p.name), p])
);

// Stable short-id assignment: if the previous run already minted a FEB-###
// for this exact row (matched via naturalKey), reuse it verbatim — that's
// what keeps ids (and everything that references them, like
// `compatible_with`) stable across reruns. Otherwise mint the next unused
// number. The FIRST run after this migration finds no FEB-### ids yet (every
// previous.product_id is still the old long slug), so every row gets a fresh
// one-time renumbering; `oldIdToNewId` records that old->new mapping so
// `compatible_with` arrays (which still hold OLD ids at that point) can be
// remapped in the second pass below instead of pointing at ids that no
// longer exist.
let nextIdNum =
  1 +
  previousCatalog.reduce((max, p) => {
    const m = /^FEB-(\d+)$/.exec(p.product_id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
const oldIdToNewId = new Map();

function assignProductId(key, previous) {
  if (previous && /^FEB-\d+$/.test(previous.product_id)) {
    return previous.product_id;
  }
  const id = `FEB-${String(nextIdNum).padStart(3, "0")}`;
  nextIdNum++;
  if (previous) oldIdToNewId.set(previous.product_id, id);
  return id;
}

// Category value stored on the product is CLIENT-FACING (Febal Casa is an
// Italian brand — the assistant's prose is forced to Italian in prompt.md,
// and this field can end up quoted/surfaced too, e.g. in card metadata or a
// future filter chip) — it must be Italian, not the internal matching
// language. Search-time multilingual coverage (a visitor typing "sofa" or
// "sillón") is handled separately below by CATEGORY_SYNONYMS, keyed by
// this same Italian label, NOT by mixing languages into the label itself
// (that was the previous bug: category was literally "sofás", so any path
// that echoed it back — even indirectly — leaked Spanish into an
// all-Italian assistant).
const CATEGORY_RULES = [
  [/divano letto|sof[aà] cama/i, "divani letto"],
  [/divano/i, "divani"],
  [/poltrona|poltrone/i, "poltrone"],
  [/tavolino/i, "tavolini"],
  [/tavolo/i, "tavoli"],
  [/sedia|sedie/i, "sedie"],
  [/sgabello/i, "sgabelli"],
  [/armadio|cabina armadio/i, "armadi"],
  [/cassettiera/i, "cassettiere"],
  [/libreria/i, "librerie"],
  [/madia|madie/i, "madie"],
  [/cucina|isola/i, "cucine"],
  [/boiserie/i, "boiserie"],
  [/letto|gruppo notte/i, "camera da letto"],
  [/consolle/i, "consolle"],
  [/pouff/i, "pouf"],
  [/vitrina/i, "vetrine"],
  [/sistema|origina|diciotto/i, "sistemi modulari"],
];

function categorize(name) {
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(name)) return cat;
  }
  return "altro";
}

// Extra multilingual (ES/IT/EN) terms per category, merged into every
// product's keywords — covers generic shopping phrasing ("silla"/"sedia"/
// "chair") that never appears in the product's own name, which is the #1
// reason search_catalog was scoring too few real matches and falling back
// to its irrelevant array-order padding (see FASE... conversation bug).
// Keyed by the Italian category label above (not by a Spanish string) —
// the Spanish/English terms still live here as SEARCH synonyms, just no
// longer as the stored/displayed category itself.
const CATEGORY_SYNONYMS = {
  "divani": ["sofa", "sofá", "sofás", "divano", "couch", "asiento"],
  "divani letto": ["sofa cama", "divano letto", "sofa bed", "sillon cama"],
  "poltrone": ["sillon", "sillón", "sillones", "poltrona", "armchair"],
  "tavolini": ["mesa de centro", "mesita", "tavolino", "coffee table"],
  "tavoli": ["mesa", "mesas", "tavolo", "table", "comedor"],
  "sedie": ["silla", "sillas", "sedia", "chair", "asiento"],
  "sgabelli": ["taburete", "taburetes", "banqueta", "sgabello", "stool", "bar"],
  "armadi": ["armario", "armarios", "closet", "ropero", "armadio", "wardrobe", "cabina armadio", "vestidor"],
  "cassettiere": ["comoda", "cómoda", "cómodas", "cajonera", "cassettiera", "dresser"],
  "librerie": ["libreria", "librería", "librerías", "estanteria", "estantería", "bookshelf", "estante"],
  "madie": ["aparador", "aparadores", "madia", "credenza", "sideboard", "buffet"],
  "cucine": ["cocina", "cocinas", "cucina", "kitchen", "isla"],
  "boiserie": ["panel", "paneles decorativos", "boiserie", "revestimiento", "pared", "decorativo", "columna", "vertical"],
  "camera da letto": ["cama", "dormitorio", "letto", "bed", "recamara", "recámara", "habitacion", "gruppo notte"],
  "consolle": ["consola", "consolas", "consolle", "console table", "recibidor"],
  "pouf": ["puff", "puffs", "pouff", "puf", "ottoman", "reposapies"],
  "vetrine": ["vitrina", "vitrinas", "vetrina", "display cabinet"],
  "sistemi modulari": ["sistema modular", "sistemas modulares", "modular", "sistema"],
};

const STOPWORDS = new Set([
  // Italian (scraped descriptions) + Spanish stopwords.
  "il","lo","la","i","gli","le","un","uno","una","di","del","della","dei","degli","delle",
  "e","ed","o","ma","che","con","per","tra","fra","su","in","a","da","al","allo","alla",
  "ai","agli","alle","dal","dallo","dalla","dai","dagli","dalle","nel","nello","nella",
  "sul","sullo","sulla","come","piu","più","anche","suo","sua","suoi","sue","questo",
  "questa","questi","queste","cui","non","si","è","sono","essere","puo","può",
  "el","los","las","de","del","con","por","para","en","es","su","sus","como","mas","más",
  "muy","este","esta","estos","estas","una","uno","unos","unas","al","lo",
]);

function extractDescriptionKeywords(description, max = 12) {
  if (!description) return [];
  const words = description
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) ?? 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([w]) => w);
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function keywordsFor(name, category, description) {
  const nameWords = String(name)
    .toLowerCase()
    .replace(/[()]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["del", "con", "per", "the"].includes(w));
  const categorySynonyms = CATEGORY_SYNONYMS[category] ?? [];
  const descriptionWords = extractDescriptionKeywords(description);
  return Array.from(new Set([...nameWords, category, ...categorySynonyms, ...descriptionWords]));
}

function buildRecord(row, isMatched) {
  const name = (row.prodotto_ita || row.prodotto_eng || "Producto sin nombre").trim();
  const category = categorize(name);
  // .trim() here is load-bearing, not defensive style — confirmed live: a
  // single trailing space on one row's link_ita (source spreadsheet artifact,
  // "BOX 320 - B_322" / Tavolo Madeira) made this exact-string lookup miss
  // the real scraped description that the SAME product's other placement
  // ("BOX 640 - B_644", identical trimmed URL) matched fine. That product
  // silently fell back to the generic one-line description below, then a
  // real customer asked for a round table and gpt-4o-mini — reading only
  // that placement's data — said none existed, while Sonnet found the
  // OTHER placement's real (round-top-capable) description and answered
  // correctly. Both models were reasoning correctly over what they were
  // given; the bug was a broken join upstream, not a model quality issue.
  const link = (row.link_ita || row.link_eng || null)?.trim() || null;
  const scrapedEntry = link ? scraped[link] : null;
  const manual = manualByLabel.get(row.nome);

  const key = naturalKey(row.nome, name);
  // `isMatched` alone means "Fase-2's coordinate-matcher paired this
  // spreadsheet row with SOME hotspot" — it says nothing about whether that
  // hotspot still exists. 2026-09-22: found 13 matched rows whose box number
  // has zero trace anywhere in extracted-hotspots.json OR a fresh live
  // re-scan of the running tour (1124 overlays checked) — the spreadsheet
  // documented a placement the .vtp file never had, from the very first
  // Fase-2 extraction, not a later regression. Every one of those 13 has a
  // real, camera-verified sibling under the same product name (see
  // HANDOFF_FEBAL_CASA.md), so hiding them costs nothing — but leaving them
  // `active` risks the model picking the ghost row (with its stale/never-
  // verified yaw/pitch/media_name) over the working sibling and sending a
  // visitor to a broken camera position. `no_live_hotspot` is hand-set on
  // exactly those 13 rows in matched-catalog.json.
  const hasCoords = (isMatched || !!manual) && !row.no_live_hotspot;

  let yaw = 0;
  let pitch = 0;
  let mediaName = null;
  // fov defaults to 70 (the tour's own native default) unless a live CDP
  // capture recorded the real value the shot needed — see
  // HANDOFF_FEBAL_CASA.md's manual capture session, 2026-09-17.
  let fov = 70;
  if (isMatched) {
    yaw = row.yaw;
    pitch = row.pitch;
    mediaName = row.media_name;
    if (typeof row.fov === "number") fov = row.fov;
  } else if (manual) {
    yaw = manual.yaw;
    pitch = manual.pitch;
    mediaName = manual.media_name;
    if (typeof manual.fov === "number") fov = manual.fov;
  }

  // CLIENT-FACING (see CATEGORY_RULES comment above on why this field must
  // be Italian) — this fallback fires whenever no real scraped description
  // exists yet, and was found in Spanish here (a real, live bug: 14 of 95
  // catalog products were shipping this exact Spanish sentence straight to
  // the model, which can narrate it verbatim to a visitor despite prompt.md
  // forcing Italian prose).
  const description =
    (scrapedEntry && scrapedEntry.description) ||
    `${name} — elemento della collezione Febal Casa, sezione ${row.casa || ""}.`.trim();

  const previous = previousByNaturalKey.get(key);
  const productId = assignProductId(key, previous);

  return {
    product_id: productId,
    name,
    category,
    description,
    colors: previous?.colors?.length ? previous.colors : [],
    materials: previous?.materials?.length ? previous.materials : [],
    keywords: keywordsFor(name, category, description),
    synonyms: [],
    section: row.casa || "Showroom",
    media_name: mediaName,
    yaw,
    pitch,
    fov,
    hotspot_name: row.nome || null,
    // No official image (or a wrong one, see TOUR_IMAGE_OVERRIDES): the piece as it looks in the tour,
    // cropped from its clean capture (clients/febal-casa/assets/products/tour/<id>.jpg).
    image_url: tourImage(productId, scrapedEntry) || "assets/febal-casa/placeholder-product.png",
    detail_url: link,
    alternatives_group: slugify(category),
    active: hasCoords,
    shape: previous?.shape || undefined,
    style: previous?.style?.length ? previous.style : [],
    finish: previous?.finish?.length ? previous.finish : [],
    compatible_with: previous?.compatible_with?.length ? previous.compatible_with : [],
    // internal bookkeeping fields, stripped before writing final files:
    _needs_review: !hasCoords || !scrapedEntry,
    _coord_source: isMatched ? "auto-extracted" : manual ? "manual-capture" : "none",
  };
}

const allRecords = [
  ...matched.map((r) => buildRecord(r, true)),
  ...unmatched.map((r) => buildRecord(r, false)),
];

// `compatible_with` was carried forward verbatim above and may still hold
// OLD-style product_ids if this run just performed the one-time FEB-###
// migration (see assignProductId) — every new id is known now, so remap.
// A no-op on every run after the migration, since oldIdToNewId stays empty
// once all previous ids are already FEB-###.
if (oldIdToNewId.size > 0) {
  for (const record of allRecords) {
    record.compatible_with = record.compatible_with.map((id) => oldIdToNewId.get(id) ?? id);
  }
}

// --- write catalog.full.json (everything, including unresolved rows, for inspection) ---
fs.writeFileSync(path.join(CLIENT_DIR, "catalog.full.json"), JSON.stringify(allRecords, null, 2), "utf8");

// catalog.json (what the pipeline actually loads/validates) only includes
// rows with REAL coordinates (auto-matched or manually captured). Rows still
// missing coordinates would fail schema validation (media_name/image_url
// can't be a fake placeholder) and are tracked separately for Fase 3 instead
// of polluting the live catalog with invented data.
const skippedNoCoords = allRecords.filter((r) => r._coord_source === "none").length;
const clean = allRecords
  .filter((r) => r._coord_source !== "none")
  .map(({ _needs_review, _coord_source, ...rest }) => rest);
fs.writeFileSync(path.join(CLIENT_DIR, "catalog.json"), JSON.stringify(clean, null, 2), "utf8");

// --- write catalog.xlsx (same 18-column schema as demo-showroom/showroom-real) ---
const HEADERS = [
  "product_id", "name", "category", "description", "colors", "materials", "keywords",
  "synonyms", "section", "media_name", "yaw", "pitch", "fov", "hotspot_name", "image_url",
  "detail_url", "alternatives_group", "active", "shape", "style", "finish",
];
const rows = [HEADERS, ...clean.map((r) => [
  r.product_id, r.name, r.category, r.description, r.colors.join(", "), r.materials.join(", "),
  r.keywords.join(", "), r.synonyms.join(", "), r.section, r.media_name ?? "",
  r.yaw, r.pitch, r.fov, r.hotspot_name ?? "", r.image_url, r.detail_url ?? "",
  r.alternatives_group, r.active ? "TRUE" : "FALSE", r.shape ?? "", r.style.join(", "), r.finish.join(", "),
])];
const ws = xlsx.utils.aoa_to_sheet(rows);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, "products");
xlsx.writeFile(wb, path.join(CLIENT_DIR, "catalog.xlsx"));

const withRealImage = clean.filter((r) => r.image_url && !r.image_url.includes("placeholder-product")).length;
const activeCount = clean.filter((r) => r.active).length;
console.log(`Built ${clean.length} catalog records (${activeCount} active, ${clean.length - activeCount} flagged no_live_hotspot).`);
console.log(`  skipped (no coordinates yet — see catalog.full.json + unmatched-products.json): ${skippedNoCoords}`);
console.log(`  with real scraped image: ${withRealImage} / ${clean.length} (rest use the logo placeholder)`);
console.log(`\nWrote:\n  ${path.join(CLIENT_DIR, "catalog.json")}\n  ${path.join(CLIENT_DIR, "catalog.xlsx")}\n  ${path.join(CLIENT_DIR, "catalog.full.json")} (debug, includes review flags)`);
