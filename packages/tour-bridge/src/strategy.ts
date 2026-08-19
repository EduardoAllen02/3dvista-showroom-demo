import { hashNavigator } from "./hash-navigator.js";
import { playerApiNavigator } from "./player-api-navigator.js";
import type { NavTarget, TourBridgeStrategy } from "./types.js";

export type PreferredStrategy = "hash" | "player-api";

/**
 * Creates the navigation bridge to use at runtime. Default is "player-api",
 * per Fase 0's live findings (FASE0-FINDINGS.md) — corrected after a real
 * user report that navigation wasn't visibly moving the camera. hash's
 * yaw/pitch/fov params were re-tested and confirmed silently ignored by this
 * 3DVista version (only the media switch takes effect); player-api's
 * activePlayer.set('yaw'/'pitch'/'hfov', n) sequence is the only mechanism
 * confirmed to actually reorient the camera. hash is kept as a media-only
 * fallback.
 */
export function createTourBridge(preferred: PreferredStrategy = "player-api"): TourBridgeStrategy {
  const primary = preferred === "player-api" ? playerApiNavigator : hashNavigator;
  const fallback = preferred === "player-api" ? hashNavigator : playerApiNavigator;

  return {
    name: primary.name,
    isAvailable(): boolean {
      return primary.isAvailable() || fallback.isAvailable();
    },
    navigateTo(target: NavTarget): void {
      if (primary.isAvailable()) {
        primary.navigateTo(target);
        return;
      }
      if (fallback.isAvailable()) {
        fallback.navigateTo(target);
        return;
      }
      throw new Error("createTourBridge: no navigation strategy is available.");
    },
  };
}
