"""
Thin wrapper around the CDP skill's browser_server.py that targets the
Febal Casa tab BY URL instead of blindly using tabs[0]. Needed because this
Chrome profile is the user's real daily profile — other tabs (seen live:
"Colombini Group" pages on localhost:8103/8104) can open on their own and
shift tabs[0] away from the tour tab, silently making every evaluate/
screenshot call operate on the wrong page. Keeps the shared skill file
untouched (per its own note: don't fork it, other automations rely on it).
"""
import json
import threading
import time
import urllib.request

import websocket  # same dependency browser_server.py already uses

CDP_PORT = 9222
TARGET_URL_SUBSTR = "localhost:5501"

# "localhost" on this machine carries a fixed ~2s IPv6-then-IPv4 fallback
# delay (confirmed: 127.0.0.1 responds in ~30ms, "localhost" in ~2050ms,
# every single time) — cdp_request() opens a fresh HTTP list call AND a
# fresh websocket per invocation, so that tax hit TWICE per call, ~4s
# overhead on top of actual work. A tight loop of ~20 calls/product across
# 27 products turned into a ~35min hang before this fix. Using 127.0.0.1
# throughout (both the /json list call and the tab's own websocket URL,
# which Chrome always returns as ws://localhost:.../..., rewritten below)
# avoids the delay entirely.
CDP_HOST = "127.0.0.1"


def find_tab(port: int = CDP_PORT, url_substr: str = TARGET_URL_SUBSTR) -> dict:
    with urllib.request.urlopen(f"http://{CDP_HOST}:{port}/json", timeout=5) as r:
        tabs = json.loads(r.read())
    for t in tabs:
        if url_substr in t.get("url", ""):
            return t
    raise RuntimeError(f"No tab found matching {url_substr!r}. Open tabs: {[t.get('url') for t in tabs]}")


def cdp_request(method: str, params: dict | None = None, port: int = CDP_PORT) -> dict:
    tab = find_tab(port)
    ws_url = tab["webSocketDebuggerUrl"].replace("ws://localhost:", f"ws://{CDP_HOST}:")
    payload = {"id": 1, "method": method, "params": params or {}}

    result = {}
    done = threading.Event()

    def on_message(ws, msg):
        data = json.loads(msg)
        if data.get("id") == 1:
            result["data"] = data
            done.set()
            ws.close()

    def on_open(ws):
        ws.send(json.dumps(payload))

    ws = websocket.WebSocketApp(ws_url, on_open=on_open, on_message=on_message)
    t = threading.Thread(target=ws.run_forever, daemon=True)
    t.start()
    done.wait(timeout=15)
    return result.get("data", {})


def evaluate(script: str, port: int = CDP_PORT):
    r = cdp_request("Runtime.evaluate", {"expression": script, "returnByValue": True, "awaitPromise": True}, port=port)
    return r.get("result", {}).get("result", {}).get("value")


def screenshot(path: str, port: int = CDP_PORT) -> str:
    import base64

    r = cdp_request("Page.captureScreenshot", {"format": "png"}, port=port)
    data = r.get("result", {}).get("data", "")
    with open(path, "wb") as f:
        f.write(base64.b64decode(data))
    return path


def click(x: float, y: float, port: int = CDP_PORT) -> None:
    """Genuine CDP-dispatched mouse click — reliable for buttons/menus.
    Not for panorama drag (use drag() below, which sends intermediate
    mousemove steps; a single down/up jump reads as a fast "flick" to the
    pano engine and produces unpredictable inertia)."""
    cdp_request("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y}, port=port)
    cdp_request("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1}, port=port)
    cdp_request("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1}, port=port)


def drag(x1: float, y1: float, x2: float, y2: float, steps: int = 12, port: int = CDP_PORT, step_delay: float = 0.03) -> None:
    """Genuine CDP-dispatched drag with intermediate mousemove steps, so the
    panorama engine reads it as a smooth pan rather than a single-jump flick
    (confirmed live: a one-shot down/up produces velocity-dependent inertia
    overshoot; stepped moves track ~1:1 like a real drag).

    step_delay matters once cdp_request() itself got fast (the earlier
    localhost->127.0.0.1 fix took it from ~4s to ~0ms/call): firing ~15
    mousemove events with no gap between them appears to outrun the
    panorama engine's own render/input loop — confirmed live, a batch of 27
    products this way produced 15 silently-frozen duplicate screenshots
    (drag never visibly moved the view, but no error either). A small
    per-step delay avoids that; still far cheaper than the pre-fix latency."""
    cdp_request("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x1, "y": y1}, port=port)
    cdp_request("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x1, "y": y1, "button": "left", "clickCount": 1}, port=port)
    for i in range(1, steps + 1):
        x = x1 + (x2 - x1) * i / steps
        y = y1 + (y2 - y1) * i / steps
        cdp_request("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "button": "left"}, port=port)
        if step_delay:
            time.sleep(step_delay)
    cdp_request("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x2, "y": y2, "button": "left", "clickCount": 1}, port=port)
