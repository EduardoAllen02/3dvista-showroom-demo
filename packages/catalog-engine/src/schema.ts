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
  active: z.boolean(),
});

export type Product = z.infer<typeof ProductSchema>;

export const CatalogSchema = z.array(ProductSchema);
