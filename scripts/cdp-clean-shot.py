#!/usr/bin/env python3
"""
Manual per-product capture helper (post "no more autonomous scripts"
directive, 2026-09-13+). Edd positions the camera by hand and marks the
product via the assistant's own wishlist heart icon; this script only ever
reads state (wishlist + live camera) and — only when explicitly requested
per product — hides UI chrome and saves ONE clean screenshot. It never
moves the camera itself; positioning stays 100% manual.

Two entry points:
  python scripts/cdp-clean-shot.py state
      -> prints wishlist + camera JSON, touches nothing on screen.
  python scripts/cdp-clean-shot.py shot <output.png>
      -> hides chat widget + all enabled overlays on the current panorama
         (hotspot markers, nav arrows, whatever else the tour authored
         there) + native chrome (menu/logo/footer/nav-dots), found by
         sampling elementFromPoint across percentage-of-viewport points
         rather than hardcoded pixels (this profile's window size already
         changed once this session), screenshots, then restores exactly
         what was hidden so Edd's next wishlist click still works.
"""
import sys
import json
import time

sys.path.insert(0, r"C:\Users\Yeyian PC\Documents\VSCodeProjects\3dvista-assistant\scripts")
from cdp_helpers import evaluate, screenshot  # noqa: E402

STATE_JS = r"""
(() => {
  const wishlistRaw = localStorage.getItem("3dvista-assistant:wishlist");
  let wishlist = [];
  try { wishlist = wishlistRaw ? JSON.parse(wishlistRaw) : []; } catch (e) { wishlist = []; }

  const registry = window.tour && window.tour.player;
  let media_name = null, yaw = null, pitch = null, fov = null;
  if (registry) {
    const playlist = registry.getById("mainPlayList");
    const items = playlist && playlist.get("items");
    const index = playlist && playlist.get("selectedIndex");
    const item = items && items[index];
    const media = item && item.get("media");
    const data = media && media.get("data");
    media_name = (data && data.label) || null;

    const rootPlayer = registry.getById("rootPlayer");
    const viewer = rootPlayer && rootPlayer.getMainViewer();
    const activePlayer = rootPlayer && rootPlayer.getActivePlayerWithViewer(viewer);
    yaw = activePlayer && activePlayer.get("yaw");
    pitch = activePlayer && activePlayer.get("pitch");
    fov = activePlayer && activePlayer.get("hfov");
  }

  return {
    wishlist,
    camera: { media_name, yaw, pitch, fov },
    title: document.title,
    visibilityState: document.visibilityState,
  };
})()
"""

HIDE_JS = r"""
(() => {
  const widget = document.getElementById("tva-mount-root");
  const hadWidget = !!widget;
  if (widget) widget.style.setProperty("display", "none", "important");

  const registry = window.tour && window.tour.player;
  const reEnableIdx = [];
  if (registry) {
    const playlist = registry.getById("mainPlayList");
    const item = playlist.get("items")[playlist.get("selectedIndex")];
    const overlays = (item.get("media").get("overlays")) || [];
    overlays.forEach((o, i) => {
      if (o.get("enabled")) {
        reEnableIdx.push(i);
        o.set("enabled", false);
      }
    });
  }
  window.__cdpReEnableIdx = reEnableIdx;

  const W = window.innerWidth, H = window.innerHeight;
  const viewportArea = W * H;
  const points = [];
  for (let fx = 0.03; fx <= 0.97; fx += 0.02) {
    points.push([fx * W, 10]);
    points.push([fx * W, 20]);
    points.push([fx * W, 32]);
    points.push([fx * W, H - 8]);
    points.push([fx * W, H - 20]);
    points.push([fx * W, H - 34]);
    points.push([fx * W, H - 50]);
  }
  const chromeHidden = [];
  for (const [x, y] of points) {
    const el = document.elementFromPoint(x, y);
    if (!el || el === document.body || el === document.documentElement) continue;
    if (el.closest && el.closest("#tva-mount-root")) continue;
    if (el.dataset && el.dataset.cdpHidden === "1") continue;
    const rect = el.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area > viewportArea * 0.35) continue;
    el.style.setProperty("visibility", "hidden", "important");
    el.dataset.cdpHidden = "1";
    chromeHidden.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), x: Math.round(x), y: Math.round(y) });
  }

  return { hadWidget, overlaysDisabled: reEnableIdx.length, chromeHiddenCount: chromeHidden.length, chromeHidden };
})()
"""

SHOW_JS = r"""
(() => {
  const widget = document.getElementById("tva-mount-root");
  if (widget) widget.style.removeProperty("display");

  const registry = window.tour && window.tour.player;
  let restored = 0;
  if (registry && Array.isArray(window.__cdpReEnableIdx)) {
    const playlist = registry.getById("mainPlayList");
    const item = playlist.get("items")[playlist.get("selectedIndex")];
    const overlays = (item.get("media").get("overlays")) || [];
    window.__cdpReEnableIdx.forEach((i) => {
      if (overlays[i]) { overlays[i].set("enabled", true); restored++; }
    });
  }
  delete window.__cdpReEnableIdx;

  const marked = document.querySelectorAll('[data-cdp-hidden="1"]');
  marked.forEach((el) => { el.style.removeProperty("visibility"); delete el.dataset.cdpHidden; });

  return { overlaysRestored: restored, chromeRestored: marked.length };
})()
"""


def get_state():
    return evaluate(STATE_JS)


def clean_shot(path):
    hide_result = evaluate(HIDE_JS)
    time.sleep(0.35)
    screenshot(path)
    show_result = evaluate(SHOW_JS)
    return {"hide": hide_result, "show": show_result}


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "state"
    if cmd == "state":
        print(json.dumps(get_state(), indent=2, ensure_ascii=False))
    elif cmd == "shot":
        out = sys.argv[2]
        state = get_state()
        capture = clean_shot(out)
        print(json.dumps({"state": state, "capture": capture}, indent=2, ensure_ascii=False))
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)
