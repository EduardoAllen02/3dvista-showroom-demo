import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CatalogSchema, type Product } from "@3dvista-assistant/catalog-engine";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

interface TourConfig {
  tour_id: string;
  allowedOrigin: string;
  media: Array<{ media_name: string }>;
}

let cachedProducts: Product[] | null = null;
let cachedTourConfig: TourConfig | null = null;

/**
 * This backend deployment serves exactly ONE tour (see README — one backend
 * per tour, not a multi-tenant registry). `TOUR_ID` in .env must match the
 * folder name under clients/.
 */
export function loadTourConfig(): TourConfig {
  if (cachedTourConfig) return cachedTourConfig;
  const configPath = path.join(ROOT, "clients", config.TOUR_ID, "tour.config.json");
  cachedTourConfig = JSON.parse(readFileSync(configPath, "utf8")) as TourConfig;
  return cachedTourConfig;
}

/**
 * Loads and caches only ACTIVE products — inactive rows are filtered out
 * here, at the single entry point, so there is no downstream code path
 * where an inactive record could leak into search/candidates/navigation.
 */
export function loadCatalog(): Product[] {
  if (cachedProducts) return cachedProducts;
  const catalogPath = path.join(ROOT, "clients", config.TOUR_ID, "catalog.json");
  const raw = JSON.parse(readFileSync(catalogPath, "utf8"));
  const parsed = CatalogSchema.parse(raw);
  cachedProducts = parsed.filter((p) => p.active);
  return cachedProducts;
}

export function findProductById(productId: string): Product | undefined {
  return loadCatalog().find((p) => p.product_id === productId);
}
