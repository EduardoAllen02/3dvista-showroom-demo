import type { NavTarget, TdvObject } from "./types.js";

const MAIN_PLAYLIST_ID = "mainPlayList";

/**
 * Every product hotspot in the febal-casa tour export is a PAIR of overlays
 * sharing a numeric prefix derived from the source catalog's `hotspot_name`
 * (e.g. "BOX 100 - B_106" -> prefix "b106"): one tagged "hotspot" (the small
 * always-enabled marker) and one tagged "m" (the actual info panel/button,
 * `enabled:false` by default, label "<prefix> dugme"). Confirmed live via
 * CDP: read `media.get('overlays')` on the real export, cross-referenced
 * several products' `hotspot_name` against the "<prefix> hotspot"/
 * "<prefix> dugme" pairs found there (same yaw/pitch as the catalog's own
 * authored camera target). A real click on the marker flips its paired
 * "dugme" overlay's `enabled` to true — replicating that exact `set()` call
 * is what reproduces the native panel from here.
 *
 * NOT used: `window.tour.triggerOverlayByName`. It exists on this build,
 * but calling it — with any argument combination, and even calling the two
 * internal methods it wraps (`getPanoramaOverlayByName`/`triggerOverlay`)
 * directly — throws `TypeError: a.get is not a function` every time,
 * confirmed live. Whatever internal state it expects isn't present when
 * called from outside a real user click event; treated as unusable rather
 * than debugged further.
 */
function deriveOverlayPrefix(hotspotName: string): string | null {
  const match = hotspotName.match(/B_?(\d+)/i);
  return match ? `b${match[1]}` : null;
}

/**
 * Opens the same info panel a real hotspot click would, for the given nav
 * target — a no-op (not an error) whenever the product has no authored
 * hotspot, the label doesn't match the expected "BOX nnn - B_nnn" pattern,
 * the target panorama isn't found, or no matching overlay pair exists there.
 * Always called ALONGSIDE navigateTo (see chat-card.ts), never instead of
 * it — this only reveals the panel, it doesn't move the camera.
 */
export function openProductPanel(target: NavTarget): void {
  if (!target.hotspot_name) return;
  const prefix = deriveOverlayPrefix(target.hotspot_name);
  if (!prefix) return;

  const registry = window.tour?.player;
  const playlist = registry?.getById(MAIN_PLAYLIST_ID);
  const items = playlist?.get("items") as TdvObject[] | undefined;
  const item = items?.find((candidate) => {
    const media = candidate.get("media") as TdvObject | undefined;
    const data = media?.get("data") as { label?: string } | undefined;
    return data?.label === target.media_name;
  });
  const media = item?.get("media") as TdvObject | undefined;
  const overlays = media?.get("overlays") as TdvObject[] | undefined;
  if (!overlays) return;

  const targetLabel = `${prefix} dugme`;
  const panel = overlays.find((o) => {
    const data = o.get("data") as { label?: string } | undefined;
    return data?.label === targetLabel;
  });
  panel?.set?.("enabled", true);
}
