#!/usr/bin/env node
// Patches tour-project/<tour>/tour-export/index.htm to load the tour's
// assistant bundle + css. Run after both `build-tour-bundle.mjs` and the
// 3DVista "Publicar > Web" export.
//
// Why a post-export HTML patch instead of 3DVista's own "Execute Javascript"
// panorama action: tested live in Fase 0 (see tour-project/<tour>/FASE0-FINDINGS.md)
// and the per-panorama "Al Inicio" action did NOT reliably fire — neither on
// cold load nor when re-entering that panorama via setMainMediaByName. A
// static, idempotent HTML patch is simpler, deterministic, and versionable,
// and was confirmed working end-to-end (widget mounts, survives navigation).
//
// Usage: node scripts/inject-widget.mjs <tour-name> [backendUrl] [assetsBaseUrl]
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function main() {
  const tour = process.argv[2];
  const assetsBaseUrl = process.argv[3] ?? "http://localhost:5500/assistant";
  if (!tour) {
    console.error("Usage: node scripts/inject-widget.mjs <tour-name> [assetsBaseUrl]");
    process.exit(1);
  }

  const indexPath = path.join(ROOT, "tour-project", tour, "tour-export", "index.htm");
  if (!existsSync(indexPath)) {
    console.error(`No se encontró ${indexPath}. Exporta el tour (Publicar > Web) antes de inyectar.`);
    process.exit(1);
  }

  let html = readFileSync(indexPath, "utf8");

  // Cache-bust with the current timestamp so every re-injection (after an
  // assistant.css/bundle.js edit) forces browsers to fetch the fresh file
  // instead of serving a stale cached copy under the same URL.
  const v = Date.now();
  const startMarker = "<!-- tva-widget:start -->";
  const endMarker = "<!-- tva-widget:end -->";
  const snippet =
    `${startMarker}\n` +
    `    <link rel="stylesheet" href="${assetsBaseUrl}/assistant.css?v=${v}">\n` +
    `    <script src="${assetsBaseUrl}/assistant.bundle.js?v=${v}"></script>\n` +
    `${endMarker}`;

  const blockPattern = new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`);
  if (blockPattern.test(html)) {
    html = html.replace(blockPattern, snippet);
    writeFileSync(indexPath, html, "utf8");
    console.log(`OK: widget actualizado (cache-bust v=${v}) en ${path.relative(ROOT, indexPath)}`);
    return;
  }

  if (!html.includes("</body>")) {
    console.error("No se encontró </body> en index.htm — formato de export inesperado.");
    process.exit(1);
  }

  html = html.replace("</body>", `${snippet}\n</body>`);
  writeFileSync(indexPath, html, "utf8");
  console.log(`OK: widget inyectado (v=${v}) en ${path.relative(ROOT, indexPath)}`);
}

main();
