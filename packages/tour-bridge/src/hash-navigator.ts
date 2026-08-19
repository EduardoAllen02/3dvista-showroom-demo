import type { NavTarget, TourBridgeStrategy } from "./types.js";

/**
 * Navigates via the URL hash format read from TDV.Tour.Script.updateDeepLink's
 * source: `#media-name=<label>&yaw=<num>&pitch=<num>&fov=<num>`. Note the
 * param is `media-name` (hyphenated), NOT `media` as 3DVista's blog post
 * example suggested — that assumption was wrong for this version.
 *
 * IMPORTANT LIMITATION, confirmed live (see FASE0-FINDINGS.md): only the
 * `media-name` portion of the hash actually takes effect. yaw/pitch/fov are
 * silently ignored by this version's hash handler — confirmed by reading
 * back the active player's live yaw/pitch/hfov after setting the hash (both
 * via `location.hash =` and via a fresh page load with the hash already in
 * the URL) and finding them unchanged from the panorama's default. This is
 * NOT the primary strategy for that reason — see strategy.ts, which defaults
 * to player-api. Kept as a media-only fallback for contexts where reaching
 * into window.tour.player's object graph isn't viable; callers needing
 * accurate camera framing should not rely on this strategy alone.
 *
 * Confirmed: setting the hash does NOT reload the page (window.tour._onHashChange
 * handles it in place), so this is safe to use without tearing down the widget.
 */
export const hashNavigator: TourBridgeStrategy = {
  name: "hash",
  isAvailable(): boolean {
    return typeof window !== "undefined" && typeof window.location !== "undefined";
  },
  navigateTo(target: NavTarget): void {
    const label = encodeURIComponent(target.media_name);
    window.location.hash = `media-name=${label}&yaw=${target.yaw}&pitch=${target.pitch}&fov=${target.fov}`;
  },
};
