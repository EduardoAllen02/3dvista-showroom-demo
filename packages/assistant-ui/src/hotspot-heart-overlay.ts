import type { HotspotManifestEntry, WishlistState } from "@3dvista-assistant/assistant-core";
import {
  type TourBridgeStrategy,
} from "@3dvista-assistant/tour-bridge";
import { projectToScreen } from "./hotspot-projection.js";

// Where the floating heart sits relative to the hotspot marker's own TRUE
// screen position (see tour-bridge's findHotspotAnchor) — up and to the
// right, reading as a companion badge rather than replacing the native
// marker. Fixed relative to the MARKER now, not the cursor — an earlier
// version anchored to wherever the mouse happened to be at the moment hover
// was first detected, which worked but could land at a slightly different
// offset each time depending on exactly where within the hover area the
// cursor was; this is now identical every time, for every hotspot.
const HEART_OFFSET_X = 14;
const HEART_OFFSET_Y = -58;
const HEART_OFFSET_MAGNITUDE = Math.hypot(HEART_OFFSET_X, HEART_OFFSET_Y);
// The one stay-visible zone (see tick()): once hover ends, the heart holds
// its last projected position, and stays visible as long as the mouse is
// within this radius of THAT point — comfortably covers both the marker
// itself (exactly HEART_OFFSET_MAGNITUDE away, by construction) and the
// button's own hitbox a bit beyond that, so the visitor always has a clear
// path from "hovering the marker" to "clicking the heart".
const STAY_VISIBLE_RADIUS_PX = HEART_OFFSET_MAGNITUDE + 15;

const HEART_SVG =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M12 20.5s-7.5-4.8-10-9.4C.5 7.8 2.3 4.5 5.6 4c2-.3 3.9.6 5 2.2C11.7 4.6 13.6 3.7 15.6 4c3.3.5 5.1 3.8 3.6 7.1-2.5 4.6-10 9.4-10 9.4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
  "</svg>";

/** The pieces of `p`'s showroom composition (just `p` when it has none). */
function compositionOf(manifest: HotspotManifestEntry[], p: HotspotManifestEntry): HotspotManifestEntry[] {
  const group = p.group_id ?? p.product_id;
  return manifest.filter((m) => (m.group_id ?? m.product_id) === group);
}

/** Saved already — under this piece or any other of its composition (e.g. from the chat). */
export function isCompositionSaved(wishlist: WishlistState, manifest: HotspotManifestEntry[], p: HotspotManifestEntry): boolean {
  return compositionOf(manifest, p).some((m) => wishlist.has(m.product_id));
}

/**
 * The hotspot hearts' save/unsave: one wishlist item per composition, whichever of its hotspots
 * the heart is on — the Origina kitchen's island and its two tall units are one product, never
 * three. `p` is the composition's canonical entry (see canonicalOf).
 */
export function toggleComposition(
  wishlist: WishlistState,
  manifest: HotspotManifestEntry[],
  p: HotspotManifestEntry,
  hotspotName: string | null
): void {
  const saved = compositionOf(manifest, p).filter((m) => wishlist.has(m.product_id));
  if (saved.length > 0) {
    for (const m of saved) wishlist.remove(m.product_id);
    return;
  }
  wishlist.toggle({
    product_id: p.product_id,
    name: p.name,
    description: "",
    image_url: p.image_url,
    section: "",
    detail_url: p.detail_url,
    navTarget: { media_name: p.media_name, yaw: p.yaw, pitch: p.pitch, fov: p.fov, hotspot_name: hotspotName },
    alternativesAvailable: false,
  });
}

const normUrl = (u: string | null | undefined): string =>
  (u ?? "").trim().toLowerCase().replace(/[?#].*$/, "").replace(/\/+$/, "");

export interface NativePreviewState {
  open: boolean;
  /** null when open but the hotspot doesn't map to any catalog product yet
   * (many still don't — deliberately shown anyway, see wishlist-layer.ts). */
  product: HotspotManifestEntry | null;
}

export interface HotspotHeartOverlayDeps {
  wishlist: WishlistState;
  manifest: HotspotManifestEntry[];
  /** The viewer: its camera and its own product hotspots (no hotspots → the overlay stays hidden). */
  bridge: TourBridgeStrategy;
  /** Fired only on actual change (open/closed, or which product), never
   * every frame — see the tick loop below. */
  onNativePreviewChange?: (state: NativePreviewState) => void;
}

/**
 * A full-viewport, otherwise-invisible layer that shows exactly one small
 * heart button, floating near whichever product hotspot the visitor is
 * currently pointing at. Independent of the chat widget entirely — reads/
 * writes the same shared WishlistState, but has no other coupling to it.
 *
 * Two independent signals, each doing exactly one job:
 *  - WHICH hotspot is active, and whether to show anything at all: driven
 *    by 3DVista's own real-time hover flag (findEnabledDugmePrefix in
 *    tour-bridge) — correct in every panorama, no catalog coordinate
 *    involved (an earlier version used the CATALOG's own authored
 *    yaw/pitch for this too, which only ever worked in whichever single
 *    panorama the catalog happened to record it for, since the same
 *    physical hotspot commonly appears in several).
 *  - WHERE to draw it: the marker's own TRUE per-panorama position (see
 *    tour-bridge's findHotspotAnchor — found by CDP reflection on the
 *    overlay's `items[0]`), projected to screen with the live camera via
 *    projectToScreen. An earlier version anchored the heart to wherever the
 *    mouse happened to be at the moment hover was first detected — worked,
 *    but landed at a slightly different offset each time depending on where
 *    within the hover area the cursor was, and could read as faint jitter.
 *    This is now a fixed, identical offset from the marker for every
 *    hotspot, independent of the mouse entirely.
 *
 * Intentionally NOT a DOM-per-hotspot approach: 3DVista renders hotspots on
 * canvas/WebGL (confirmed live — no DOM element exists per marker to attach
 * a real `mouseenter` to), so this polls every animation frame instead.
 */
export function createHotspotHeartOverlay(deps: HotspotHeartOverlayDeps): { element: HTMLElement; destroy: () => void } {
  const layer = document.createElement("div");
  layer.className = "tva-hotspot-layer";

  const heartBtn = document.createElement("button");
  heartBtn.type = "button";
  heartBtn.className = "tva-hotspot-heart";
  heartBtn.innerHTML = HEART_SVG;
  layer.appendChild(heartBtn);

  let mouseX = -9999;
  let mouseY = -9999;
  let current: HotspotManifestEntry | null = null;
  // The heart's own last-projected screen position — recomputed fresh from
  // the marker's true yaw/pitch every tick WHILE genuinely hovered, then
  // held fixed once hover ends, so the one stay-visible zone in tick() has
  // a stable point to measure from.
  let heartX = 0;
  let heartY = 0;
  // Updated by checkNativePreview below (polled independently) — while true,
  // the full preview page owns this role via previewHeartBtn (wishlist-
  // layer.ts), so this floating heart hides regardless of hover state.
  let previewOpen = false;

  function onMouseMove(e: MouseEvent): void {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }
  // Capture phase, NOT bubble (the default) — confirmed live via CDP that
  // 3DVista's own panorama canvas stops mousemove from ever reaching a
  // bubble-phase `window` listener (0/62 events received in a direct A/B
  // test: same real hover sequence, only the capture-phase listener saw
  // anything). Without this, mouseX/mouseY never update while the pointer
  // is over the panorama itself — which is effectively the entire viewport
  // — so this heart could never appear for a real visitor no matter how
  // correct the projection math or catalog matching was.
  window.addEventListener("mousemove", onMouseMove, true);

  function syncSavedVisual(): void {
    if (!current) return;
    heartBtn.classList.toggle("tva-hotspot-heart--saved", isCompositionSaved(deps.wishlist, deps.manifest, current));
  }

  heartBtn.addEventListener("click", () => {
    if (!current) return;
    toggleComposition(deps.wishlist, deps.manifest, current, null);
    syncSavedVisual();
  });

  // The hotspot last pointed at: clicking it is what opens its preview, and by the time the
  // preview is detected the popup covering the marker may have fired its roll-out already.
  let lastHovered: { key: string; at: number } | null = null;
  const LAST_HOVER_MS = 4000;

  // Tracks the native-preview prefix across checks so onNativePreviewChange
  // only fires on an actual change — `undefined` (not `null`) means "not
  // checked yet", forcing one initial callback even if nothing is open.
  //
  // Polled on its OWN setInterval, deliberately NOT folded into the
  // requestAnimationFrame loop below (that one's for the hover-heart's
  // mouse-following, which genuinely needs frame-rate smoothness) —
  // confirmed live that requestAnimationFrame callbacks are suspended
  // entirely while a tab is backgrounded/hidden (`document.hidden`), even
  // under CDP automation with no visible user-facing tab switch involved.
  // A visitor who opens a hotspot preview, then alt-tabs away and back
  // deserves the heart to reflect that once they return — a poll interval
  // (not tied to frame delivery at all) doesn't have that failure mode,
  // and this check doesn't need 60fps precision anyway.
  const NATIVE_PREVIEW_POLL_MS = 300;
  // Tracks open+prefix together (not just prefix) — "closed" and "open via
  // the shared-Window mechanism" both have prefix:null, so prefix alone
  // can't tell those two apart. `undefined` means "not checked yet",
  // forcing one initial callback even if nothing is open.
  let lastSignature: string | undefined = undefined;
  function checkNativePreview(): void {
    const panel = deps.bridge.hotspots?.openPanel() ?? { open: false, key: null, url: null };
    const signal = { open: panel.open, prefix: panel.key, url: panel.url ?? null };
    previewOpen = signal.open;
    if (!deps.onNativePreviewChange) return;
    const signature = `${signal.open}:${signal.prefix ?? ""}:${signal.url ?? ""}`;
    if (signature === lastSignature) return;
    lastSignature = signature;
    if (!signal.open) {
      deps.onNativePreviewChange({ open: false, product: null });
      return;
    }
    // Deliberately not catalog-filtered: shown for ANY native preview, even
    // one this catalog doesn't cover yet — explicit direction ("implementa
    // el botón para todos los hotspots aunque haya algunos que todavía no
    // tengamos completo el catálogo... esta bueno que la UI se vea como va
    // a quedar en producción"). product stays null when unmapped OR when
    // opened via the shared-Window mechanism (no per-hotspot id to resolve
    // there); the heart still appears either way, its click just has
    // nothing to save when product is null (see wishlist-layer.ts).
    deps.onNativePreviewChange({ open: true, product: resolvePreviewProduct(signal.prefix, signal.url) });
  }

  /**
   * Which product an open preview shows: the hotspot whose "dugme" is still enabled, else the one
   * just pointed at — each only if it opens this page (a stale enabled "dugme" can linger) — else
   * the page itself, preferring a piece that is in this panorama when several share it.
   */
  function resolvePreviewProduct(prefix: string | null, url: string | null): HotspotManifestEntry | null {
    const page = normUrl(url);
    const showsPage = (p: HotspotManifestEntry): boolean =>
      !page || (p.page_urls ?? [normUrl(p.detail_url)]).includes(page);
    const recent = lastHovered && Date.now() - lastHovered.at < LAST_HOVER_MS ? lastHovered.key : null;
    for (const key of [prefix, recent]) {
      const p = key ? resolveProductForPrefix(key) : null;
      if (p && showsPage(p)) return p;
    }
    if (!page) return null;
    const onPage = deps.manifest.filter((p) => (p.page_urls ?? [normUrl(p.detail_url)]).includes(page));
    const here = onPage.find((p) => keysOf(p).some((k) => deps.bridge.hotspots?.anchor(k)));
    const found = here ?? onPage[0];
    return found ? canonicalOf(found) : null;
  }

  function keysOf(p: HotspotManifestEntry): string[] {
    const own = p.hotspot_name ? deps.bridge.hotspots?.keyOf(p.hotspot_name) ?? null : null;
    return [...(own ? [own] : []), ...(p.hotspot_keys ?? [])];
  }

  function canonicalOf(p: HotspotManifestEntry): HotspotManifestEntry {
    return deps.manifest.find((m) => m.product_id === p.group_id) ?? p;
  }
  // Deliberately NOT also called eagerly/synchronously here — an earlier
  // version did, to avoid a 300ms wait before the first correct paint, but
  // createHotspotHeartOverlay is invoked from wishlist-layer.ts partway
  // through ITS OWN setup, before several `const`/`let` bindings that
  // onNativePreviewChange's handler (syncEntryButtons) reads are
  // initialized — confirmed live, threw "Cannot access '<x>' before
  // initialization" for two different bindings in turn as each got fixed.
  // Simplest robust fix: let the first setInterval tick (below) be the
  // first check, by which point the caller's synchronous setup has
  // necessarily finished — not worth chasing every future binding this
  // could trip over just to shave 300ms off the very first render.
  const previewPollId = window.setInterval(checkNativePreview, NATIVE_PREVIEW_POLL_MS);

  /** The composition's canonical product for a hotspot key (its own hotspot or an extra one). */
  function resolveProductForPrefix(prefix: string): HotspotManifestEntry | null {
    const p = deps.manifest.find((m) => keysOf(m).includes(prefix));
    return p ? canonicalOf(p) : null;
  }

  function showAt(x: number, y: number): void {
    heartBtn.classList.add("tva-hotspot-heart--visible");
    heartBtn.style.transform = `translate(${x}px, ${y}px)`;
    syncSavedVisual();
  }

  function hide(): void {
    heartBtn.classList.remove("tva-hotspot-heart--visible");
    current = null;
  }

  function tick(): void {
    // The full preview page (previewHeartBtn in wishlist-layer.ts) owns this
    // role while it's open — never show both at once.
    if (previewOpen) {
      if (current) hide();
      return;
    }

    // Real-time "is the mouse over hotspot X right now" — driven by 3DVista's
    // OWN dugme-enabled-on-hover flag (see findEnabledDugmePrefix). Only
    // decides WHICH hotspot is active; positioning below is independent of
    // the mouse entirely.
    const hoveredPrefix = deps.bridge.hotspots?.hovered() ?? null;
    if (hoveredPrefix) {
      lastHovered = { key: hoveredPrefix, at: Date.now() };
      const product = resolveProductForPrefix(hoveredPrefix);
      if (product) {
        // The marker's own TRUE screen position this frame — read live
        // (findHotspotAnchor) and projected with the current camera
        // orientation, recomputed every tick while genuinely hovered. Since
        // the camera doesn't move just from the visitor moving the mouse
        // toward the button, this lands on the exact same pixel every time
        // — no jitter, no dependency on exactly where within the hover area
        // the cursor happened to be (an earlier version anchored to that
        // instead, see git history).
        const anchor = deps.bridge.hotspots?.anchor(hoveredPrefix) ?? null;
        const camera = deps.bridge.getViewer?.() ?? null;
        const pt = anchor && camera ? projectToScreen(camera, anchor, window.innerWidth, window.innerHeight) : null;
        if (pt && pt.visible) {
          current = product;
          heartX = pt.x + HEART_OFFSET_X;
          heartY = pt.y + HEART_OFFSET_Y;
          showAt(heartX, heartY);
          return;
        }
      }
      // Hovering a real hotspot, but it isn't in the catalog yet, or its
      // anchor/camera couldn't be resolved this tick — nothing new to show;
      // fall through to the stay-visible check below in case a previously
      // shown heart is still reachable.
    }

    // Not directly hovering a mapped hotspot right now — keep any
    // already-shown heart visible purely by DISTANCE from its last known
    // (now frozen) position, explicitly not a timer per direction: gives
    // the visitor a clear window to move from the marker to the button
    // without the heart vanishing mid-transit.
    if (current) {
      const distToHeart = Math.hypot(mouseX - heartX, mouseY - heartY);
      if (distToHeart <= STAY_VISIBLE_RADIUS_PX) {
        showAt(heartX, heartY);
        return;
      }
    }

    hide();
  }
  // setInterval, NOT requestAnimationFrame — confirmed live (again; see
  // checkNativePreview's own poll above for the first time this bit) that
  // RAF callbacks are suspended entirely while the tab/pane is backgrounded
  // (`document.hidden`), which would silently freeze this heart — including
  // leaving it stuck visible/frozen at a stale position — for as long as the
  // visitor's tab isn't the focused one. 40ms keeps the following-the-cursor
  // feel smooth during a genuine hover without RAF's visibility pitfall.
  const TICK_INTERVAL_MS = 40;
  const tickId = window.setInterval(tick, TICK_INTERVAL_MS);

  return {
    element: layer,
    destroy(): void {
      window.clearInterval(tickId);
      window.clearInterval(previewPollId);
      window.removeEventListener("mousemove", onMouseMove, true);
    },
  };
}
