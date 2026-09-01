import type { TdvObject, TdvRootPlayer } from "./types.js";

export interface CameraState {
  yaw: number;
  pitch: number;
  hfov: number;
}

const MAIN_PLAYLIST_ID = "mainPlayList";

/**
 * Read-only counterpart to player-api-navigator.ts's write path — same
 * object traversal, but only ever reads. Used by the wishlist layer's
 * hotspot overlay to know which panorama is active (so it knows which
 * products to project) and where the camera is currently looking (so it
 * can project their yaw/pitch to screen pixels). Never used for navigation.
 */
export function getActiveMediaName(): string | null {
  const registry = window.tour?.player;
  if (!registry) return null;
  const playlist = registry.getById(MAIN_PLAYLIST_ID);
  if (!playlist) return null;
  const items = playlist.get("items") as TdvObject[] | undefined;
  const index = playlist.get("selectedIndex") as number | undefined;
  if (!items || index == null) return null;
  const item = items[index];
  const media = item?.get("media") as TdvObject | undefined;
  const data = media?.get("data") as { label?: string } | undefined;
  return data?.label ?? null;
}

/**
 * The camera math this feeds (see assistant-ui's hotspot-projection.ts) was
 * verified live against the tour's OWN rendered hotspot markers before
 * being trusted: a point computed from a known product's yaw/pitch landed
 * exactly on top of that product's real "F" hotspot icon on screen. Reading
 * `activePlayer.get('yaw'/'pitch'/'hfov')` mirrors exactly what
 * player-api-navigator.ts's "already on this panorama" branch writes to,
 * confirming this is the same live camera state the engine itself renders
 * from — not a separate/stale copy.
 */
export function getCameraState(): CameraState | null {
  const registry = window.tour?.player;
  if (!registry) return null;
  const rootPlayer = registry.getById<TdvRootPlayer>("rootPlayer");
  if (!rootPlayer) return null;
  const viewer = rootPlayer.getMainViewer();
  const activePlayer = rootPlayer.getActivePlayerWithViewer(viewer);
  const yaw = activePlayer.get("yaw") as number | undefined;
  const pitch = activePlayer.get("pitch") as number | undefined;
  const hfov = activePlayer.get("hfov") as number | undefined;
  if (yaw == null || pitch == null || hfov == null) return null;
  return { yaw, pitch, hfov };
}
