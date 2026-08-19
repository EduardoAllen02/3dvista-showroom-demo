import { searchCatalog, toNavTarget, type Product } from "@3dvista-assistant/catalog-engine";
import { findProductById, loadCatalog } from "../catalog/catalog-loader.js";

export interface ProductCardPayload {
  product_id: string;
  name: string;
  description: string;
  image_url: string;
  section: string;
  detail_url: string | null;
  navTarget: ReturnType<typeof toNavTarget>;
}

function toCard(product: Product): ProductCardPayload {
  return {
    product_id: product.product_id,
    name: product.name,
    description: product.description,
    image_url: product.image_url,
    section: product.section,
    detail_url: product.detail_url,
    navTarget: toNavTarget(product),
  };
}

export interface ToolRunResult {
  /** JSON-serializable result sent back to the model as the tool output. */
  output: unknown;
  /**
   * Product cards to render as a PROPOSAL in the chat (image + name +
   * description, with "Llévame"/"Ver alternativas" buttons) — only
   * `get_product`/`get_alternatives` produce these. `navigate_to_product`
   * deliberately produces none: by the time it runs, the trip already
   * happened (or is about to, via `navigate` below), so a button offering
   * to do it again is meaningless — this was a real UX bug a user caught
   * live (the "Llévame" card only appeared *after* the camera had already
   * moved there).
   */
  cards: ProductCardPayload[];
  /**
   * Set only by `navigate_to_product`. The frontend applies this
   * immediately via tour-bridge — never rendered as a card/button.
   */
  navigate?: ReturnType<typeof toNavTarget>;
  valid: boolean;
}

/**
 * Thin wrappers over catalog-engine. The model only ever supplies a query
 * or a product_id — navigate_to_product is the single function whose output
 * carries real coordinates, and those coordinates always come from
 * loadCatalog() (the validated, active-only catalog), never from the
 * model's own arguments.
 */
export function runTool(name: string, args: Record<string, unknown>): ToolRunResult {
  const catalog = loadCatalog();

  switch (name) {
    case "search_catalog": {
      const query = typeof args.query === "string" ? args.query : "";
      const filters = {
        category: typeof args.category === "string" ? args.category : undefined,
        color: typeof args.color === "string" ? args.color : undefined,
        material: typeof args.material === "string" ? args.material : undefined,
        section: typeof args.section === "string" ? args.section : undefined,
      };
      const candidates = searchCatalog(query, filters, catalog);
      return {
        output: candidates.map((c) => ({
          product_id: c.product.product_id,
          name: c.product.name,
          category: c.product.category,
          section: c.product.section,
        })),
        cards: [],
        valid: true,
      };
    }

    case "get_product": {
      const productId = typeof args.product_id === "string" ? args.product_id : "";
      const product = findProductById(productId);
      if (!product) {
        return { output: { error: `product_id "${productId}" no encontrado o no activo.` }, cards: [], valid: false };
      }
      return { output: toCard(product), cards: [toCard(product)], valid: true };
    }

    case "get_alternatives": {
      const productId = typeof args.product_id === "string" ? args.product_id : "";
      const product = findProductById(productId);
      if (!product) {
        return { output: { error: `product_id "${productId}" no encontrado o no activo.` }, cards: [], valid: false };
      }
      const alternatives = catalog.filter(
        (p) => p.alternatives_group === product.alternatives_group && p.product_id !== product.product_id
      );
      return {
        output: alternatives.map((p) => ({ product_id: p.product_id, name: p.name, section: p.section })),
        cards: alternatives.map((p) => toCard(p)),
        valid: true,
      };
    }

    case "navigate_to_product": {
      const productId = typeof args.product_id === "string" ? args.product_id : "";
      const product = findProductById(productId);
      if (!product) {
        return { output: { error: `product_id "${productId}" no encontrado o no activo.` }, cards: [], valid: false };
      }
      const navTarget = toNavTarget(product);
      return { output: { navTarget }, cards: [], navigate: navTarget, valid: true };
    }

    default:
      return { output: { error: `Herramienta desconocida: ${name}` }, cards: [], valid: false };
  }
}
