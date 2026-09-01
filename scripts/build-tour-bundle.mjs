#!/usr/bin/env node
// Bundles clients/<tour>/entry.ts -> dist/<tour>/assistant.bundle.js (+ .css)
// Usage: node scripts/build-tour-bundle.mjs <tour-name>
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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
  const themeCss = readFileSync(path.join(clientDir, "theme.css"), "utf8");
  writeFileSync(path.join(outDir, "assistant.css"), `${baseCss}\n\n${themeCss}\n`, "utf8");

  // Public, lightweight manifest for the wishlist layer's hotspot-hover
  // overlay — it needs every active product's (media_name, yaw, pitch) to
  // project hotspots to screen coordinates client-side, without a server
  // round-trip per panorama. Deliberately excludes description/keywords/
  // synonyms/colors/materials/compatible_with — none of that is needed to
  // draw a heart icon over a hotspot, so it stays out of the payload.
  const catalog = JSON.parse(readFileSync(path.join(clientDir, "catalog.json"), "utf8"));
  const manifest = catalog
    .filter((p) => p.active)
    .map((p) => ({
      product_id: p.product_id,
      name: p.name,
      media_name: p.media_name,
      yaw: p.yaw,
      pitch: p.pitch,
      fov: p.fov,
      image_url: p.image_url,
      detail_url: p.detail_url,
    }));
  writeFileSync(path.join(outDir, "catalog-manifest.json"), JSON.stringify(manifest), "utf8");

  console.log(`OK: bundle generado en ${path.relative(ROOT, outDir)}/ (manifest: ${manifest.length} productos)`);
}

main();
