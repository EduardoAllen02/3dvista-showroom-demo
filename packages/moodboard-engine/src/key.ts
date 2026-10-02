import { createHash } from "node:crypto";
import type { MoodboardLocale, MoodboardProduct } from "./types.js";

/**
 * Bump when the prompts or the output shape change: every key changes with
 * it, so old cached moodboards are simply never read again.
 */
export const CONTENT_VERSION = 1;

const KEY_PATTERN = /^[a-f0-9]{32}$/;

/**
 * Content address of a moodboard. Two visitors whose wishlists resolve to
 * the same style and the same anchors get the same moodboard, generated
 * once.
 *
 * The anchors' catalog data is part of the address, not just their ids: when
 * the catalog corrects a piece (its color, material, photo...), every
 * moodboard built on the old data stops matching and is regenerated on
 * demand. Anchors are sorted by id: the pair matters, not which one the
 * visitor saved first.
 */
export function moodboardKey(input: {
  tourId: string;
  locale: MoodboardLocale;
  style: string;
  anchors: readonly MoodboardProduct[];
}): string {
  const anchors = [...input.anchors]
    .sort((a, b) => a.product_id.localeCompare(b.product_id))
    .map((p) => [
      p.product_id,
      p.name,
      p.category,
      p.style,
      p.colors,
      p.materials,
      p.finish,
      p.shape ?? null,
      p.image_url,
      p.has_photo !== false,
    ]);
  const material = JSON.stringify([CONTENT_VERSION, input.tourId, input.locale, input.style, anchors]);
  return createHash("sha256").update(material).digest("hex").slice(0, 32);
}

export function isMoodboardKey(value: unknown): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value);
}
