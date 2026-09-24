import { z } from "zod";

/**
 * Canonical product record schema (section 7 of the master context doc).
 * The LLM never writes to these fields directly — they come only from the
 * validated catalog, loaded server-side.
 */
export const ProductSchema = z.object({
  product_id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  description: z.string().max(2000),
  colors: z.array(z.string()),
  materials: z.array(z.string()),
  keywords: z.array(z.string()),
  synonyms: z.array(z.string()),
  section: z.string().min(1),
  media_name: z.string().min(1),
  yaw: z.number().min(-180).max(180),
  pitch: z.number().min(-90).max(90),
  fov: z.number().min(20).max(120),
  hotspot_name: z.string().nullable(),
  image_url: z.string().min(1),
  detail_url: z.string().nullable(),
  alternatives_group: z.string().min(1),
  /**
   * Physical silhouette/form (e.g. "modulare", "curvo", "rettangolare",
   * "ad angolo") — distinct from `category` (what the piece IS) and from
   * `style` (its aesthetic). Useful for recommendations that match spatial
   * fit ("algo compacto para una esquina").
   *
   * KNOWN GAP (confirmed live, not yet built): unlike `colors` (which has
   * `color-families.ts`'s COLOR_FAMILIES + tools.ts's `color_fallback` to
   * honestly suggest a near match when the exact one doesn't exist), shape
   * has no equivalent "closeness" concept. `shapeMatches` in matching.ts
   * only tolerates PHRASING variance of the same real value (e.g. "angolo"
   * matching stored "ad angolo") — it has no idea that "modulare con isola"
   * and "modulare curvo" might both be reasonable answers to a visitor
   * asking for "ad angolo". Building a SHAPE_FAMILIES equivalent would
   * follow the exact same pattern as COLOR_FAMILIES if this becomes a
   * priority.
   */
  shape: z.string().optional(),
  /**
   * Decor style tag(s) — CLIENT-FACING, must be Italian (same rule as
   * `category`, see build-febal-catalog.mjs's CATEGORY_RULES comment).
   * Real controlled vocabulary in use today: "Minimal", "Contemporaneo",
   * "Classico elegante", "Caldo accogliente" (see
   * scripts/enrich-febal-style-compat.mjs's STYLE_KEYWORDS — these were
   * shipped in Spanish until a live audit in this session, confirmed the
   * same bug class as `category`'s Spanish leak in commit 2a48d50). The
   * signal the wishlist's style inference aggregates over. Distinct from
   * `category` (what the piece IS) and from `alternatives_group` (what else
   * could substitute for it) — this is about aesthetic, cuts across
   * categories.
   */
  style: z.array(z.string()).default([]),
  /**
   * Named upholstery/fabric-line branding (e.g. "Velvet", "Boston",
   * "Rimini" — Febal Casa's own controlled vocabulary of ~11-12 rivestimento
   * lines, confirmed live on febalcasa.com's product pages). Distinct from
   * `materials` (physical composition — "legno", "pelle", "tessuto") and
   * from `colors` (the actual shade — "verde", "cognac"): a visitor asking
   * "¿lo tienes en velvet?" is naming this field, not a color.
   */
  finish: z.array(z.string()).default([]),
  /**
   * product_ids of OTHER pieces this one was designed/staged to pair with
   * (e.g. a sofa's companion coffee table) — never includes ids from this
   * product's own `alternatives_group` (those are substitutes for THIS
   * product, the opposite relationship: things that pair WITH it). Powers
   * recommendations; never shown as "Ver alternativas".
   */
  compatible_with: z.array(z.string()).default([]),
  active: z.boolean(),
});

export type Product = z.infer<typeof ProductSchema>;

export const CatalogSchema = z.array(ProductSchema);
