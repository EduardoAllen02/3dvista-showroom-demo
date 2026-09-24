#!/usr/bin/env python3
"""
Live producto-por-producto capture helper (2026-09-13 session, Edd driving
the camera in a real Chrome window opened via the CDP skill's
browser_server.py). For whatever panorama/framing Edd has positioned:

1. Reads the live camera state (media_name/yaw/pitch/fov) via the same
   window.tour.player traversal already trusted by
   packages/tour-bridge/src/camera-reader.ts.
2. Enumerates this panorama's own authored hotspot markers (the
   "<prefix> hotspot" overlays product-panel.ts already reverse-engineered)
   and picks whichever one sits angularly closest to the camera center —
   i.e. whatever Edd centered the shot on.
3. Reveals that hotspot's native name tooltip (setting its paired
   "<prefix> dugme" overlay's `enabled` flag, same mechanism
   product-panel.ts uses) and screenshots it, so the product's REAL name
   (as authored in the tour) can be confirmed by reading the image — the
   tooltip renders via canvas, not real DOM text, so it can't be read
   programmatically; a screenshot is the only way to recover it.
4. Resets the tooltip flag back off, leaving the tour clean for the next
   capture.

Usage: python scripts/cdp-capture-product.py <output-screenshot-path>
Prints the captured JSON (media_name, camera, hotspot candidates, best
match) to stdout; Claude reads the screenshot separately to confirm the
name before writing anything to the catalog.
"""
import sys
import time
import json

sys.path.insert(0, r"C:\Users\Yeyian PC\Documents\VSCodeProjects\openghost-workspace\skills\browser")
from browser_server import evaluate, screenshot  # noqa: E402

CAPTURE_JS = r"""
(() => {
  const registry = window.tour && window.tour.player;
  if (!registry) return { error: "no registry" };

  const playlist = registry.getById("mainPlayList");
  const items = playlist && playlist.get("items");
  const index = playlist && playlist.get("selectedIndex");
  const item = items && items[index];
  const media = item && item.get("media");
  const data = media && media.get("data");
  const media_name = (data && data.label) || null;

  const rootPlayer = registry.getById("rootPlayer");
  const viewer = rootPlayer && rootPlayer.getMainViewer();
  const activePlayer = rootPlayer && rootPlayer.getActivePlayerWithViewer(viewer);
  const camYaw = activePlayer && activePlayer.get("yaw");
  const camPitch = activePlayer && activePlayer.get("pitch");
  const camFov = activePlayer && activePlayer.get("hfov");

  const overlays = (media && media.get("overlays")) || [];
  const HOTSPOT_SUFFIX = " hotspot";

  function normalizePrefix(p) { return p.trim().toLowerCase().replace(/^b/, ""); }
  function angDiff(a, b) { return Math.abs((((a - b + 180) % 360) + 360) % 360 - 180); }

  const hotspots = [];
  for (const o of overlays) {
    const d = o.get("data");
    const label = d && d.label;
    if (typeof label === "string" && label.endsWith(HOTSPOT_SUFFIX)) {
      const prefixRaw = label.slice(0, -HOTSPOT_SUFFIX.length);
      const imgs = o.get("items");
      const image = imgs && imgs[0];
      const yaw = image && image.get("yaw");
      const pitch = image && image.get("pitch");
      if (typeof yaw === "number" && typeof pitch === "number") {
        hotspots.push({ prefix: normalizePrefix(prefixRaw), rawLabel: prefixRaw, yaw, pitch });
      }
    }
  }

  let best = null;
  if (typeof camYaw === "number" && typeof camPitch === "number") {
    for (const h of hotspots) {
      const dist = Math.sqrt(angDiff(h.yaw, camYaw) ** 2 + (h.pitch - camPitch) ** 2);
      if (!best || dist < best.dist) best = { ...h, dist };
    }
  }

  return {
    media_name,
    camera: { yaw: camYaw, pitch: camPitch, fov: camFov },
    hotspot_count: hotspots.length,
    all_hotspots: hotspots,
    best_match: best,
  };
})()
"""


def _set_dugme_enabled(prefix: str, enabled: bool) -> None:
    script = f"""
    (() => {{
      const registry = window.tour && window.tour.player;
      const playlist = registry.getById("mainPlayList");
      const item = playlist.get("items")[playlist.get("selectedIndex")];
      const overlays = item.get("media").get("overlays") || [];
      function normalizePrefix(p) {{ return p.trim().toLowerCase().replace(/^b/, ""); }}
      let found = false;
      for (const o of overlays) {{
        const d = o.get("data");
        const label = d && d.label;
        if (typeof label === "string" && label.endsWith(" dugme") && normalizePrefix(label.slice(0, -6)) === "{prefix}") {{
          o.set("enabled", {str(enabled).lower()});
          found = true;
        }}
      }}
      return found;
    }})()
    """
    evaluate(script)


def capture_and_identify(out_path: str) -> dict:
    state = evaluate(CAPTURE_JS)
    best = state.get("best_match") if isinstance(state, dict) else None
    if best:
        _set_dugme_enabled(best["prefix"], True)
        time.sleep(0.8)
        screenshot(out_path)
        _set_dugme_enabled(best["prefix"], False)
    else:
        screenshot(out_path)
    return state


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "capture.png"
    result = capture_and_identify(out)
    print(json.dumps(result, indent=2))
