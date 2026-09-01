#!/usr/bin/env node
// Cross-references the real Febal Casa product Excel against the hotspot
// coordinates extracted by extract-febal-hotspots.mjs, matching by BOX
// number + fuzzy product-name similarity. Outputs a matched draft and an
// unmatched report (the latter needs manual capture, see Fase 3 of the plan).
//
// Usage: node scripts/match-febal-catalog.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOUR_DIR = path.join(ROOT, "tour-project", "febal-casa");
const EXCEL_PATH = path.join(TOUR_DIR, "source-catalog.xlsx");
const HOTSPOTS_PATH = path.join(TOUR_DIR, "extracted-hotspots.json");
const MATCHED_OUT = path.join(TOUR_DIR, "matched-catalog.json");
const UNMATCHED_OUT = path.join(TOUR_DIR, "unmatched-products.json");

function normalizeName(raw) {
  if (!raw) return "";
  let s = String(raw).toLowerCase();
  s = s.replace(/^fb\.?\s+/i, ""); // strip "FB " prefix
  s = s.replace(/\bbox\s*[0-9/]+\b/gi, ""); // strip trailing "box 100" etc
  s = s.replace(/[.,;:()]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function extractBoxNumbers(raw) {
  if (!raw) return [];
  const matches = [...String(raw).matchAll(/([0-9]+)/g)].map((m) => m[1]);
  return matches;
}

function tokenSet(s) {
  return new Set(s.split(" ").filter(Boolean));
}

function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : inter / union;
}

// --- Load Excel ---
const wb = xlsx.readFile(EXCEL_PATH);
const ws = wb.Sheets["VT FC"];
const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
// row 0 = title, row 1 = headers, row 2+ = data
const excelRows = [];
for (let r = 2; r < rows.length; r++) {
  const row = rows[r];
  if (!row || !row[0]) continue;
  const [casa, nome, prodottoIta, prodottoEng, linkIta, linkEng] = row;
  if (!nome) continue;
  excelRows.push({
    rowIndex: r + 1, // 1-based, matches spreadsheet row number
    casa,
    nome,
    prodotto_ita: prodottoIta ?? null,
    prodotto_eng: prodottoEng ?? null,
    link_ita: linkIta ?? null,
    link_eng: linkEng ?? null,
    box_numbers: extractBoxNumbers(nome),
  });
}
console.log(`Loaded ${excelRows.length} product rows from Excel.`);

// --- Load extracted hotspots ---
const hotspots = JSON.parse(fs.readFileSync(HOTSPOTS_PATH, "utf8"));
const hotspotsWithNorm = hotspots.map((h) => ({
  ...h,
  norm_name: normalizeName(h.event_lable),
  box_numbers: extractBoxNumbers(h.box_raw ?? ""),
}));
console.log(`Loaded ${hotspots.length} extracted hotspot records.`);

const usedHotspotIds = new Set();
const matched = [];
const unmatched = [];

for (const row of excelRows) {
  const normTarget = normalizeName(row.prodotto_ita || row.prodotto_eng);
  const candidates = hotspotsWithNorm.filter(
    (h) =>
      !usedHotspotIds.has(h.overlay_id) &&
      row.box_numbers.some((bn) => h.box_numbers.includes(bn))
  );
  let best = null;
  let bestScore = 0;
  for (const c of candidates) {
    const score = similarity(normTarget, c.norm_name);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  if (best && bestScore >= 0.5) {
    usedHotspotIds.add(best.overlay_id);
    matched.push({
      ...row,
      match_score: Math.round(bestScore * 100) / 100,
      matched_event_lable: best.event_lable,
      pitch: best.pitch,
      yaw: best.yaw,
      media_name: best.media_name,
      panorama_id: best.panorama_id,
      overlay_id: best.overlay_id,
      needs_review: bestScore < 0.85,
    });
  } else {
    unmatched.push({ ...row, best_candidate: best ? best.event_lable : null, best_score: bestScore });
  }
}

fs.writeFileSync(MATCHED_OUT, JSON.stringify(matched, null, 2), "utf8");
fs.writeFileSync(UNMATCHED_OUT, JSON.stringify(unmatched, null, 2), "utf8");

console.log(`\nMatched:   ${matched.length} / ${excelRows.length}`);
console.log(`Unmatched: ${unmatched.length} / ${excelRows.length}`);
const needsReview = matched.filter((m) => m.needs_review).length;
console.log(`  of matched, flagged needs_review (score < 0.85): ${needsReview}`);
console.log(`\nWrote:\n  ${MATCHED_OUT}\n  ${UNMATCHED_OUT}`);
