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
export function deriveOverlayPrefix(hotspotName: string): string | null {
  const match = hotspotName.match(/B_?(\d+)/i);
  return match ? `b${match[1]}` : null;
}

/**
 * Canonicalizes a hotspot prefix for comparison — strips a leading "b"/"B" if
 * present. Needed because the tour's OWN overlay labels are inconsistent
 * about this, confirmed live by cross-referencing all 95 catalog entries
 * against every panorama's actual overlay labels: hotspots in the 100-110
 * and 160-167 box series are authored as "b106 hotspot"/"b106 dugme" (matches
 * deriveOverlayPrefix's always-prefixed output), but the 120/140/170-600
 * series — the vast majority — are authored as bare "121 hotspot"/
 * "121 dugme", no "b" at all. Comparing deriveOverlayPrefix's output directly
 * against a raw overlay label (as openProductPanel/findOpenNativePreview's
 * callers used to) only ever matched the minority; this normalizes both
 * sides to the same bare-number form so either authoring convention matches.
 */
export function normalizePrefix(prefix: string): string {
  return prefix.trim().toLowerCase().replace(/^b/, "");
}

function findOverlaysForMediaName(mediaName: string): TdvObject[] | undefined {
  const registry = window.tour?.player;
  const playlist = registry?.getById(MAIN_PLAYLIST_ID);
  const items = playlist?.get("items") as TdvObject[] | undefined;
  const item = items?.find((candidate) => {
    const media = candidate.get("media") as TdvObject | undefined;
    const data = media?.get("data") as { label?: string } | undefined;
    return data?.label === mediaName;
  });
  const media = item?.get("media") as TdvObject | undefined;
  return media?.get("overlays") as TdvObject[] | undefined;
}

/** Media label 3DVista's own playlist is currently showing, if any. */
function getCurrentMediaName(): string | null {
  const registry = window.tour?.player;
  const playlist = registry?.getById(MAIN_PLAYLIST_ID);
  const items = playlist?.get("items") as TdvObject[] | undefined;
  const idx = playlist?.get("selectedIndex") as number | undefined;
  const currentItem = idx !== undefined ? items?.[idx] : undefined;
  const media = currentItem?.get("media") as TdvObject | undefined;
  const data = media?.get("data") as { label?: string } | undefined;
  return data?.label ?? null;
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

  const overlays = findOverlaysForMediaName(target.media_name);
  if (!overlays) return;

  const DUGME_SUFFIX = " dugme";
  const targetPrefix = normalizePrefix(prefix);
  const panel = overlays.find((o) => {
    const data = o.get("data") as { label?: string } | undefined;
    const label = data?.label;
    return (
      typeof label === "string" &&
      label.endsWith(DUGME_SUFFIX) &&
      normalizePrefix(label.slice(0, -DUGME_SUFFIX.length)) === targetPrefix
    );
  });
  panel?.set?.("enabled", true);
}

export interface NativePreviewSignal {
  open: boolean;
  /** Only set when the "<prefix> dugme" mechanism fired — lets the caller
   * resolve which catalog product this is. Null for the shared-Window
   * mechanism below (there's no per-hotspot id to recover there) or when
   * nothing is open. */
  prefix: string | null;
}

/**
 * Whether the native product-preview page is genuinely on screen right now —
 * confirmed live via CDP that this tour renders that page as a real DOM
 * `<iframe src="https://www.febalcasa.com/...">`, created only while the
 * panel is actually open and removed from the DOM entirely on close (0
 * matches before opening, 1 immediately after a real click, 0 again after
 * closing via the native × — checked directly each time, not inferred).
 * `src` is checked (not just "any iframe exists") so an unrelated iframe
 * some other part of the page might add doesn't false-positive this.
 *
 * This replaces an earlier version that used the "<prefix> dugme" overlay's
 * `enabled` flag as the open/closed signal — plausible since a real click
 * does set it true, but confirmed live to be unreliable two ways: (1) it
 * ALSO flips true on a plain hover (the tour's own native tooltip uses the
 * same flag), so it fired for a rollover that never opened anything, and (2)
 * it does not reliably reset to `false` when the visitor closes the panel
 * via the native × — confirmed live: enabled stayed `true` after close,
 * permanently misreporting "still open" from then on. The dugme mechanism
 * is kept below only as a secondary signal, to resolve WHICH product this
 * is — the iframe itself carries no per-hotspot id.
 */
function isPreviewIframeOpen(): boolean {
  const iframe = document.querySelector("iframe");
  return !!iframe && iframe.offsetWidth > 0 && /febalcasa\.com/i.test(iframe.src);
}

/**
 * Normalized prefix of whichever hotspot's "<prefix> dugme" overlay is
 * enabled right now in the CURRENT panorama, or null if none is — this flag
 * flips true on a plain hover, not just a click (confirmed live), which is
 * exactly what makes it useful as a real-time "is the mouse over hotspot X
 * right now" signal, independent of the catalog's own (single, possibly
 * wrong-panorama) yaw/pitch. Shared by findOpenNativePreview below (gated on
 * the iframe, for "is the full preview open") and hotspot-heart-overlay.ts's
 * floating hover heart (NOT gated — reacts to hover alone).
 */
export function findEnabledDugmePrefix(): string | null {
  const mediaName = getCurrentMediaName();
  if (!mediaName) return null;
  const overlays = findOverlaysForMediaName(mediaName);
  if (!overlays) return null;
  const DUGME_SUFFIX = " dugme";
  for (const o of overlays) {
    const data = o.get("data") as { label?: string } | undefined;
    const label = data?.label;
    if (typeof label === "string" && label.endsWith(DUGME_SUFFIX) && o.get("enabled") === true) {
      return normalizePrefix(label.slice(0, -DUGME_SUFFIX.length));
    }
  }
  return null;
}

/**
 * Whether ANY native preview mechanism is currently showing in the active
 * panorama — the generic "is a native preview open right now" signal,
 * independent of whether the hotspot maps to a catalog product at all
 * (most don't yet — this is deliberately NOT catalog-filtered, see
 * hotspot-heart-overlay.ts for why).
 */
export function findOpenNativePreview(): NativePreviewSignal {
  if (!isPreviewIframeOpen()) return { open: false, prefix: null };
  // Preview is confirmed open — best-effort resolve WHICH product via
  // whichever dugme overlay is enabled right now (the same click that
  // opened the iframe also leaves that hotspot's own dugme enabled).
  return { open: true, prefix: findEnabledDugmePrefix() };
}
