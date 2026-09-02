import type { CameraState } from "@3dvista-assistant/tour-bridge";

export interface ScreenPoint {
  x: number;
  y: number;
  /** False once the point falls far enough outside the viewport to skip rendering. */
  visible: boolean;
}

type Vec3 = [number, number, number];

function dirVec(yawDeg: number, pitchDeg: number): Vec3 {
  const y = (yawDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  return [Math.cos(p) * Math.sin(y), Math.sin(p), Math.cos(p) * Math.cos(y)];
}

function rotY([x, y, z]: Vec3, thetaDeg: number): Vec3 {
  const t = (thetaDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [x * c + z * s, y, -x * s + z * c];
}

function rotX([x, y, z]: Vec3, thetaDeg: number): Vec3 {
  const t = (thetaDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [x, y * c - z * s, y * s + z * c];
}

// A small buffer past the viewport edge so a heart button doesn't pop in/out
// right at the boundary as the visitor pans — it fades out gracefully a bit
// before/after the true edge instead.
const EDGE_MARGIN_PX = 40;

/**
 * Projects a target world direction (yaw, pitch) onto the current viewport,
 * given the tour's live camera orientation (see tour-bridge's
 * getCameraState). Originally built to project a CATALOG-authored yaw/pitch
 * (one recorded camera target per product); now also used with the
 * hotspot's own TRUE per-panorama anchor (see tour-bridge's
 * findHotspotAnchor) — same math either way, this function only cares about
 * a world direction, not where it came from.
 *
 * This is a standard gnomonic/rectilinear panorama projection: rotate the
 * target's world direction vector into camera space (undo yaw around the
 * world Y axis, then undo pitch around the resulting X axis — this order,
 * and these exact signs, were derived by solving for which combination
 * makes a camera's OWN yaw/pitch project back to dead-center, then verified
 * live against the tour itself: a point computed for a known product landed
 * exactly on that product's real rendered hotspot icon, pixel for pixel,
 * confirmed via a CDP screenshot before this was trusted for the real
 * feature). No 3DVista internals (canvas/WebGL overlay objects) are
 * involved — this works entirely from data this project already owns.
 */
export function projectToScreen(
  camera: CameraState,
  target: { yaw: number; pitch: number },
  viewportWidth: number,
  viewportHeight: number
): ScreenPoint | null {
  let v = dirVec(target.yaw, target.pitch);
  v = rotY(v, -camera.yaw);
  v = rotX(v, camera.pitch);
  const [x1, y1, z1] = v;
  if (z1 <= 0.001) return null; // behind the camera entirely

  const hfovRad = (camera.hfov * Math.PI) / 180;
  const focal = viewportWidth / 2 / Math.tan(hfovRad / 2);
  const sx = viewportWidth / 2 + (x1 / z1) * focal;
  const sy = viewportHeight / 2 - (y1 / z1) * focal;
  const visible =
    sx >= -EDGE_MARGIN_PX &&
    sx <= viewportWidth + EDGE_MARGIN_PX &&
    sy >= -EDGE_MARGIN_PX &&
    sy <= viewportHeight + EDGE_MARGIN_PX;
  return { x: sx, y: sy, visible };
}
