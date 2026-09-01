import type { HotspotManifestEntry, WishlistState } from "@3dvista-assistant/assistant-core";
import { getActiveMediaName, getCameraState } from "@3dvista-assistant/tour-bridge";
import { projectToScreen } from "./hotspot-projection.js";

// Roughly matches the native 3DVista hotspot icon's own visual size, so the
// heart appears while the visitor is genuinely pointing at the marker, not
// noticeably before or after.
const HOVER_RADIUS_PX = 34;

const HEART_SVG =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M12 20.5s-7.5-4.8-10-9.4C.5 7.8 2.3 4.5 5.6 4c2-.3 3.9.6 5 2.2C11.7 4.6 13.6 3.7 15.6 4c3.3.5 5.1 3.8 3.6 7.1-2.5 4.6-10 9.4-10 9.4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
  "</svg>";

export interface HotspotHeartOverlayDeps {
  wishlist: WishlistState;
  manifest: HotspotManifestEntry[];
}

/**
 * A full-viewport, otherwise-invisible layer that shows exactly one small
 * heart button, positioned live over whichever product hotspot the visitor
 * is currently pointing at (see hotspot-projection.ts for how a hotspot's
 * catalog yaw/pitch becomes a screen position). Independent of the chat
 * widget entirely — reads/writes the same shared WishlistState, but has no
 * other coupling to it. Intentionally NOT a DOM-per-hotspot approach: 3DVista
 * renders hotspots on canvas/WebGL (confirmed live — no DOM element exists
 * per marker to attach a real `mouseenter` to), so this recomputes proximity
 * to the mouse every animation frame instead.
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

  function onMouseMove(e: MouseEvent): void {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }
  window.addEventListener("mousemove", onMouseMove);

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

  let rafId = 0;
  function tick(): void {
    rafId = requestAnimationFrame(tick);

    const media = getActiveMediaName();
    const camera = getCameraState();
    if (!media || !camera) {
      heartBtn.classList.remove("tva-hotspot-heart--visible");
      current = null;
      return;
    }

    let best: { product: HotspotManifestEntry; dist: number; x: number; y: number } | null = null;
    for (const p of deps.manifest) {
      if (p.media_name !== media) continue;
      const pt = projectToScreen(camera, p, window.innerWidth, window.innerHeight);
      if (!pt || !pt.visible) continue;
      const dist = Math.hypot(pt.x - mouseX, pt.y - mouseY);
      if (dist <= HOVER_RADIUS_PX && (!best || dist < best.dist)) {
        best = { product: p, dist, x: pt.x, y: pt.y };
      }
    }

    if (best) {
      current = best.product;
      heartBtn.classList.add("tva-hotspot-heart--visible");
      // Offset up-and-right from the hotspot's own center so it reads as a
      // companion badge on the native marker rather than replacing it.
      heartBtn.style.transform = `translate(${best.x + 10}px, ${best.y - 40}px)`;
      syncSavedVisual();
    } else {
      heartBtn.classList.remove("tva-hotspot-heart--visible");
      current = null;
    }
  }
  rafId = requestAnimationFrame(tick);

  return {
    element: layer,
    destroy(): void {
      cancelAnimationFrame(rafId);
      window.removeEventListener("mousemove", onMouseMove);
    },
  };
}
