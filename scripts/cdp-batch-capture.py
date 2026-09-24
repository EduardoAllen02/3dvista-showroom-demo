#!/usr/bin/env python3
"""
Batch camera capture for the 2026-09-13 live data-correction session.
Walks every active product in clients/febal-casa/catalog.json, points the
REAL Chrome window (opened via the CDP skill's browser_server.py) at that
product's stored media_name/yaw/pitch, widens fov to a safer default (the
build pipeline has always hardcoded fov:70 regardless of what a shot
actually needs — today's own manually-driven captures all landed in the
100-130 range), screenshots it, and logs what was used.

Navigation replicates packages/tour-bridge/src/player-api-navigator.ts's
hard-won sequence EXACTLY (see that file's 4 documented correction rounds)
— writing the target panorama's own PanoramaCamera.initialPosition before
switching, then re-applying yaw/pitch/hfov directly on the active player on
a staggered schedule after switching, because this exact tour build resets
the camera to a native default not once but twice after activation. Skipping
any of this reproduces the "camera snaps back" bug that code was built to
fix — confirmed the hard way in that file's own commit history, not
theorized here.

Usage: python scripts/cdp-batch-capture.py
Writes screenshots + manifest.json into the output dir below.
"""
import sys
import os
import re
import ctypes
import time
import json
from collections import OrderedDict

sys.path.insert(0, r"C:\Users\Yeyian PC\Documents\VSCodeProjects\openghost-workspace\skills\browser")
from browser_server import evaluate, screenshot  # noqa: E402

CATALOG_PATH = r"C:\Users\Yeyian PC\Documents\VSCodeProjects\3dvista-assistant\clients\febal-casa\catalog.json"
OUT_DIR = r"C:\Users\Yeyian PC\Downloads\febal-casa-capturas"
MANIFEST_PATH = os.path.join(OUT_DIR, "manifest.json")
CHROME_WINDOW_TITLE = "Febal Casa - Google Chrome"

# CONFIRMED LIVE (2026-09-13 smoke test): this tour's panorama switch is
# gated on requestAnimationFrame, which Chromium throttles/suspends whenever
# document.visibilityState isn't "visible" — e.g. another window (WhatsApp,
# in this session) occluding this one. CDP's own Page.bringToFront was NOT
# enough to clear that state; only a real OS-level SetForegroundWindow did.
# Symptom when this silently regresses: playlist.selectedIndex/media label
# updates correctly (proving the navigation call itself worked) but the
# screenshot still shows the previous panorama — a data/render desync, not
# a navigation bug. Checked before every shot below because it's cheap and
# the failure is otherwise invisible until a human reviews the images.


def force_foreground() -> None:
    hwnd = ctypes.windll.user32.FindWindowW(None, CHROME_WINDOW_TITLE)
    if hwnd:
        ctypes.windll.user32.ShowWindow(hwnd, 9)  # SW_RESTORE
        ctypes.windll.user32.SetForegroundWindow(hwnd)


def ensure_visible() -> None:
    state = evaluate("({ v: document.visibilityState })")
    if not isinstance(state, dict) or state.get("v") != "visible":
        force_foreground()
        time.sleep(0.5)

CROSS_PANORAMA_SETTLE_S = 3.4  # covers the 600/1200/2000/3000ms rewrite schedule below
SAME_PANORAMA_SETTLE_S = 0.4

NAV_JS_TEMPLATE = r"""
(() => {
  const registry = window.tour && window.tour.player;
  if (!registry) return { error: "no registry" };
  const rootPlayer = registry.getById("rootPlayer");
  const playlist = registry.getById("mainPlayList");
  const items = playlist.get("items");
  const item = items.find((c) => {
    const media = c.get("media");
    const data = media && media.get("data");
    return data && data.label === "__MEDIA_NAME__";
  });
  if (!item) return { error: "media not found: __MEDIA_NAME__" };

  const camera = item.get("camera");
  const initialPosition = camera && camera.get("initialPosition");
  if (initialPosition && initialPosition.set) {
    initialPosition.set("yaw", __YAW__);
    initialPosition.set("pitch", __PITCH__);
    initialPosition.set("hfov", __FOV__);
  }

  const currentIndex = playlist.get("selectedIndex");
  const currentItem = items[currentIndex];
  const currentMedia = currentItem && currentItem.get("media");
  const currentLabel = currentMedia && currentMedia.get("data") && currentMedia.get("data").label;
  const sameMedia = currentLabel === "__MEDIA_NAME__";

  function rewrite() {
    const viewer = rootPlayer.getMainViewer();
    const activePlayer = rootPlayer.getActivePlayerWithViewer(viewer);
    if (activePlayer && activePlayer.set) {
      activePlayer.set("yaw", __YAW__);
      activePlayer.set("pitch", __PITCH__);
      activePlayer.set("hfov", __FOV__);
    }
  }

  if (sameMedia) {
    rewrite();
  } else {
    rootPlayer.setMainMediaByName("__MEDIA_NAME__");
    for (const delay of [600, 1200, 2000, 3000]) {
      setTimeout(rewrite, delay);
    }
  }
  return { sameMedia, ok: true };
})()
"""


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def nav_and_set(media_name: str, yaw: float, pitch: float, fov: float) -> dict:
    script = (
        NAV_JS_TEMPLATE.replace("__MEDIA_NAME__", media_name.replace('"', '\\"'))
        .replace("__YAW__", repr(float(yaw)))
        .replace("__PITCH__", repr(float(pitch)))
        .replace("__FOV__", repr(float(fov)))
    )
    return evaluate(script)


def log(msg: str) -> None:
    print(msg, flush=True)


def save_manifest(manifest: list) -> None:
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    force_foreground()
    time.sleep(0.5)
    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        catalog = json.load(f)

    products = [p for p in catalog if p.get("active") and p.get("media_name")]

    groups: "OrderedDict[str, list]" = OrderedDict()
    for p in products:
        groups.setdefault(p["media_name"], []).append(p)

    # Resume support: an earlier run may have crashed partway through (a
    # single bad product shouldn't cost the screenshots already taken for
    # everything before it). Keep whatever manifest entries already exist
    # and skip re-shooting any product whose screenshot file is present.
    manifest = []
    done_ids = set()
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        done_ids = {e["product_id"] for e in manifest}
    for p in products:
        fname = f"{p['product_id']}_{slugify(p['name'])}.png"
        if p["product_id"] not in done_ids and os.path.exists(os.path.join(OUT_DIR, fname)):
            done_ids.add(p["product_id"])

    total = len(products)
    done = len(done_ids)
    errors = []
    if done:
        log(f"Resuming: {done}/{total} ya capturados, se salteran.")

    for media_name, members in groups.items():
        for p in members:
            if p["product_id"] in done_ids:
                continue
            try:
                yaw = p.get("yaw") or 0
                pitch = p.get("pitch") or 0
                stored_fov = p.get("fov") or 70
                fov = min(max(stored_fov, 100), 120)

                result = nav_and_set(media_name, yaw, pitch, fov)
                same = isinstance(result, dict) and result.get("sameMedia")
                time.sleep(SAME_PANORAMA_SETTLE_S if same else CROSS_PANORAMA_SETTLE_S)
                ensure_visible()

                fname = f"{p['product_id']}_{slugify(p['name'])}.png"
                out_path = os.path.join(OUT_DIR, fname)
                screenshot(out_path)

                entry = {
                    "product_id": p["product_id"],
                    "name": p["name"],
                    "section": p.get("section"),
                    "media_name": media_name,
                    "yaw": yaw,
                    "pitch": pitch,
                    "fov": fov,
                    "screenshot": fname,
                    "nav_result": result,
                }
                manifest.append(entry)
                done_ids.add(p["product_id"])
                done += 1
                save_manifest(manifest)  # after every item — a crash must not lose prior progress
                log(f"[{done}/{total}] {p['product_id']} {p['name']} ({media_name}) -> {fname}")
            except Exception as exc:  # noqa: BLE001 — one bad product must not abort the other 90+
                errors.append({"product_id": p.get("product_id"), "name": p.get("name"), "error": repr(exc)})
                log(f"[ERROR] {p.get('product_id')} {p.get('name')}: {exc!r}")

    save_manifest(manifest)
    log(f"\nDONE: {len(manifest)}/{total} capturas guardadas en {OUT_DIR}")
    if errors:
        log(f"{len(errors)} producto(s) fallaron: {[e['product_id'] for e in errors]}")
        with open(os.path.join(OUT_DIR, "errors.json"), "w", encoding="utf-8") as f:
            json.dump(errors, f, indent=2, ensure_ascii=False)
    log(f"Manifest: {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
