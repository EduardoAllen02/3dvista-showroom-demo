#!/usr/bin/env node
// Tiny static file server for the exported 3DVista tour + the widget bundle
// + the demo product images, all under one local origin so the widget's
// fetch() to the backend is the only cross-origin call (CORS-checked there).
// Usage: node scripts/serve-demo.mjs [tour-name] [port]
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const TOUR = process.argv[2] ?? "demo-showroom";
const PORT = Number(process.argv[3] ?? 5500);

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
    return path.join(ROOT, "dist", TOUR, urlPath.replace("/assistant/", ""));
  }
  if (urlPath.startsWith("/assets/")) {
    return path.join(ROOT, "clients", urlPath.replace("/assets/", ""));
  }
  const clean = urlPath === "/" ? "/index.htm" : urlPath;
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
  console.log(`  - Bundle:         http://localhost:${PORT}/assistant/assistant.bundle.js`);
});
