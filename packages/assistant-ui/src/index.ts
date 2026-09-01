import { WishlistState, createApiClient, getOrCreateSessionId, loadCatalogManifest, type HotspotManifestEntry } from "@3dvista-assistant/assistant-core";
import { createTourBridge } from "@3dvista-assistant/tour-bridge";
import type { AssistantConfig } from "./types.js";
import { applyTheme } from "./theme.js";
import { createLauncher } from "./launcher.js";
import { createChatCard } from "./chat-card.js";
import { createWishlistLayer } from "./wishlist-layer.js";

export type { AssistantConfig, AssistantTheme } from "./types.js";

const MOUNT_ID = "tva-mount-root";
const MOBILE_BREAKPOINT_PX = 480;

/**
 * Whether we're on a phone-sized device — deliberately NOT a CSS
 * `@media (max-width)` check. 3DVista's own runtime rewrites the page's
 * `<meta name=viewport>` to `initial-scale=0.5` on load (confirmed live:
 * `data-tdv-general-scale="0.5"` in the exported index.htm), which doubles
 * the CSS layout viewport (`window.innerWidth` reports ~750 on a 375px-wide
 * phone) — so a `max-width: 480px` media query never matches inside the
 * tour, even though the physical screen genuinely is a phone. `screen.width`
 * reflects the OS-reported physical screen and is unaffected by that
 * rewrite, so it's the reliable signal here. Mirrored in assistant.css as
 * the `[data-tva-mobile="true"]` attribute selector — the plain media query
 * is kept alongside it as a fallback for hosts that don't mangle the
 * viewport meta tag.
 */
function isMobileDevice(): boolean {
  // Some headless/embedded browser contexts intermittently report 0 for
  // ONE of the two screen dimensions (observed live while testing this)
  // — treat a 0 reading as "unknown" (mapped to Infinity, so it never wins
  // the min()) rather than letting it force a false "tiny screen" result.
  // Only if BOTH are unknown do we fall back to desktop, since forcing a
  // disruptive full-screen mobile layout on an unrecognized host is worse
  // than just keeping the normal floating-card layout.
  const w = window.screen.width || Infinity;
  const h = window.screen.height || Infinity;
  const shortSide = Math.min(w, h);
  return Number.isFinite(shortSide) && shortSide <= MOBILE_BREAKPOINT_PX;
}

/**
 * A CSS length, assigned to `--tva-mobile-unit`, such that
 * `calc(64 * var(--tva-mobile-unit))` renders at 64 PHYSICAL px regardless
 * of how wide the CSS layout viewport is — needed because 3DVista's own
 * runtime rewrites the page's viewport meta to `initial-scale=0.5` on
 * load, doubling `window.innerWidth` relative to the physical screen, so
 * any `px` value renders at half its intended size unless compensated
 * (this, not a missing mobile breakpoint, is why text/icons looked
 * "extremely small" on an actual phone even after the mobile layout was
 * correctly detected).
 *
 * EARLIER VERSION of this (kept in git history) computed a plain NUMBER
 * multiplier from `innerWidth / screen.width`, read once (plus a few
 * delayed re-checks) and cached in `--tva-zoom-compensation`. That was
 * fragile: 3DVista's viewport rewrite happens asynchronously after this
 * script runs, on a timeline that isn't fully predictable, so the cached
 * ratio could go stale relative to the CURRENT `innerWidth` — confirmed
 * live via CDP: forcing a compensation number that didn't match the
 * live viewport produced a badly broken header (flex items overflowing
 * the card, one measured 282px tall instead of ~68px).
 *
 * This version has no such staleness window, by construction: `vw` is a
 * LIVE CSS unit the engine recomputes on every layout pass from whatever
 * `innerWidth` currently is — there's nothing here for JS to cache or for
 * a rewrite's timing to invalidate. `screen.width` (the one JS reads,
 * once) is the physical screen size, which doesn't change except on
 * rotation (handled below).
 */
function computeMobileUnit(): string {
  const physicalWidth = window.screen.width;
  if (!physicalWidth || !Number.isFinite(physicalWidth) || physicalWidth <= 0) return "1px";
  return `calc(100vw / ${physicalWidth})`;
}

/**
 * Mounts the widget once into document.body. Injected by the tour's skin
 * (via the mechanism confirmed in Fase 0) after the tour has booted — the
 * DOM node this creates is expected to persist across panorama changes
 * (confirmed in Fase 0/1), which is what lets chat state survive navigation.
 */
export function init(config: AssistantConfig): void {
  if (document.getElementById(MOUNT_ID)) return; // idempotent — avoid double-mount

  const root = document.createElement("div");
  root.id = MOUNT_ID;
  root.className = "tva-root";
  root.dataset.assistantPosition = config.theme.position;
  applyTheme(root, config.theme);

  const applyResponsiveState = (): void => {
    const mobile = isMobileDevice();
    root.dataset.tvaMobile = String(mobile);
    root.style.setProperty("--tva-mobile-unit", mobile ? computeMobileUnit() : "1px");
  };
  applyResponsiveState();

  // Shared across BOTH independent layers — the chatbot's own small
  // secondary heart and the wishlist layer's primary UI (toggle/panel/
  // hotspot overlay) all read and write through this ONE store, so saving
  // a product from either surface is reflected everywhere immediately.
  const wishlist = new WishlistState();
  const tourBridge = createTourBridge(config.navStrategy);
  const api = createApiClient({
    apiBaseUrl: config.apiBaseUrl,
    tourId: config.tourId,
    sessionId: getOrCreateSessionId(),
  });

  // Mutable refs so each panel can open the other — resolved after both are
  // created (there's no circular-dependency issue: the closures capture the
  // variable by reference, so they see the final assigned value at call time).
  let openWishlist: () => void = () => {};

  const { element: cardEl, toggleOpen, open: openChat } = createChatCard(config, wishlist, () => openWishlist());
  const launcher = createLauncher(toggleOpen);

  // Populated in place once the manifest fetch resolves (see below) — the
  // hotspot overlay reads this SAME array reference on every animation
  // frame, so mounting the wishlist layer doesn't have to wait on a
  // network round-trip just to show its toggle button/panel.
  const hotspotManifest: HotspotManifestEntry[] = [];
  const { element: wishlistLayerEl, open: _openWishlist } = createWishlistLayer({
    wishlist,
    tourBridge,
    manifest: hotspotManifest,
    assistantName: config.assistantName,
    fetchRecommendations: (productIds) => api.getRecommendations(productIds),
    onOpenChat: () => openChat(),
  });
  openWishlist = _openWishlist;
  loadCatalogManifest(config.assetsBaseUrl)
    .then((entries) => hotspotManifest.push(...entries))
    .catch(() => {
      // Hotspot-hover hearts simply won't appear this session — the panel
      // and the chat's own heart still work fully off `wishlist` alone.
    });

  root.append(cardEl, launcher, wishlistLayerEl);
  document.body.appendChild(root);

  // `screen.width` only changes on rotation (portrait/landscape swap) —
  // re-derive both the mobile flag and the unit then. No `resize`
  // listener or delayed re-checks needed: `--tva-mobile-unit` is `vw`-based
  // and self-corrects continuously regardless of when/whether 3DVista
  // rewrites the viewport (see computeMobileUnit's doc comment).
  window.addEventListener("orientationchange", applyResponsiveState);
}

export const AssistantWidget = { init };
