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
   * Physical silhouette/form (e.g. "modular", "curvo", "rectangular",
   * "L-shaped", "alto y estrecho") — distinct from `category` (what the
   * piece IS) and from `style` (its aesthetic). Useful for recommendations
   * that match spatial fit ("algo compacto para una esquina").
   */
  shape: z.string().optional(),
  /**
   * Decor style tag(s) (e.g. "Minimal", "Cálido natural") — the signal the
   * wishlist's style inference aggregates over. Distinct from `category`
   * (what the piece IS) and from `alternatives_group` (what else could
   * substitute for it) — this is about aesthetic, cuts across categories.
   */
  style: z.array(z.string()).default([]),
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
