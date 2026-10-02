#!/usr/bin/env node
// Sample of the weekly analytics email proposed in docs/analytics/propuesta-analitica.md, built from
// what the backend already logs: every chat turn (server/data/v2-turns.jsonl, with the structured
// plan the assistant understood) and every moodboard (server/data/moodboards/<key>/plan.json).
// Wishlist saves and card clicks are not logged yet (they need the /events route of the proposal).
//
//   node scripts/analytics-sample-report.mjs [tour=febal-casa]   → ~/Downloads/<tour>-reporte-ejemplo.html
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tour = process.argv[2] ?? "febal-casa";
const OUT = path.join(os.homedir(), "Downloads", `${tour}-reporte-ejemplo.html`);

const turns = readFileSync(path.join(ROOT, "server/data/v2-turns.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const catalog = JSON.parse(readFileSync(path.join(ROOT, "clients", tour, "catalog.v2.json"), "utf8"));
const pack = JSON.parse(readFileSync(path.join(ROOT, "packages/assistant-engine/src/packs/furniture.json"), "utf8"));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const label = new Map(pack.concepts.map((c) => [c.id, cap(c.labels.es)]));
// The wishlist's style vocabulary is Italian (same mapping as the widget's ui-text.ts).
const STYLE_ES = { Minimal: "Minimalista", Contemporaneo: "Contemporáneo", "Classico elegante": "Clásico elegante", "Caldo accogliente": "Cálido y acogedor" };
const models = new Map(catalog.models.map((m) => [m.id, m.name]));
const pieceName = new Map(catalog.exhibits.map((e) => [e.id, models.get(e.model_id) ?? e.name]));

const count = () => new Map();
const bump = (m, k, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const top = (m, n = 6) => [...m.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n);

const sessions = new Set();
const langs = count();
const byFacet = { category: count(), material: count(), color: count(), style: count(), mood: count() };
const missing = count(); // asked for and not in the showroom as asked
const shown = count();
const alternatives = count();
let navigations = 0;
const days = new Set();

for (const t of turns) {
  sessions.add(t.session_id);
  days.add(t.at.slice(0, 10));
  const plan = t.trace?.plan;
  if (plan?.lang) bump(langs, { es: "Español", it: "Italiano", en: "Inglés" }[plan.lang] ?? plan.lang);
  // What the visitor asked for: the planner's concepts plus the ones the lexicon added.
  const asked = [...(plan?.add ?? []).filter((c) => c.op === "is").map((c) => [c.facet, c.value])];
  for (const n of t.trace?.reducer_notes ?? []) {
    const m = /^added from lexicon: (\w+)=(\S+)$/.exec(n);
    if (m) asked.push([m[1], m[2]]);
  }
  const seen = new Set();
  for (const [facet, value] of asked) {
    if (!byFacet[facet] || seen.has(value)) continue;
    seen.add(value);
    bump(byFacet[facet], label.get(value) ?? value);
  }
  const outcome = t.trace?.bundle?.outcome;
  if (["on_order_only", "no_exact", "unknown_only", "line_only"].includes(outcome)) {
    const attrs = asked.filter(([f]) => f !== "category").map(([, v]) => label.get(v) ?? v);
    const cat = asked.find(([f]) => f === "category");
    if (attrs.length) bump(missing, cap(`${cat ? `${(label.get(cat[1]) ?? cat[1]).toLowerCase()} ` : ""}${attrs.map((a) => a.toLowerCase()).join(" + ")}`));
  }
  for (const c of t.cards ?? []) bump(shown, pieceName.get(c.split(" · ")[0]) ?? c);
  if (t.navigate) navigations++;
  if (t.clicked?.action === "alternatives") bump(alternatives, pieceName.get(t.clicked.exhibit_id) ?? t.clicked.exhibit_id);
}

const moodDir = path.join(ROOT, "server/data/moodboards");
const moodStyles = count();
if (existsSync(moodDir)) {
  for (const key of readdirSync(moodDir)) {
    const planPath = path.join(moodDir, key, "plan.json");
    if (existsSync(planPath)) { const style = JSON.parse(readFileSync(planPath, "utf8")).style; bump(moodStyles, STYLE_ES[style] ?? style); }
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const dayList = [...days].sort();
const fmt = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES", { day: "numeric", month: "long" });
const period = !dayList.length ? "—"
  : dayList.length === 1 ? `${fmt(dayList[0])} de ${dayList[0].slice(0, 4)}`
  : `${fmt(dayList[0])} – ${fmt(dayList.at(-1))} de ${dayList.at(-1).slice(0, 4)}`;

function barList(title, subtitle, map, n = 6) {
  const rows = top(map, n);
  if (!rows.length) return "";
  const max = rows[0][1];
  return `
  <section class="block">
    <h2>${esc(title)}</h2>
    ${subtitle ? `<p class="sub">${esc(subtitle)}</p>` : ""}
    <div class="bars">
      ${rows.map(([k, v]) => `
      <div class="row" title="${esc(k)}: ${v}">
        <span class="name">${esc(k)}</span>
        <span class="track"><span class="bar" style="width:${Math.max(2, (v / max) * 100).toFixed(1)}%"></span></span>
        <span class="val">${v}</span>
      </div>`).join("")}
    </div>
  </section>`;
}

const kpi = (value, text) => `<div class="kpi"><span class="kpi-value">${esc(value)}</span><span class="kpi-label">${esc(text)}</span></div>`;

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Febal Casa · Reporte del asistente</title>
<style>
  :root { --brand: #C8102E; --ink: #1a1a1a; --ink-2: #555; --muted: #888; --surface: #fcfcfb; --panel: #ffffff; --line: #e8e6e1; --track: #f1efea; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--surface); color: var(--ink); font: 15px/1.45 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .mail { max-width: 680px; margin: 0 auto; background: var(--panel); }
  header { background: var(--brand); color: #fff; padding: 28px 32px; }
  header .brand { font-size: 22px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
  header .title { margin-top: 4px; font-size: 15px; opacity: 0.92; }
  header .period { margin-top: 10px; font-size: 13px; opacity: 0.85; }
  .note { margin: 20px 32px 0; padding: 10px 14px; border-radius: 8px; background: #fff6e5; color: #6b4e00; font-size: 13px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; padding: 20px 32px 8px; }
  .kpi { padding: 14px; border: 1px solid var(--line); border-radius: 12px; }
  .kpi-value { display: block; font-size: 26px; font-weight: 700; color: var(--ink); font-variant-numeric: tabular-nums; }
  .kpi-label { display: block; margin-top: 2px; font-size: 12px; color: var(--ink-2); }
  .block { padding: 18px 32px 6px; }
  .block h2 { margin: 0; font-size: 16px; }
  .block .sub { margin: 2px 0 0; font-size: 13px; color: var(--ink-2); }
  .bars { margin-top: 12px; display: grid; gap: 8px; }
  .row { display: grid; grid-template-columns: 170px 1fr 36px; align-items: center; gap: 10px; }
  .name { font-size: 13px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .track { height: 14px; background: var(--track); border-radius: 0 4px 4px 0; }
  .bar { display: block; height: 100%; background: var(--brand); border-radius: 0 4px 4px 0; }
  .val { font-size: 13px; color: var(--ink-2); text-align: right; font-variant-numeric: tabular-nums; }
  .two { display: grid; grid-template-columns: 1fr 1fr; }
  .two .block { padding-right: 16px; }
  .two .row { grid-template-columns: 110px 1fr 30px; }
  footer { margin-top: 18px; padding: 18px 32px 28px; border-top: 1px solid var(--line); font-size: 12px; color: var(--muted); }
  @media (max-width: 560px) {
    .kpis { grid-template-columns: repeat(2, 1fr); padding: 16px; }
    .block, .two .block { padding: 14px 16px 4px; }
    .two { grid-template-columns: 1fr; }
    .row, .two .row { grid-template-columns: 120px 1fr 30px; }
    header, footer { padding-left: 16px; padding-right: 16px; }
    .note { margin: 16px 16px 0; }
  }
</style>
</head>
<body>
<div class="mail">
  <header>
    <div class="brand">Febal Casa</div>
    <div class="title">Reporte del asistente virtual del tour</div>
    <div class="period">${esc(period)}</div>
  </header>
  <div class="note">Ejemplo con datos de pruebas internas, no de visitantes reales. Así se vería el correo semanal para el equipo de ventas.</div>
  <div class="kpis">
    ${kpi(sessions.size, "visitas que usaron el chat")}
    ${kpi(turns.length, "preguntas al asistente")}
    ${kpi((turns.length / Math.max(1, sessions.size)).toFixed(1), "preguntas por visita")}
    ${kpi(navigations, "veces que llevó a una pieza")}
  </div>
  ${barList("Qué tipo de mueble buscan", "Categorías pedidas en el chat.", byFacet.category)}
  <div class="two">
    ${barList("Materiales", "", byFacet.material, 5)}
    ${barList("Colores", "", byFacet.color, 5)}
  </div>
  <div class="two">
    ${barList("Estilos", "", byFacet.style, 5)}
    ${barList("Ambientes", "«acogedor», «pequeño»…", byFacet.mood, 5)}
  </div>
  ${barList("Lo que pidieron y no está así en el showroom", "Demanda de lo que falta: se ofreció bajo pedido o una alternativa.", missing, 6)}
  ${barList("Piezas que más mostró el asistente", "Tarjetas de producto que vieron los visitantes.", shown, 8)}
  <div class="two">
    ${barList("Idioma de la conversación", "", langs, 3)}
    ${barList("Estilo de los moodboards", "", moodStyles, 4)}
  </div>
  ${alternatives.size ? barList("Piezas de las que pidieron alternativas", "", alternatives, 5) : ""}
  <footer>
    Generado a partir de lo que ya registra el asistente (el plan de cada pregunta, sin datos personales).
    Lo que se guarda en «Mi lista», los clics en «Llévame» y «Sitio oficial» y los contactos por tienda se agregan con el registro de eventos de la propuesta.
  </footer>
</div>
</body>
</html>`;

writeFileSync(OUT, html, "utf8");
console.log(`${OUT}: ${turns.length} preguntas de ${sessions.size} visitas (${period})`);
