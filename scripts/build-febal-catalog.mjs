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
fs.mkdirSync(CLIENT_DIR, { recursive: true });

function readJsonIfExists(p, fallback) {
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : fallback;
}

const matched = readJsonIfExists(path.join(TOUR_DIR, "matched-catalog.json"), []);
const unmatched = readJsonIfExists(path.join(TOUR_DIR, "unmatched-products.json"), []);
const manualCaptures = readJsonIfExists(path.join(TOUR_DIR, "manual-captures.json"), []);
const scraped = readJsonIfExists(path.join(TOUR_DIR, "scraped-products.json"), {});

const manualByLabel = new Map(manualCaptures.map((c) => [c.product_label, c]));

const CATEGORY_RULES = [
  [/divano letto|sof[aà] cama/i, "sofás cama"],
  [/divano/i, "sofás"],
  [/poltrona|poltrone/i, "sillones"],
  [/tavolino/i, "mesas de centro"],
  [/tavolo/i, "mesas"],
  [/sedia|sedie/i, "sillas"],
  [/sgabello/i, "taburetes"],
  [/armadio|cabina armadio/i, "armarios"],
  [/cassettiera/i, "cómodas"],
  [/libreria/i, "librerías"],
  [/madia|madie/i, "aparadores"],
  [/cucina|isola/i, "cocinas"],
  [/boiserie/i, "paneles decorativos"],
  [/letto|gruppo notte/i, "dormitorio"],
  [/consolle/i, "consolas"],
  [/pouff/i, "puffs"],
  [/vitrina/i, "vitrinas"],
  [/sistema|origina|diciotto/i, "sistemas modulares"],
];

function categorize(name) {
  for (const [re, cat] of CATEGORY_RULES) {
    if (re.test(name)) return cat;
  }
  return "otros";
}

// Extra multilingual (ES/IT/EN) terms per category, merged into every
// product's keywords — covers generic shopping phrasing ("silla"/"sedia"/
// "chair") that never appears in the product's own name, which is the #1
// reason search_catalog was scoring too few real matches and falling back
// to its irrelevant array-order padding (see FASE... conversation bug).
const CATEGORY_SYNONYMS = {
  "sofás": ["sofa", "sofá", "divano", "couch", "asiento"],
  "sofás cama": ["sofa cama", "divano letto", "sofa bed", "sillon cama"],
  "sillones": ["sillon", "sillón", "poltrona", "armchair"],
  "mesas de centro": ["mesa de centro", "mesita", "tavolino", "coffee table"],
  "mesas": ["mesa", "tavolo", "table", "comedor"],
  "sillas": ["silla", "sedia", "chair", "asiento"],
  "taburetes": ["taburete", "banqueta", "sgabello", "stool", "bar"],
  "armarios": ["armario", "closet", "ropero", "armadio", "wardrobe", "cabina armadio", "vestidor"],
  "cómodas": ["comoda", "cómoda", "cajonera", "cassettiera", "dresser"],
  "librerías": ["libreria", "librería", "estanteria", "estantería", "bookshelf", "estante"],
  "aparadores": ["aparador", "madia", "credenza", "sideboard", "buffet"],
  "cocinas": ["cocina", "cucina", "kitchen", "isla"],
  "paneles decorativos": ["panel", "boiserie", "revestimiento", "pared", "decorativo", "columna", "vertical"],
  "dormitorio": ["cama", "letto", "bed", "dormitorio", "recamara", "recámara", "habitacion", "gruppo notte"],
  "consolas": ["consola", "consolle", "console table", "recibidor"],
  "puffs": ["puff", "pouff", "puf", "ottoman", "reposapies"],
  "vitrinas": ["vitrina", "vetrina", "display cabinet"],
  "sistemas modulares": ["sistema modular", "modular", "sistema"],
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
  const link = row.link_ita || row.link_eng || null;
  const scrapedEntry = link ? scraped[link] : null;
  const manual = manualByLabel.get(row.nome);

  const productId = slugify(`${row.nome}-${name}`).slice(0, 80);
  const hasCoords = isMatched || !!manual;

  let yaw = 0;
  let pitch = 0;
  let mediaName = null;
  if (isMatched) {
    yaw = row.yaw;
    pitch = row.pitch;
    mediaName = row.media_name;
  } else if (manual) {
    yaw = manual.yaw;
    pitch = manual.pitch;
    mediaName = manual.media_name;
  }

  const description =
    (scrapedEntry && scrapedEntry.description) ||
    `${name} — pieza de la colección Febal Casa, sección ${row.casa || ""}.`.trim();

  return {
    product_id: productId,
    name,
    category,
    description,
    colors: [],
    materials: [],
    keywords: keywordsFor(name, category, description),
    synonyms: [],
    section: row.casa || "Showroom",
    media_name: mediaName,
    yaw,
    pitch,
    fov: 70,
    hotspot_name: row.nome || null,
    image_url: (scrapedEntry && scrapedEntry.image_local_path) || "assets/febal-casa/placeholder-product.png",
    detail_url: link,
    alternatives_group: slugify(category),
    active: hasCoords,
    // internal bookkeeping fields, stripped before writing final files:
    _needs_review: !hasCoords || !scrapedEntry,
    _coord_source: isMatched ? "auto-extracted" : manual ? "manual-capture" : "none",
  };
}

const allRecords = [
  ...matched.map((r) => buildRecord(r, true)),
  ...unmatched.map((r) => buildRecord(r, false)),
];

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
  "detail_url", "alternatives_group", "active",
];
const rows = [HEADERS, ...clean.map((r) => [
  r.product_id, r.name, r.category, r.description, r.colors.join(", "), r.materials.join(", "),
  r.keywords.join(", "), r.synonyms.join(", "), r.section, r.media_name ?? "",
  r.yaw, r.pitch, r.fov, r.hotspot_name ?? "", r.image_url, r.detail_url ?? "",
  r.alternatives_group, r.active ? "TRUE" : "FALSE",
])];
const ws = xlsx.utils.aoa_to_sheet(rows);
const wb = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(wb, ws, "products");
xlsx.writeFile(wb, path.join(CLIENT_DIR, "catalog.xlsx"));

const withRealImage = clean.filter((r) => r.image_url && !r.image_url.includes("placeholder-product")).length;
console.log(`Built ${clean.length} catalog records (all active, real coordinates).`);
console.log(`  skipped (no coordinates yet — see catalog.full.json + unmatched-products.json): ${skippedNoCoords}`);
console.log(`  with real scraped image: ${withRealImage} / ${clean.length} (rest use the logo placeholder)`);
console.log(`\nWrote:\n  ${path.join(CLIENT_DIR, "catalog.json")}\n  ${path.join(CLIENT_DIR, "catalog.xlsx")}\n  ${path.join(CLIENT_DIR, "catalog.full.json")} (debug, includes review flags)`);
