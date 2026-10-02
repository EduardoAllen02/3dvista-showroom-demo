import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { MoodboardProduct } from "@3dvista-assistant/moodboard-engine";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/**
 * Whether the catalog has a real photo of this piece. scripts/build-febal-
 * catalog.mjs falls back to "placeholder-product.png" (the brand logo) when
 * the scrape found no image, and counts real ones with this same test.
 */
export function hasRealPhoto(imageUrl: string): boolean {
  return !imageUrl.includes("placeholder-product");
}

/**
 * Reads a product's catalog photo straight from clients/<tour>/assets. The
 * catalog stores it as "assets/<tour>/products/x.jpg", the same path the
 * tour page serves it from (see scripts/serve-demo.mjs), so no public URL
 * is needed and the analysis works the same locally and in production.
 * Returns null for anything outside that folder or unreadable: the analysis
 * then leans on the showroom facts alone.
 */
export function createProductImageLoader(tourId: string): (product: MoodboardProduct) => Promise<string | null> {
  const assetsDir = path.resolve(ROOT, "clients", tourId, "assets");
  const prefix = `assets/${tourId}/`;
  return async (product) => {
    if (!product.image_url.startsWith(prefix)) return null;
    const file = path.resolve(assetsDir, product.image_url.slice(prefix.length));
    const mime = MIME[path.extname(file).toLowerCase()];
    if (!mime || !file.startsWith(assetsDir + path.sep)) return null;
    try {
      return `data:${mime};base64,${(await readFile(file)).toString("base64")}`;
    } catch {
      return null;
    }
  };
}
