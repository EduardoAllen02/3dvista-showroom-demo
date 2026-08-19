export interface NavTarget {
  media_name: string;
  yaw: number;
  pitch: number;
  fov: number;
}

export interface TourBridgeStrategy {
  readonly name: "hash" | "player-api";
  isAvailable(): boolean;
  navigateTo(target: NavTarget): Promise<void> | void;
}

/**
 * Minimal shape of the object returned by window.tour.player.getById('rootPlayer')
 * in the exported 3DVista Virtual Tour PRO 2026.1.0 build — confirmed live via
 * console inspection (see tour-project/demo-showroom/FASE0-FINDINGS.md).
 * window.player does NOT exist in this version, despite 3DVista's own docs
 * examples referencing it — window.tour.player is a registry/kernel object;
 * the actual player instance with these methods is reached via .getById('rootPlayer').
 */
export interface TdvRootPlayer {
  setMainMediaByName(name: string): unknown;
  getMainViewer(): TdvObject;
  getActivePlayerWithViewer(viewer: TdvObject): TdvObject;
}

/** Generic TDV "bound object" — every engine object exposes get/set this way. */
export interface TdvObject {
  get(key: string): unknown;
  set?(key: string, value: unknown): unknown;
}

export interface TdvPlayerRegistry {
  getById<T = TdvObject>(id: string): T | undefined;
}

declare global {
  interface Window {
    tour?: {
      player?: TdvPlayerRegistry;
    };
  }
}
