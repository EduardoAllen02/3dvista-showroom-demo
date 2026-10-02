#!/usr/bin/env node
// Bundles clients/<tour>/entry.ts -> dist/<tour>/assistant.bundle.js (+ .css)
// Usage: node scripts/build-tour-bundle.mjs <tour-name>
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

async function main() {
  const tour = process.argv[2];
  if (!tour) {
    console.error("Usage: node scripts/build-tour-bundle.mjs <tour-name>");
    process.exit(1);
  }

  const clientDir = path.join(ROOT, "clients", tour);
  const outDir = path.join(ROOT, "dist", tour);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  await build({
    entryPoints: [path.join(clientDir, "entry.ts")],
    bundle: true,
    format: "iife",
    target: "es2018",
    outfile: path.join(outDir, "assistant.bundle.js"),
    logLevel: "info",
  });

  const baseCss = readFileSync(
    path.join(ROOT, "packages", "assistant-ui", "src", "styles", "assistant.css"),
    "utf8"
  );
  // The moodboard component ships its own stylesheet; appended to the same
  // assistant.css so inject-widget.mjs keeps injecting a single <link>.
  const moodboardCss = readFileSync(
    path.join(ROOT, "packages", "moodboard-ui", "src", "styles", "moodboard.css"),
    "utf8"
  );
  const themeCss = readFileSync(path.join(clientDir, "theme.css"), "utf8");
  writeFileSync(path.join(outDir, "assistant.css"), `${baseCss}\n\n${moodboardCss}\n\n${themeCss}\n`, "utf8");

  // Public, lightweight manifest for the wishlist layer's hotspot-hover
  // overlay — it needs every active product's (media_name, yaw, pitch) to
  // project hotspots to screen coordinates client-side, without a server
  // round-trip per panorama. Deliberately excludes description/keywords/
  // synonyms/colors/materials/compatible_with — none of that is needed to
  // draw a heart icon over a hotspot, so it stays out of the payload.
  const catalog = JSON.parse(readFileSync(path.join(clientDir, "catalog.json"), "utf8"));
  const active = catalog.filter((p) => p.active);
  const manifest = active.map((p) => ({
    product_id: p.product_id,
    name: p.name,
    media_name: p.media_name,
    yaw: p.yaw,
    pitch: p.pitch,
    fov: p.fov,
    image_url: p.image_url,
    detail_url: p.detail_url,
    hotspot_name: p.hotspot_name ?? null,
  }));
  const extra = linkHotspotsToProducts(tour, active, manifest);
  writeFileSync(path.join(outDir, "catalog-manifest.json"), JSON.stringify(manifest), "utf8");

  console.log(`OK: bundle generado en ${path.relative(ROOT, outDir)}/ (manifest: ${manifest.length} productos${extra})`);
}

// Same key the tour bridge reads off a hotspot: "BOX 100 - B_103" and the overlay label "b103" both → "103".
const hotspotKey = (label) => label.trim().toLowerCase().replace(/^b/, "");
const catalogKey = (hotspotName) => {
  const m = /B_?(\d+)/i.exec(hotspotName ?? "");
  return m ? m[1] : null;
};
const normUrl = (u) => (u ?? "").trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");

/**
 * Enriches the hover-heart manifest from the 3DVista export itself (skipped when there is none):
 * - group_id: pieces of one showroom composition — same page, same "BOX nnn", same category, like
 *   the Origina kitchen's island and its two tall units — save as ONE product, whichever of its
 *   hotspots the heart is on. The canonical entry is the one with the most specific name.
 * - page_urls: the product page in every tour language, as each hotspot's popup opens it, so an
 *   open preview can be matched to its product from the page it shows.
 * - hotspot_keys: markers that open a product's page but aren't the catalog's own hotspot for it.
 */
function linkHotspotsToProducts(tour, active, manifest) {
  const exportDir = path.join(ROOT, "tour-project", tour, "tour-export");
  const scriptPath = path.join(exportDir, "script_general.js");
  const localeDir = path.join(exportDir, "locale");
  if (!existsSync(scriptPath) || !existsSync(localeDir)) return "";

  // "<popup>.url = https://…" per language.
  const pageByPopup = new Map();
  for (const file of readdirSync(localeDir).filter((f) => f.endsWith(".txt"))) {
    for (const line of readFileSync(path.join(localeDir, file), "utf8").split(/\r?\n/)) {
      const m = /^(\S+)\.url\s*=\s*(\S+)/.exec(line);
      if (m) pageByPopup.set(m[1], [...(pageByPopup.get(m[1]) ?? []), normUrl(m[2])]);
    }
  }

  // Every object literal in the export, string-aware (hotspot click actions contain braces).
  const src = readFileSync(scriptPath, "utf8");
  const objects = [];
  const stack = [];
  for (let i = 0, inString = false; i < src.length; i++) {
    const c = src[i];
    if (inString) {
      if (c === "\\") i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === "{") stack.push(i);
    else if (c === "}" && stack.length) {
      const start = stack.pop();
      if (i - start < 4000) objects.push(src.slice(start, i + 1));
    }
  }
  const popupByArea = new Map();
  for (const o of objects) {
    if (!o.includes("OverlayArea") || !o.includes('"click"')) continue;
    const id = /"id":"([^"]+)"/.exec(o);
    const popup = /translate\('([A-Za-z0-9_]+)\.url'\)/.exec(o);
    if (id && popup) popupByArea.set(id[1], popup[1]);
  }
  const pagesByKey = new Map();
  const popupsByKey = new Map(); // every marker with that number: its popup, or null when it opens none
  for (const o of objects) {
    const label = /"data":\{"label":"([^"]+) hotspot","tags":\["hotspot"\]\}/.exec(o);
    const area = /"areas":\["this\.([A-Za-z0-9_]+)"/.exec(o);
    if (!label || !area) continue;
    const popup = popupByArea.get(area[1]) ?? null;
    const key = hotspotKey(label[1]);
    popupsByKey.set(key, [...(popupsByKey.get(key) ?? []), popup]);
    if (!popup) continue;
    pagesByKey.set(key, new Set([...(pagesByKey.get(key) ?? []), ...(pageByPopup.get(popup) ?? [])]));
  }

  // The v2 catalog knows a kitchen's tall units ("Sistema Origina") are the same kitchen model;
  // the v1 categories split them ("cucine" / "sistemi modulari").
  const v2Path = path.join(ROOT, "clients", tour, "catalog.v2.json");
  const exhibits = new Map(
    existsSync(v2Path) ? JSON.parse(readFileSync(v2Path, "utf8")).exhibits.map((e) => [e.id, e]) : []
  );
  const groupKey = (p) => {
    const box = /BOX\s*(\d+)/i.exec(p.hotspot_name ?? "");
    const exhibit = exhibits.get(p.product_id);
    const model = exhibit?.model_id ?? normUrl(p.detail_url);
    return model && box ? `${model}|${box[1]}|${exhibit?.category ?? p.category}` : p.product_id;
  };
  const groups = new Map();
  for (const p of active) groups.set(groupKey(p), [...(groups.get(groupKey(p)) ?? []), p]);
  const canonicalOf = new Map();
  for (const members of groups.values()) {
    const canonical = [...members].sort((a, b) => b.name.length - a.name.length || a.product_id.localeCompare(b.product_id))[0];
    for (const p of members) canonicalOf.set(p.product_id, canonical.product_id);
  }

  const byId = new Map(manifest.map((m) => [m.product_id, m]));
  const ownKeys = new Set(active.map((p) => catalogKey(p.hotspot_name)).filter(Boolean));
  for (const p of active) {
    const entry = byId.get(p.product_id);
    entry.group_id = canonicalOf.get(p.product_id);
    const own = catalogKey(p.hotspot_name);
    entry.page_urls = [...new Set([normUrl(p.detail_url), ...(own ? pagesByKey.get(own) ?? [] : [])])].filter(Boolean);
  }
  let linked = 0;
  // The composition whose page a popup opens (null: no popup, no catalog page, or a page several share).
  const ownerOf = (popup) => {
    const pages = popup ? pageByPopup.get(popup) ?? [] : [];
    const owners = new Set(active.filter((p) => pages.includes(normUrl(p.detail_url))).map((p) => canonicalOf.get(p.product_id)));
    return owners.size === 1 ? [...owners][0] : null;
  };
  for (const [key, popups] of popupsByKey) {
    if (ownKeys.has(key)) continue;
    // Every marker with that number must open the same composition's page: the tour reuses a number for
    // other pieces too (the Pat nightstands' "283": six open the home page, one nothing, two Astor's page).
    const owners = new Set(popups.map(ownerOf));
    if (owners.size !== 1 || owners.has(null)) continue;
    const pages = pagesByKey.get(key) ?? new Set();
    const entry = byId.get([...owners][0]);
    entry.hotspot_keys = [...(entry.hotspot_keys ?? []), key];
    for (const page of pages) if (!entry.page_urls.includes(page)) entry.page_urls.push(page);
    linked++;
  }
  const grouped = manifest.filter((m) => m.group_id !== m.product_id).length;
  return `; ${grouped} agrupados en su composición, ${linked} hotspots extra enlazados`;
}

main();
