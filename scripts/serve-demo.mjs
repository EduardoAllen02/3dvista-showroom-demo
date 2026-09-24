#!/usr/bin/env node
// Tiny static file server for the exported 3DVista tour + the widget bundle
// + the demo product images, all under one local origin so the widget's
// fetch() to the backend is the only cross-origin call (CORS-checked there).
// Usage: node scripts/serve-demo.mjs [tour-name] [port] [assistant-tour-override]
//
// assistant-tour-override lets /assistant/* serve a DIFFERENT tour's bundle
// (e.g. a client dir with only a different backendUrl in tour.config.json)
// while panoramas/assets still come from the main `tour-name` — used to run
// several backend comparisons (gpt-4o-mini/Sonnet/Haiku) side by side on
// different ports without duplicating the exported panorama media per
// variant.
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOUR = process.argv[2] ?? "demo-showroom";
const PORT = Number(process.argv[3] ?? 5500);
const ASSISTANT_TOUR = process.argv[4] ?? TOUR;
// Which file under tour-export/ serves "/" — lets several instances share
// the same tour-export panorama media while each has its own <script> tag
// injected (index.htm's widget src is baked in by inject-widget.mjs, so two
// ports pointing at two different bundles need two different index files).
const INDEX_FILE = process.argv[5] ?? "index.htm";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

// Routes: /assistant/* -> dist/<tour>/*, /assets/<tour>/* -> clients/<tour>/assets/*,
// everything else -> tour-project/<tour>/tour-export/*
function resolvePath(urlPath) {
  if (urlPath.startsWith("/assistant/")) {
    return path.join(ROOT, "dist", ASSISTANT_TOUR, urlPath.replace("/assistant/", ""));
  }
  if (urlPath.startsWith("/assets/")) {
    // /assets/<tour>/<rest> -> clients/<tour>/assets/<rest>
    const rest = urlPath.replace("/assets/", "");
    const slashIdx = rest.indexOf("/");
    const tourName = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
    const assetPath = slashIdx === -1 ? "" : rest.slice(slashIdx + 1);
    return path.join(ROOT, "clients", tourName, "assets", assetPath);
  }
  const clean = urlPath === "/" ? `/${INDEX_FILE}` : urlPath;
  return path.join(ROOT, "tour-project", TOUR, "tour-export", clean);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const filePath = resolvePath(urlPath);

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found: " + urlPath);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`Demo servida en http://localhost:${PORT}`);
  console.log(`  - Tour exportado: tour-project/${TOUR}/tour-export/`);
  console.log(`  - Bundle:         http://localhost:${PORT}/assistant/assistant.bundle.js (from dist/${ASSISTANT_TOUR}/)`);
});
