export interface NavTarget {
  media_name: string;
  yaw: number;
  pitch: number;
  fov: number;
  hotspot_name: string | null;
}

/**
 * Everything the widget (chat, wishlist, mood board) needs from a 360° viewer. 3DVista is
 * one implementation (createTourBridge); another platform passes its own object to init().
 * Only navigateTo is required: without getViewer the assistant just can't resolve "this one",
 * without hotspots there are no hearts over the tour's own markers.
 */
export interface TourBridgeStrategy {
  readonly name: string;
  isAvailable(): boolean;
  navigateTo(target: NavTarget): Promise<void> | void;
  /**
   * Opens the SAME info panel a real click on this product's native tour
   * hotspot would — see product-panel.ts for how this is derived (no-op,
   * not a required method, when a strategy has no way to do this, e.g. the
   * hash-based fallback).
   */
  openProductPanel?(target: NavTarget): void;
  /** Current panorama and camera, read-only ("¿y este?", projecting points on screen). */
  getViewer?(): ViewerState | null;
  /** The viewer's own product hotspots, when it has them. */
  hotspots?: HotspotSignals;
  /** The language the visitor chose in the viewer itself ("it-IT", "en-US"), when it has one. */
  getLocale?(): string | null;
  /** Per-tour edits to the viewer's own skin; false while the viewer isn't ready (retry later). */
  applySkinTweaks?(tweaks: SkinTweaks): boolean;
}

/**
 * Edits to the viewer's own skin, configured per tour. Keys are component ids or editor names
 * (3DVista: "broj-panorame"); raise = pixels to add to the component's distance from the bottom.
 */
export interface SkinTweaks {
  hide?: string[];
  raise?: Record<string, number>;
}

/** The same contract under the name the platform integration uses. */
export type ViewerBridge = TourBridgeStrategy;

export interface ViewerState {
  media_name: string | null;
  yaw: number;
  pitch: number;
  hfov: number;
}

/** Product hotspots drawn by the viewer itself, identified by a platform-specific key. */
export interface HotspotSignals {
  /** Key of the product hotspot under the pointer right now. */
  hovered(): string | null;
  /** Where that hotspot sits in the panorama. */
  anchor(key: string): { yaw: number; pitch: number } | null;
  /** The viewer's own product panel: open or not, for which hotspot (null when unknown), and the
   * page it shows (null when unknown). */
  openPanel(): { open: boolean; key: string | null; url?: string | null };
  /** The key a catalog entry's hotspot_name corresponds to. */
  keyOf(hotspotName: string): string | null;
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
  /** Active panorama player only: moves AND repaints the view (set("yaw"…) only updates properties). */
  setPosition?(yaw: number, pitch: number, roll: number, hfov: number): unknown;
}

export interface TdvPlayerRegistry {
  getById<T = TdvObject>(id: string): T | undefined;
  getByClassName?(cls: string): TdvObject[];
}

declare global {
  interface Window {
    tour?: {
      player?: TdvPlayerRegistry;
      locManager?: { currentLocaleID?: string };
    };
  }
}
