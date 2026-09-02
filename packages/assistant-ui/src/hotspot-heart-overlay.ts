import type { HotspotManifestEntry, WishlistState } from "@3dvista-assistant/assistant-core";
import { deriveOverlayPrefix, findEnabledDugmePrefix, findOpenNativePreview, normalizePrefix } from "@3dvista-assistant/tour-bridge";

// Where the floating heart sits relative to the point where a hover was
// detected — up and to the right of the cursor, reading as a companion badge
// rather than replacing the native marker. HEART_OFFSET_MAGNITUDE (its
// distance from that point) doubles as the "stay visible" radius below: a
// circle of exactly this size, centered on the hover point, always reaches
// the heart's own center — see the stay-visible comment in tick() for why
// this specific value (not an arbitrary bigger one, and not a timer) is what
// guarantees the visitor can actually reach the button to click it.
// Bumped up from an earlier (10, -40) — reported live as sitting close
// enough to visually overlap the native marker icon in some spots.
const HEART_OFFSET_X = 14;
const HEART_OFFSET_Y = -58;
const HEART_OFFSET_MAGNITUDE = Math.hypot(HEART_OFFSET_X, HEART_OFFSET_Y);
// Half again the button's own rendered size (34px, see .tva-hotspot-heart in
// assistant.css) plus a small margin — the second stay-visible zone, centered
// on the button itself rather than the hover point, so a visitor already
// resting on the button never loses it even though the hover-point circle
// above only ever reaches the button's center, not its far edge.
const HEART_HIT_RADIUS_PX = 20;

const HEART_SVG =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M12 20.5s-7.5-4.8-10-9.4C.5 7.8 2.3 4.5 5.6 4c2-.3 3.9.6 5 2.2C11.7 4.6 13.6 3.7 15.6 4c3.3.5 5.1 3.8 3.6 7.1-2.5 4.6-10 9.4-10 9.4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
  "</svg>";

export interface NativePreviewState {
  open: boolean;
  /** null when open but the hotspot doesn't map to any catalog product yet
   * (many still don't — deliberately shown anyway, see wishlist-layer.ts). */
  product: HotspotManifestEntry | null;
}

export interface HotspotHeartOverlayDeps {
  wishlist: WishlistState;
  manifest: HotspotManifestEntry[];
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
 * Positioning is driven by 3DVista's OWN real-time hover signal (see
 * findEnabledDugmePrefix in tour-bridge), not a catalog yaw/pitch projection
 * — an earlier version projected each manifest entry's authored yaw/pitch to
 * screen and checked proximity to the mouse, which only ever worked in
 * whichever single panorama the catalog happened to record that yaw/pitch
 * for. Confirmed live that the same physical hotspot commonly appears in
 * several panoramas (different rooms/angles showing the same piece), so that
 * approach silently failed everywhere except one specific panorama per
 * product — this reads the tour's own live hover state instead, which is
 * correct in every panorama a hotspot appears in, no catalog coordinate
 * involved. Intentionally NOT a DOM-per-hotspot approach: 3DVista renders
 * hotspots on canvas/WebGL (confirmed live — no DOM element exists per
 * marker to attach a real `mouseenter` to), so this polls every animation
 * frame instead.
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
  // The mouse position at the moment `current` was last confirmed hovered
  // (dugme enabled) — frozen once hover ends, so the two stay-visible zones
  // in tick() have a fixed point to measure from instead of chasing a
  // constantly-updating value.
  let anchorX = 0;
  let anchorY = 0;
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
    heartBtn.classList.toggle("tva-hotspot-heart--saved", deps.wishlist.has(current.product_id));
  }

  heartBtn.addEventListener("click", () => {
    if (!current) return;
    const p = current;
    deps.wishlist.toggle({
      product_id: p.product_id,
      name: p.name,
      description: "",
      image_url: p.image_url,
      section: "",
      detail_url: p.detail_url,
      navTarget: { media_name: p.media_name, yaw: p.yaw, pitch: p.pitch, fov: p.fov, hotspot_name: null },
      alternativesAvailable: false,
    });
    syncSavedVisual();
  });

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
    const signal = findOpenNativePreview();
    previewOpen = signal.open;
    if (!deps.onNativePreviewChange) return;
    const signature = `${signal.open}:${signal.prefix ?? ""}`;
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
    const product = signal.prefix ? resolveProductForPrefix(signal.prefix) : null;
    deps.onNativePreviewChange({ open: true, product });
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

  function resolveProductForPrefix(prefix: string): HotspotManifestEntry | null {
    return (
      deps.manifest.find((p) => {
        if (!p.hotspot_name) return false;
        const derived = deriveOverlayPrefix(p.hotspot_name);
        return derived != null && normalizePrefix(derived) === prefix;
      }) ?? null
    );
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
    // OWN dugme-enabled-on-hover flag (see findEnabledDugmePrefix), not a
    // catalog yaw/pitch projection. This is what makes it work in EVERY
    // panorama a hotspot appears in, not just the one the catalog happened to
    // record — confirmed live that most products' hotspot exists in several
    // panoramas but the catalog only ever captured one.
    const hoveredPrefix = findEnabledDugmePrefix();
    if (hoveredPrefix) {
      const product = resolveProductForPrefix(hoveredPrefix);
      if (product) {
        // Anchor set ONLY on the first tick this product is detected as
        // hovered (current !== product covers both "nothing was shown yet"
        // and "this is a different hotspot than before") — NOT re-set on
        // every subsequent tick while still hovering the same one. An
        // earlier version re-anchored every tick, which made the heart
        // visibly chase the cursor around inside the hotspot's own hover
        // area instead of staying put — reported live as wrong. Once
        // anchored, the heart holds that exact spot regardless of how much
        // more the mouse moves within (or, per the stay-visible zones
        // below, just outside) the hover area.
        if (current !== product) {
          current = product;
          anchorX = mouseX;
          anchorY = mouseY;
        }
        showAt(anchorX + HEART_OFFSET_X, anchorY + HEART_OFFSET_Y);
        return;
      }
      // Hovering a real hotspot, but it isn't in the catalog yet — nothing to
      // show for THIS one; fall through to the stay-visible check below in
      // case a different, already-shown heart is still reachable.
    }

    // Not directly hovering a mapped hotspot right now — keep any
    // already-shown heart visible purely by DISTANCE (explicitly not a
    // timer, per direction), frozen at its last hover position:
    //  - within HEART_OFFSET_MAGNITUDE of that position (the same distance
    //    used to place the heart, so this circle always reaches exactly to
    //    the heart's own center — guarantees the cursor can get there), OR
    //  - within HEART_HIT_RADIUS_PX of the heart's own center (covers the
    //    button's far edge, which the circle above doesn't quite reach, and
    //    lets the visitor rest on the button itself indefinitely).
    if (current) {
      const heartX = anchorX + HEART_OFFSET_X;
      const heartY = anchorY + HEART_OFFSET_Y;
      const distToAnchor = Math.hypot(mouseX - anchorX, mouseY - anchorY);
      const distToHeart = Math.hypot(mouseX - heartX, mouseY - heartY);
      if (distToAnchor <= HEART_OFFSET_MAGNITUDE || distToHeart <= HEART_HIT_RADIUS_PX) {
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
