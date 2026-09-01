#!/usr/bin/env node
// Extracts product hotspots (pitch/yaw + product name + BOX code + owning
// panorama) directly out of the exported 3DVista tour's compiled script,
// without touching a browser. See tour-project/febal-casa/FASE0-FINDINGS.md
// for how this data model was reverse-engineered.
//
// Usage: node scripts/extract-febal-hotspots.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOUR = "febal-casa";
const SCRIPT_PATH = path.join(ROOT, "tour-project", TOUR, "tour-export", "script_general.js");
const LABELS_PATH = path.join(ROOT, "tour-project", TOUR, "panorama-labels.json");
const OUT_PATH = path.join(ROOT, "tour-project", TOUR, "extracted-hotspots.json");

const text = fs.readFileSync(SCRIPT_PATH, "utf8");
const panoramaLabels = JSON.parse(fs.readFileSync(LABELS_PATH, "utf8"));
const idToLabel = new Map(panoramaLabels.map((p) => [p.id, p.label]));

/**
 * Single forward pass over the whole (minified, single-line) script text.
 * Finds every occurrence of `"class":"<className>"` and returns the raw
 * text of its immediately-enclosing top-level `{...}` object, by tracking
 * a stack of open-brace positions and correctly skipping over JSON string
 * contents (which do contain literal `{`/`}` characters in several places,
 * e.g. embedded gtag()/eval() JS source in hotspot "click" handlers).
 */
function extractObjectsByClass(className) {
  const marker = `"class":"${className}"`;
  const markerPositions = [];
  {
    let from = 0;
    for (;;) {
      const idx = text.indexOf(marker, from);
      if (idx === -1) break;
      markerPositions.push(idx);
      from = idx + marker.length;
    }
  }
  const markerSet = new Set(markerPositions);
  const startToMarker = new Map();
  const results = new Map();
  const stack = [];
  const n = text.length;
  let i = 0;
  while (i < n) {
    const ch = text[i];
    if (markerSet.has(i)) {
      startToMarker.set(stack[stack.length - 1], i);
    }
    if (ch === '"') {
      i++;
      while (i < n) {
        if (text[i] === "\\") {
          i += 2;
          continue;
        }
        if (text[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (ch === "{") {
      stack.push(i);
      i++;
      continue;
    }
    if (ch === "}") {
      const start = stack.pop();
      if (startToMarker.has(start)) {
        const markerPos = startToMarker.get(start);
        results.set(markerPos, text.slice(start, i + 1));
      }
      i++;
      continue;
    }
    i++;
  }
  return markerPositions.map((pos) => results.get(pos)).filter(Boolean);
}

function tryParse(raw, contextLabel) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`  [skip] could not JSON.parse a ${contextLabel} object: ${err.message}`);
    return null;
  }
}

// Panorama objects have unquoted trans(...) function-call values for
// label/subtitle (not valid JSON) — extract just the two plain-JSON fields
// we actually need (id, overlays) with a small targeted parser instead.
function extractStringField(raw, fieldName) {
  const m = raw.match(new RegExp(`"${fieldName}":"([^"]*)"`));
  return m ? m[1] : null;
}
function extractStringArrayField(raw, fieldName) {
  const keyIdx = raw.indexOf(`"${fieldName}":[`);
  if (keyIdx === -1) return [];
  const start = raw.indexOf("[", keyIdx);
  let depth = 0;
  let i = start;
  for (; i < raw.length; i++) {
    if (raw[i] === "[") depth++;
    else if (raw[i] === "]") {
      depth--;
      if (depth === 0) break;
    }
  }
  const inner = raw.slice(start + 1, i);
  return [...inner.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
}

console.log("Extracting Panorama objects...");
const panoramaRaws = extractObjectsByClass("Panorama");
console.log(`  found ${panoramaRaws.length} panoramas`);

// overlay id -> panorama id
const overlayToPanorama = new Map();
for (const raw of panoramaRaws) {
  const id = extractStringField(raw, "id");
  const overlays = extractStringArrayField(raw, "overlays");
  if (!id) continue;
  for (const ref of overlays) {
    const overlayId = String(ref).replace(/^this\./, "");
    overlayToPanorama.set(overlayId, id);
  }
}
console.log(`  indexed ${overlayToPanorama.size} overlay->panorama refs`);

console.log("Extracting FlatHotspotPanoramaOverlayArea objects...");
const areaObjs = extractObjectsByClass("FlatHotspotPanoramaOverlayArea")
  .map((raw) => tryParse(raw, "FlatHotspotPanoramaOverlayArea"))
  .filter(Boolean);
console.log(`  found ${areaObjs.length} areas`);

const areaById = new Map(areaObjs.map((a) => [a.id, a]));

function extractEventLable(clickStr) {
  if (!clickStr || typeof clickStr !== "string") return null;
  // After JSON.parse, the embedded eval() source contains literal
  // backslash-escaped single quotes, e.g.: ...\'event_lable\': \'FB Foo BOX 100\'...
  const marker = "event_lable\\':";
  const idx = clickStr.indexOf(marker);
  if (idx === -1) return null;
  const rest = clickStr.slice(idx + marker.length);
  const openIdx = rest.indexOf("\\'");
  if (openIdx === -1) return null;
  const afterOpen = rest.slice(openIdx + 2);
  const closeIdx = afterOpen.indexOf("\\'");
  if (closeIdx === -1) return null;
  return afterOpen.slice(0, closeIdx).trim();
}

console.log("Extracting FlatHotspotPanoramaOverlay objects...");
const overlayObjs = extractObjectsByClass("FlatHotspotPanoramaOverlay")
  .map((raw) => tryParse(raw, "FlatHotspotPanoramaOverlay"))
  .filter(Boolean);
console.log(`  found ${overlayObjs.length} overlays`);

const records = [];
let noItems = 0;
let noArea = 0;
let noEventLable = 0;
let noPanorama = 0;

for (const overlay of overlayObjs) {
  const item = Array.isArray(overlay.items) ? overlay.items[0] : null;
  if (!item || typeof item !== "object" || typeof item.pitch !== "number" || typeof item.yaw !== "number") {
    noItems++;
    continue;
  }
  const areaRefs = overlay.areas ?? [];
  let eventLable = null;
  for (const ref of areaRefs) {
    const areaId = String(ref).replace(/^this\./, "");
    const area = areaById.get(areaId);
    if (!area) continue;
    eventLable = extractEventLable(area.click);
    if (eventLable) break;
  }
  if (areaRefs.length === 0) noArea++;
  if (!eventLable) {
    noEventLable++;
    continue;
  }
  const panoramaId = overlayToPanorama.get(overlay.id);
  if (!panoramaId) {
    noPanorama++;
    continue;
  }
  const panoramaLabel = idToLabel.get(panoramaId) ?? null;
  const boxMatch = eventLable.match(/BOX\s*([0-9]+(?:\s*\/\s*[0-9]+)*)/i);
  records.push({
    overlay_id: overlay.id,
    event_lable: eventLable,
    box_raw: boxMatch ? boxMatch[0] : null,
    pitch: item.pitch,
    yaw: item.yaw,
    panorama_id: panoramaId,
    media_name: panoramaLabel,
  });
}

console.log(`\nParsed ${overlayObjs.length} FlatHotspotPanoramaOverlay objects:`);
console.log(`  no pitch/yaw item (icon-less/text-only): ${noItems}`);
console.log(`  no area reference: ${noArea}`);
console.log(`  no event_lable found on area: ${noEventLable}`);
console.log(`  event_lable found but panorama unresolved: ${noPanorama}`);
console.log(`  -> usable product-hotspot records: ${records.length}`);

fs.writeFileSync(OUT_PATH, JSON.stringify(records, null, 2), "utf8");
console.log(`\nWrote ${records.length} records to ${OUT_PATH}`);

// quick sanity: how many distinct event_lable values
const distinct = new Set(records.map((r) => r.event_lable));
console.log(`Distinct event_lable values: ${distinct.size}`);
