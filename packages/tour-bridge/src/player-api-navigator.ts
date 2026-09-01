import type { NavTarget, TdvObject, TdvRootPlayer, TourBridgeStrategy } from "./types.js";
import { openProductPanel } from "./product-panel.js";

const MAIN_PLAYLIST_ID = "mainPlayList";

/**
 * Navigates by writing the target camera orientation to the PANORAMA'S OWN
 * `PanoramaCamera.initialPosition` (yaw/pitch/hfov) BEFORE triggering the
 * media switch, then calling rootPlayer.setMainMediaByName(...).
 *
 * This replaces an earlier, INCORRECT approach (kept in git history, not
 * here) that set yaw/pitch/hfov on `rootPlayer.getActivePlayerWithViewer(...)`
 * *after* switching media. That looked correct when read back immediately
 * (`.get()` echoed the `.set()` value) and even survived a same-tick
 * before/after check — but a real user testing the live app found the
 * camera always snapped back to the panorama's default (yaw 0, pitch 0)
 * within about a second. Root cause, confirmed live via CDP (see
 * FASE0-FINDINGS.md "Bug crítico... autoplay" section and the follow-up
 * investigation after it): `getActivePlayerWithViewer` returns a
 * transitional player object. Once 3DVista's own panorama-activation logic
 * finishes, it resets the camera to that panorama's `PanoramaCamera`
 * object's `initialPosition` — which is what a manually-placed native
 * hotspot's "Abrir Panorama" action implicitly relies on, and what actually
 * drives the rendered view. Writing yaw/pitch/hfov there directly, before
 * the switch, was confirmed stable (zero drift after 6s) both via a raw
 * property check and via the real "Llévame" button click path.
 *
 * The PanoramaCamera object for a given media is found via the playlist
 * item's own `camera` reference (mirrors how the engine's own
 * `setMainMediaByName` locates the matching item by `media.data.label`,
 * see FASE0-FINDINGS.md) — not by guessing a GUID naming convention.
 *
 * SECOND correction, found right after the first fix shipped: the above is
 * only sufficient when the target panorama is DIFFERENT from the one
 * currently active — `setMainMediaByName` triggers 3DVista's activation
 * sequence (which reads `initialPosition`) only on an actual selectedIndex
 * change. If the requested product is on the SAME panorama the visitor is
 * already viewing, `setMainMediaByName` is a no-op (selectedIndex doesn't
 * change), so `initialPosition` is never re-read and the camera doesn't
 * move. Confirmed live: navigating to a same-panorama product right after a
 * fresh page load (still on the tour's first panorama) silently failed to
 * move the camera even though `initialPosition` was written correctly.
 * Fix: when already on the target panorama, ALSO set yaw/pitch/hfov
 * directly on the live active player — safe in this specific case because
 * no activation/transition is happening that would later reset it (that
 * reset only happens as part of an actual panorama activation).
 *
 * THIRD correction, found while wiring up a second tour (`showroom-real`,
 * real high-resolution showroom photos vs. the first tour's lighter demo
 * frames): on a CROSS-panorama navigation, this project's 3DVista build did
 * NOT apply `PanoramaCamera.initialPosition` to the newly-active player at
 * all — confirmed live over 12s of continuous polling, camera stayed at
 * yaw:0/pitch:0 (defaults) the whole time, even though `initialPosition`
 * itself read back correctly written. Yet a *direct* write to
 * `getActivePlayerWithViewer(...)` issued a few seconds AFTER the panorama
 * had already finished activating stuck perfectly (stable 10s+, no reset).
 * This is the opposite failure mode from the SECOND correction above (that
 * project reset a transitional write; this one never applies
 * `initialPosition` in the first place) — the common fix for both is the
 * same underlying rule: never write to the transitional active-player
 * object *synchronously in the same tick* as `setMainMediaByName` (that
 * object gets discarded/reset when activation completes), but a write
 * *after* activation has settled is safe in both projects. So on every
 * cross-panorama navigation, in addition to the pre-switch
 * `initialPosition` write, also schedule a short delayed direct write to
 * the (by-then-settled) active player as a fallback — cheap, and covers
 * whichever of the two failure modes a given 3DVista build/version exhibits
 * without needing to detect which one is active. (Originally a single fixed
 * 600ms delay here — superseded by the staggered schedule below.)
 */

/**
 * FOURTH correction, found on the Febal Casa real-client tour (real
 * photographic panoramas, heavier tiles than the demo/showroom-real
 * projects): a SINGLE delayed rewrite at 600ms is not always enough. Traced
 * live via instrumented `set()` calls (wrapping the active-player class's
 * prototype `set`, see tour-project/febal-casa notes) on a real cross-
 * panorama navigation:
 *   t+0ms    setMainMediaByName("11")
 *   t+36ms   engine applies the panorama's own native default pose
 *            (yaw 93 / pitch -0.36 / hfov 110 — a REAL authored default,
 *            unlike the demo tours' uniform 0/0/90)
 *   t+645ms  our POST_ACTIVATION_REWRITE_DELAY_MS rewrite lands correctly
 *   t+962ms  the engine resets to its native default a SECOND time —
 *            overwriting our correct value right back to the wrong one
 * The second reset's timing is presumably tied to a later tile/loading
 * milestone on heavier real panoramas, not a fixed delay — a single rewrite
 * anywhere before it is fragile. Fix: reapply on a short staggered schedule
 * instead of once, so at least one rewrite always lands after whichever
 * native reset the engine fires last. Bounded and finite — this is not the
 * same thing as the continuous per-frame "Reproducir en bucle" autoplay
 * bug (see FASE0-FINDINGS.md); these are one-off activation-time resets
 * that stop on their own once the panorama has finished settling.
 */
const POST_ACTIVATION_REWRITE_SCHEDULE_MS = [600, 1200, 2000, 3000];

// Guards the staggered rewrites above against a stale navigation: if the
// visitor asks for a second product while the first one's rewrites are
// still pending, only the LATEST call's scheduled writes should still be
// allowed to fire — otherwise an old timeout could land after the new
// navigation and yank the camera back to the wrong place.
let navigationGeneration = 0;

export const playerApiNavigator: TourBridgeStrategy = {
  name: "player-api",
  isAvailable(): boolean {
    return typeof window !== "undefined" && typeof window.tour?.player?.getById === "function";
  },
  navigateTo(target: NavTarget): void {
    const thisGeneration = ++navigationGeneration;
    const registry = window.tour?.player;
    if (!registry) {
      throw new Error("player-api-navigator: window.tour.player not available.");
    }

    const rootPlayer = registry.getById<TdvRootPlayer>("rootPlayer");
    if (!rootPlayer) {
      throw new Error("player-api-navigator: window.tour.player.getById('rootPlayer') not available.");
    }

    const playlist = registry.getById(MAIN_PLAYLIST_ID);
    if (!playlist) {
      throw new Error(`player-api-navigator: playlist '${MAIN_PLAYLIST_ID}' not found.`);
    }

    const items = playlist.get("items") as TdvObject[] | undefined;
    const item = items?.find((candidate) => {
      const media = candidate.get("media") as TdvObject | undefined;
      const data = media?.get("data") as { label?: string } | undefined;
      return data?.label === target.media_name;
    });
    if (!item) {
      throw new Error(`player-api-navigator: no playlist item found with media label '${target.media_name}'.`);
    }

    const camera = item.get("camera") as TdvObject | undefined;
    const initialPosition = camera?.get("initialPosition") as TdvObject | undefined;
    if (!initialPosition?.set) {
      throw new Error(`player-api-navigator: '${target.media_name}' has no settable camera.initialPosition.`);
    }
    initialPosition.set("yaw", target.yaw);
    initialPosition.set("pitch", target.pitch);
    initialPosition.set("hfov", target.fov);

    const currentIndex = playlist.get("selectedIndex") as number;
    const currentItem = items?.[currentIndex];
    const currentMedia = currentItem?.get("media") as TdvObject | undefined;
    const currentLabel = (currentMedia?.get("data") as { label?: string } | undefined)?.label;

    if (currentLabel === target.media_name) {
      // Already on this panorama — setMainMediaByName would no-op, so the
      // initialPosition write above would never get re-read. Nudge the live
      // camera directly instead; safe here since no activation/transition
      // is about to run that would reset it afterward.
      const viewer = rootPlayer.getMainViewer();
      const activePlayer = rootPlayer.getActivePlayerWithViewer(viewer);
      activePlayer.set?.("yaw", target.yaw);
      activePlayer.set?.("pitch", target.pitch);
      activePlayer.set?.("hfov", target.fov);
    } else {
      rootPlayer.setMainMediaByName(target.media_name);
      // Fallback for 3DVista builds that don't apply initialPosition to the
      // newly-active panorama on activation (see THIRD correction above), OR
      // that reset it back to the native default a second time on a later
      // loading milestone (see FOURTH correction above) — re-apply on a
      // short staggered schedule so at least one rewrite always lands last.
      for (const delay of POST_ACTIVATION_REWRITE_SCHEDULE_MS) {
        setTimeout(() => {
          if (thisGeneration !== navigationGeneration) return; // superseded by a newer navigateTo() call
          const viewer = rootPlayer.getMainViewer();
          const activePlayer = rootPlayer.getActivePlayerWithViewer(viewer);
          activePlayer.set?.("yaw", target.yaw);
          activePlayer.set?.("pitch", target.pitch);
          activePlayer.set?.("hfov", target.fov);
        }, delay);
      }
    }
  },
  openProductPanel,
};
