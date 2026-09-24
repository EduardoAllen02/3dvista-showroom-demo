#!/usr/bin/env python3
"""
Capture ONE exhibited piece from its verified point of view (docs/chatbot-v2/prompt-sesion-datos.md, Paso 4).

Moves the tour camera with the same API sequence as the widget's "Llévame"
(packages/tour-bridge/src/player-api-navigator.ts; template copied from
scripts/cdp-batch-capture.py): write the target panorama's initialPosition, switch
panorama, re-apply the camera with setPosition on a staggered schedule. No mouse, no
drag. Then re-reads the live camera (±2° yaw/pitch, ±3 fov; one retry; the player
reports what was set, so the real check is the image itself and `identical_to`),
takes a clean shot with the tour UI hidden (scripts/cdp-clean-shot.py) and
appends a manifest line.

One piece per invocation, on purpose: every image is opened and judged by a person
(or Claude) before the next one. No --all, no lists, no loops.

    python scripts/cdp_nav_one.py FEB-048
"""
import ctypes
import datetime as dt
import hashlib
import importlib.util
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))
sys.path.insert(0, HERE)
from cdp_helpers import cdp_request, evaluate, screenshot  # noqa: E402

spec = importlib.util.spec_from_file_location("clean_shot_mod", os.path.join(HERE, "cdp-clean-shot.py"))
clean = importlib.util.module_from_spec(spec)
spec.loader.exec_module(clean)

CATALOG = os.path.join(ROOT, "clients", "febal-casa", "catalog.json")
OUT_DIR = os.path.join(ROOT, "tour-project", "febal-casa", "product-facts", "captures")
MANIFEST = os.path.join(OUT_DIR, "manifest.json")
WINDOW_TITLE = "Febal Casa - Google Chrome"

NAV_JS_TEMPLATE = r"""
(() => {
  const registry = window.tour && window.tour.player;
  if (!registry) return { error: "no registry" };
  const rootPlayer = registry.getById("rootPlayer");
  const playlist = registry.getById("mainPlayList");
  const items = playlist.get("items");
  const item = items.find((c) => { const m = c.get("media"); const d = m && m.get("data"); return d && d.label === "__MEDIA__"; });
  if (!item) return { error: "media not found: __MEDIA__" };
  const camera = item.get("camera");
  const ip = camera && camera.get("initialPosition");
  if (ip && ip.set) { ip.set("yaw", __YAW__); ip.set("pitch", __PITCH__); ip.set("hfov", __FOV__); }
  const cur = items[playlist.get("selectedIndex")];
  const curLabel = cur && cur.get("media") && cur.get("media").get("data") && cur.get("media").get("data").label;
  const same = curLabel === "__MEDIA__";
  function rewrite() {
    // set("yaw"/...) only updates the player's properties; the rendered view stays put
    // (verified live: byte-identical shots). setPosition(yaw, pitch, roll, hfov) repaints.
    const ap = rootPlayer.getActivePlayerWithViewer(rootPlayer.getMainViewer());
    if (ap && ap.setPosition) ap.setPosition(__YAW__, __PITCH__, 0, __FOV__);
    else if (ap && ap.set) { ap.set("yaw", __YAW__); ap.set("pitch", __PITCH__); ap.set("hfov", __FOV__); }
  }
  if (same) rewrite(); else { rootPlayer.setMainMediaByName("__MEDIA__"); for (const d of [600, 1200, 2000, 3000]) setTimeout(rewrite, d); }
  return { ok: true, same };
})()
"""


def foreground():
    user32 = ctypes.windll.user32
    hwnd = user32.FindWindowW(None, WINDOW_TITLE)
    if hwnd:
        user32.ShowWindow(hwnd, 9)
        user32.SetForegroundWindow(hwnd)
    cdp_request("Page.bringToFront")
    state = evaluate("({ v: document.visibilityState })") or {}
    return state.get("v") == "visible"


def nav(p):
    js =(NAV_JS_TEMPLATE.replace("__MEDIA__", str(p["media_name"]).replace('"', '\\"'))
          .replace("__YAW__", repr(float(p["yaw"]))).replace("__PITCH__", repr(float(p["pitch"])))
          .replace("__FOV__", repr(float(p["fov"]))))
    r = evaluate(js) or {}
    time.sleep(0.6 if r.get("same") else 3.6)
    # Same-panorama camera changes don't always repaint the WebGL canvas (seen live: two
    # different cameras produced byte-identical shots). A resize event forces a redraw
    # without touching the mouse.
    evaluate("window.dispatchEvent(new Event('resize')); true")
    time.sleep(0.8)
    return r


def landed(p, st):
    if not st or str(st.get("media_name")) != str(p["media_name"]):
        return False
    dyaw = abs(((float(st["yaw"]) - float(p["yaw"]) + 180) % 360) - 180)
    return dyaw <= 2 and abs(float(st["pitch"]) - float(p["pitch"])) <= 2 and abs(float(st["fov"]) - float(p["fov"])) <= 3


def main():
    if len(sys.argv) != 2 or not sys.argv[1].startswith("FEB-"):
        sys.exit(__doc__)
    pid = sys.argv[1]
    with open(CATALOG, encoding="utf-8") as f:
        p = next((x for x in json.load(f) if x["product_id"] == pid and x.get("active")), None)
    if not p:
        sys.exit(f"{pid}: not an active piece")
    os.makedirs(OUT_DIR, exist_ok=True)
    visible = foreground()
    nav_result = nav(p)
    st = (clean.get_state() or {}).get("camera")
    ok = landed(p, st)
    retried = False
    if not ok:
        retried = True
        foreground()
        nav_result = nav(p)
        st = (clean.get_state() or {}).get("camera")
        ok = landed(p, st)
    path = os.path.join(OUT_DIR, f"{pid}.png")
    ui_path = os.path.join(OUT_DIR, f"{pid}-ui.png")
    screenshot(ui_path)          # with the tour's own hotspot marker: identifies WHICH piece in a busy view
    time.sleep(0.2)
    clean.clean_shot(path)       # without UI: the evidence image for the review sheet
    with open(path, "rb") as f:
        digest = hashlib.sha1(f.read()).hexdigest()[:12]
    entry = {
        "product_id": pid, "name": p["name"], "section": p["section"],
        "target": {"media_name": p["media_name"], "yaw": p["yaw"], "pitch": p["pitch"], "fov": p["fov"]},
        "landed": {k: st.get(k) for k in ("media_name", "yaw", "pitch", "fov")} if st else None,
        "landing_ok": ok, "retried": retried, "window_visible": visible, "sha1": digest,
        "captured_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "file": os.path.relpath(path, ROOT).replace("\\", "/"),
    }
    manifest = []
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as f:
            manifest = [m for m in json.load(f) if m["product_id"] != pid]
    dup = [m["product_id"] for m in manifest if m.get("sha1") == digest]
    entry["identical_to"] = dup
    manifest.append(entry)
    with open(MANIFEST, "w", encoding="utf-8") as f:
        json.dump(sorted(manifest, key=lambda m: m["product_id"]), f, ensure_ascii=False, indent=1)
    print(json.dumps({"product_id": pid, "name": p["name"], "landing_ok": ok, "retried": retried,
                      "visible": visible, "identical_to": dup, "file": entry["file"], "nav": nav_result}, ensure_ascii=False))


if __name__ == "__main__":
    main()
