import type { SkinTweaks, TdvObject } from "./types.js";

/**
 * Small, per-tour edits to 3DVista's own skin (the buttons and labels drawn by the tour, not by
 * the widget): hide one, raise another. Applied through the player's object graph, so the export
 * itself is never patched and a re-export keeps working.
 */

const CLASSES = ["Label", "Image", "IconButton", "Container", "HTMLText"];
// A component raised once stays raised: applying the tweaks again must not move it further.
const raised = new WeakSet<object>();

/** Components by id (the mobile skin repeats it with "_mobile") or by their editor name (data.name). */
function findComponents(key: string): TdvObject[] {
  const registry = window.tour?.player;
  if (!registry) return [];
  const byId = [key, `${key}_mobile`].map((id) => registry.getById(id)).filter((c): c is TdvObject => !!c);
  if (byId.length) return byId;
  const all = CLASSES.flatMap((cls) => {
    try {
      return registry.getByClassName?.(cls) ?? [];
    } catch {
      return [];
    }
  });
  return all.filter((c) => (c.get("data") as { name?: string } | undefined)?.name === key);
}

/** False while the player isn't there yet (the caller retries). */
export function applyTdvSkinTweaks(tweaks: SkinTweaks): boolean {
  if (typeof window.tour?.player?.getById !== "function") return false;
  for (const key of tweaks.hide ?? []) for (const c of findComponents(key)) c.set?.("visible", false);
  for (const [key, delta] of Object.entries(tweaks.raise ?? {})) {
    for (const c of findComponents(key)) {
      const bottom = c.get("bottom");
      if (raised.has(c) || typeof bottom !== "number") continue;
      c.set?.("bottom", bottom + delta);
      raised.add(c);
    }
  }
  return true;
}

/** The language the visitor picked on the tour's own language screen ("it-IT", "en-US"). */
export function tdvLocale(): string | null {
  const id = window.tour?.locManager?.currentLocaleID;
  return typeof id === "string" ? id : null;
}
