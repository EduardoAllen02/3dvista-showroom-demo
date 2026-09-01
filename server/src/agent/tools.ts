import { searchCatalog, toNavTarget, getRecommendations, computeStyleProfile, type Product } from "@3dvista-assistant/catalog-engine";
import { findProductById, loadCatalog } from "../catalog/catalog-loader.js";
import { buildFullCatalogListing } from "./catalog-listing.js";

export interface ProductCardPayload {
  product_id: string;
  name: string;
  description: string;
  image_url: string;
  section: string;
  detail_url: string | null;
  navTarget: ReturnType<typeof toNavTarget>;
  /**
   * Whether "Ver alternativas" should render for this card. True only for
   * a fresh single-product proposal (get_product) that actually has other
   * products in its alternatives_group. False for every card that already
   * IS an alternative (get_alternatives' own output) — offering "more
   * alternatives to an alternative" is meaningless once the full set has
   * already been shown, which was exactly the UX complaint that drove this
   * field: showing every alternative as its own full card, each with its
   * own redundant "Ver alternativas" button, in one message.
   */
  alternativesAvailable: boolean;
}

/** Same-name-dedup used both to decide alternativesAvailable and to build the actual list. */
function distinctAlternatives(product: Product, catalog: Product[]): Product[] {
  // Seeded with the anchor's OWN name — some catalog entries are two
  // separate hotspot markers on the literal same physical piece (confirmed
  // live: "Divano Camden" has two product_ids, same sofa, same room, two
  // marker positions). Without seeding this, the anchor's own name was
  // never in the set (it gets filtered out by the product_id check below
  // before ever reaching the seenNames logic), so its own duplicate-by-
  // name twin slipped through as if it were a real alternative — the sofa
  // "recommended" as an alternative to itself.
  const seenNames = new Set<string>([product.name]);
  return catalog.filter((p) => {
    if (p.alternatives_group !== product.alternatives_group || p.product_id === product.product_id) {
      return false;
    }
    if (seenNames.has(p.name)) return false;
    seenNames.add(p.name);
    return true;
  });
}

function toCard(product: Product, alternativesAvailable: boolean): ProductCardPayload {
  return {
    product_id: product.product_id,
    name: product.name,
    description: product.description,
    image_url: product.image_url,
    section: product.section,
    detail_url: product.detail_url,
    navTarget: toNavTarget(product),
    alternativesAvailable,
  };
}

/** Cap on how many alternative cards get_alternatives (and the deterministic
 * /alternatives route, which reuses this same tool) ever return in one shot. */
const MAX_ALTERNATIVES = 5;

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
        shape: typeof args.shape === "string" ? args.shape : undefined,
        section: typeof args.section === "string" ? args.section : undefined,
      };
      const { candidates, lowConfidence } = searchCatalog(query, filters, catalog);
      const output: Record<string, unknown> = {
        candidates: candidates.map((c) => ({
          product_id: c.product.product_id,
          name: c.product.name,
          category: c.product.category,
          section: c.product.section,
        })),
      };
      // Same low-confidence fallback as the per-turn system prompt (see
      // system-prompt.ts) — when the model itself calls this tool and the
      // keyword search comes up too thin, hand it the full catalog (with
      // descriptions) right here instead of a dead end.
      if (lowConfidence) {
        output.low_confidence = true;
        output.note =
          "Pocos o ningún candidato relevante para esta búsqueda. Aquí está todo el catálogo activo " +
          "(con descripción) como respaldo — úsalo solo si de verdad ayuda a identificar qué pidió el " +
          "usuario, y sigue confirmando con get_product/get_alternatives antes de describir cualquiera.";
        output.full_catalog = buildFullCatalogListing(catalog);
      }
      return { output, cards: [], valid: true };
    }

    case "get_product": {
      const productId = typeof args.product_id === "string" ? args.product_id : "";
      const product = findProductById(productId);
      if (!product) {
        return { output: { error: `product_id "${productId}" no encontrado o no activo.` }, cards: [], valid: false };
      }
      const alternativesAvailable = distinctAlternatives(product, catalog).length > 0;
      const card = toCard(product, alternativesAvailable);
      // These two fields exist only in the tool OUTPUT (what the model
      // reads), never in the card payload sent to the frontend — they're
      // what lets the model act as a decor consultant ("esto combina con
      // Tavolino Rio") grounded in real catalog data instead of guessing.
      // `compatible_with` on the product is only ids; resolve to names here
      // so the model never has to (and can't accidentally invent one).
      // Deduped by NAME, not just id — some catalog rows are two separate
      // hotspot markers on the literal same physical piece (see
      // distinctAlternatives above), so two different compatible_with ids
      // can resolve to the same displayed name; without this a visitor
      // could be told a product "combina con Tavolino Rio y Tavolino Rio".
      const seenCompatibleNames = new Set<string>();
      const compatibleNames = product.compatible_with
        .map((id) => findProductById(id)?.name)
        .filter((name): name is string => !!name)
        .filter((name) => {
          if (seenCompatibleNames.has(name)) return false;
          seenCompatibleNames.add(name);
          return true;
        });
      return {
        output: {
          ...card,
          style: product.style,
          shape: product.shape ?? null,
          materials: product.materials,
          compatible_with_names: compatibleNames,
        },
        cards: [card],
        valid: true,
      };
    }

    case "get_alternatives": {
      const productId = typeof args.product_id === "string" ? args.product_id : "";
      const product = findProductById(productId);
      if (!product) {
        return { output: { error: `product_id "${productId}" no encontrado o no activo.` }, cards: [], valid: false };
      }
      // Same product line placed in several rooms (e.g. one "Sistema
      // Origina" per showroom section) isn't a meaningfully different
      // "alternative" to a visitor — it's the same item shown N times. That
      // flood of near-duplicate cards was also a real, observed contributor
      // to the agent losing track of what it had actually proposed a few
      // turns later (too much undifferentiated noise in its own history).
      // Keep only the first placement per distinct product name, and cap
      // the total shown — a category with 20 distinct products would
      // otherwise dump 20 full cards into one message, exactly the wall-of-
      // cards a live test flagged as bad UX.
      const alternatives = distinctAlternatives(product, catalog).slice(0, MAX_ALTERNATIVES);
      return {
        output: alternatives.map((p) => ({ product_id: p.product_id, name: p.name, section: p.section })),
        // These cards ARE the alternatives — none of them gets its own
        // "Ver alternativas" button (alternativesAvailable: false).
        cards: alternatives.map((p) => toCard(p, false)),
        valid: true,
      };
    }

    case "get_recommendations": {
      const productIds = Array.isArray(args.product_ids)
        ? args.product_ids.filter((id): id is string => typeof id === "string")
        : [];
      if (productIds.length === 0) {
        return {
          output: { error: "product_ids vacío — no hay wishlist guardada de la que partir." },
          cards: [],
          valid: false,
        };
      }
      const { dominantStyle } = computeStyleProfile(productIds, catalog);
      const recommendations = getRecommendations(productIds, catalog);
      return {
        output: {
          dominant_style: dominantStyle,
          recommendations: recommendations.map((p) => ({ product_id: p.product_id, name: p.name, section: p.section })),
        },
        // Recommendations are a discovery surface, not a single proposal —
        // none of them offers its own "Ver alternativas" (same reasoning as
        // get_alternatives' cards: these already ARE the suggested set).
        cards: recommendations.map((p) => toCard(p, false)),
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
