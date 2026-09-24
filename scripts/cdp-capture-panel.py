#!/usr/bin/env python3
"""
Manual per-product camera-capture control panel (2026-09-21/22 session).

Edd drives the REAL tour by hand (mouse drag, in the actual Chrome tab —
never scripted camera movement, per explicit instruction) and, once a
product is correctly framed (front-facing, product as protagonist), clicks
"Capturar" on a small helper page opened alongside the tour. This script
never moves the camera. It only reads, on demand, whatever Edd already
framed, and writes it to the source catalog.

The hard part this script solves: 18 product NAMES repeat across the
catalog (e.g. "Tavolino Rio" exists 3 times, "Divano Camden" twice, etc. —
see tour-project/febal-casa/matched-catalog.json), so "which row do I write
this capture to?" can't be answered by name. Each hotspot overlay in the
live tour is authored with its own box number (e.g. "b106 hotspot" on the
panorama == "BOX 100 - B_106" in the source spreadsheet), and that SECOND
box number is unique per placement WITHIN matched-catalog.json (verified:
94/95 unique, one real source-data collision at box 401 — see
"needs_manual_pick"). So: find the hotspot nearest the camera's current
look direction, read ITS box number straight from the tour's own overlay
data, and use that to look up the exact row.

2026-09-22 correction (real bug, caught live): the raw hotspot LABEL is
*not* guaranteed unique across the whole live tour, only usually — e.g.
"b110 hotspot" was found authored on BOTH panorama 9 (the real Tavolino Rio
BOX 100 - B_110) and panorama 19 (an unrelated room, a stray/mislabeled
overlay), a genuine 3DVista authoring quirk. A blind auto-write silently
clobbered a previously-verified good capture with the wrong room's camera
data, and the progress counter correctly stayed put (it was rewriting the
same row) — Edd caught it because the count didn't move.

Fix: capture is now two-step. POST /capture never writes — it only
resolves a candidate and returns a PREVIEW, flagging risk (e.g. "this row
was already verified with a very different panorama — are you sure?").
POST /confirm writes exactly the previewed values, only when the browser
sends them back (so nothing is saved without a human seeing it first).

2026-09-22, second addition: of the 48 rows the Fase-2 auto-matcher
couldn't place (tour-project/febal-casa/unmatched-products.json, never
built into catalog.json — the chatbot doesn't know these products exist at
all), 16 actually DO have a real, findable hotspot in the live tour (the
matcher just failed to pair them with spreadsheet coordinates; Edd confirmed
one live — "Armadio Profile/ Leather", BOX 180 - B_192, standing right in
front of it with nothing in the catalog to show for it). Since the capture
flow already lands Edd in front of these while walking the tour, it can
promote them on the spot: same preview/confirm capture, but when the box
resolves to an unmatched row instead of a matched one, confirming MOVES that
row from unmatched-products.json into matched-catalog.json with the new
camera data attached, so the next catalog rebuild mints it a real
product_id (isMatched=true → active=true, see build-febal-catalog.mjs).

Usage:
    python scripts/cdp-capture-panel.py
    -> opens http://localhost:8765 ; open that alongside the tour tab.
"""
import json
import os
import re
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(__file__))
from cdp_helpers import evaluate  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MATCHED_PATH = os.path.join(ROOT, "tour-project", "febal-casa", "matched-catalog.json")
UNMATCHED_PATH = os.path.join(ROOT, "tour-project", "febal-casa", "unmatched-products.json")
CATALOG_PATH = os.path.join(ROOT, "clients", "febal-casa", "catalog.json")
PORT = 8765

# Panoramas already seen to genuinely contain a given box's hotspot, learned
# as captures get confirmed this run — lets us flag "this exact box label
# also showed up on a panorama we know is wrong for it" even before the
# angular/verified heuristics below kick in. Not persisted; best-effort.
_seen_box_panoramas = {}

WRITE_LOCK = threading.Lock()

FULL_TOUR_INDEX_JS = r"""
(() => {
  const registry = window.tour.player;
  const playlist = registry.getById("mainPlayList");
  const items = playlist.get("items");
  const HOTSPOT_SUFFIX = " hotspot";
  function normalizePrefix(p) { return p.trim().toLowerCase().replace(/^b(?=\d)/, ""); }
  const out = {};
  for (const item of items) {
    const media = item.get("media");
    if (!media) continue;
    const data = media.get("data");
    const media_name = data && data.label;
    if (!media_name) continue;
    const overlays = media.get("overlays") || [];
    for (const o of overlays) {
      const d = o.get("data");
      const label = d && d.label;
      if (typeof label === "string" && label.endsWith(HOTSPOT_SUFFIX)) {
        const box = normalizePrefix(label.slice(0, -HOTSPOT_SUFFIX.length));
        (out[box] ||= []).push(media_name);
      }
    }
  }
  return out;
})()
"""

# box -> set(media_name) where that box's hotspot REALLY, verifiably exists
# anywhere in the live tour — ground truth, not a guess. Built once (the
# tour's own authored geometry doesn't change at runtime) and used to settle
# name-only ambiguity (e.g. plain "boiserie", 19 same-named candidates) by
# elimination: of the candidates, only the one(s) whose box actually has a
# hotspot on the CURRENT panorama can be what's on screen — verified live:
# 2 of 3 "Boiserie" casa-narrowed candidates (441, 467) don't exist as a
# hotspot ANYWHERE in the tour at all (ghost rows, same species of bug as
# B_202/B_665 found earlier this session), leaving exactly one real answer.
_full_tour_index = None


def get_full_tour_index():
    global _full_tour_index
    if _full_tour_index is None:
        raw = evaluate(FULL_TOUR_INDEX_JS)
        _full_tour_index = {box: set(medias) for box, medias in (raw or {}).items()}
    return _full_tour_index

CAPTURE_JS = r"""
(() => {
  const registry = window.tour && window.tour.player;
  if (!registry) return { error: "no tour registry (¿la pestaña correcta está cargada en localhost:5501?)" };

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

  // Only strip a leading "b" when it prefixes digits (the "b106" -> "106"
  // pattern). A handful of hotspots are authored with the product's own
  // name instead of a numeric box (e.g. "leaf hotspot", "boiserie hotspot")
  // — blindly stripping "b" mangled "boiserie" into "oiserie". Those
  // word-labels are handled separately server-side (name fallback).
  function normalizePrefix(p) { return p.trim().toLowerCase().replace(/^b(?=\d)/, ""); }
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
      const pitchRaw = image && image.get("pitch");
      // Some hotspot markers are authored with yaw only (pitch left unset on the
      // 3DVista side) — found live on box 191/186. Treating that as "missing" and
      // dropping the candidate silently pushed the nearest-match onto a farther,
      // unrelated hotspot instead. Default pitch to 0 rather than excluding it.
      if (typeof yaw === "number") {
        hotspots.push({ box: normalizePrefix(prefixRaw), yaw, pitch: typeof pitchRaw === "number" ? pitchRaw : 0 });
      }
    }
  }

  for (const h of hotspots) {
    h.dist = (typeof camYaw === "number" && typeof camPitch === "number")
      ? Math.sqrt(angDiff(h.yaw, camYaw) ** 2 + (h.pitch - camPitch) ** 2)
      : null;
  }
  hotspots.sort((a, b) => (a.dist ?? 999) - (b.dist ?? 999));

  return {
    media_name,
    camera: { yaw: camYaw, pitch: camPitch, fov: camFov },
    hotspots,
  };
})()
"""


def load_matched():
    with open(MATCHED_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_matched(rows):
    with open(MATCHED_PATH, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)


def load_unmatched():
    with open(UNMATCHED_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def save_unmatched(rows):
    with open(UNMATCHED_PATH, "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=2, ensure_ascii=False)


def load_catalog_names():
    """box_numbers[1] -> {product_id, name} straight from the last built catalog.json, for nicer display."""
    if not os.path.exists(CATALOG_PATH):
        return {}
    with open(CATALOG_PATH, "r", encoding="utf-8") as f:
        catalog = json.load(f)
    out = {}
    for p in catalog:
        hn = p.get("hotspot_name") or ""
        parts = hn.split("_")
        if len(parts) >= 2:
            out[parts[-1].strip()] = {"product_id": p["product_id"], "name": p["name"]}
    return out


def rows_by_box(rows):
    """box_numbers[1] -> list of matching rows (normally 1; box '401' is a known real collision)."""
    out = {}
    for r in rows:
        boxes = r.get("box_numbers") or []
        if len(boxes) >= 2:
            out.setdefault(boxes[1], []).append(r)
    return out


def find_by_name_word(word, matched_rows, unmatched_rows, current_media_name=None, prefer_casas=None):
    """Fallback for hotspots authored with the product's own name instead of a
    numeric box (found live: 'leaf hotspot', 'boiserie hotspot'). Matches the
    word against prodotto_ita/prodotto_eng, matched rows first.

    EXACT name match (word == the whole product name, e.g. "boiserie" ==
    "Boiserie") always wins over a PARTIAL word match (word found as one
    token inside a longer name, e.g. "boiserie" inside "Boiserie camino" /
    "Boiserie TV" — real, different products; a live capture on plain
    "boiserie hotspot" almost never means those). Partial hits are only
    returned when there is no exact hit at all.

    When exact hits are still ambiguous (verified live: 19 rows are plainly
    named "Boiserie", a generic modular decorative panel that repeats across
    every casa), narrow in two stages:
      1. GROUND TRUTH (authoritative): drop any candidate whose OWN box
         number has no hotspot at all on `current_media_name` per the
         full-tour index — verified live, this alone settles most cases (of
         3 casa-narrowed "Boiserie" candidates, 2 turned out to be ghost
         rows with no hotspot anywhere in the tour; only 1 real answer
         remained). Only applied when it leaves at least one candidate.
      2. `prefer_casas` (heuristic): the section(s) inferred from OTHER,
         unambiguous numeric hotspots on this same panorama — used only if
         ground truth alone didn't fully resolve it.
    Returns the shortest list either stage achieved, for a human to pick
    from if still >1."""
    exact, partial = [], []
    for source, rows in (("matched", matched_rows), ("unmatched", unmatched_rows)):
        for r in rows:
            for name in (r.get("prodotto_ita", ""), r.get("prodotto_eng", "")):
                tokens = re.findall(r"[a-z0-9]+", name.lower())
                if tokens == [word]:
                    exact.append((source, r))
                    break
                if word in tokens:
                    partial.append((source, r))
                    break
    hits = exact or partial

    if len(hits) > 1 and current_media_name is not None:
        index = get_full_tour_index()
        def has_real_hotspot(r):
            boxes = r.get("box_numbers") or []
            own_box = boxes[1] if len(boxes) > 1 else None
            return bool(own_box) and current_media_name in index.get(own_box, set())
        grounded = [(s, r) for s, r in hits if has_real_hotspot(r)]
        if grounded:
            hits = grounded

    if len(hits) > 1 and prefer_casas:
        narrowed = [(s, r) for s, r in hits if r.get("casa") in prefer_casas]
        if narrowed:
            hits = narrowed
    return hits


def unmatched_by_box(rows):
    out = {}
    for r in rows:
        boxes = r.get("box_numbers") or []
        if len(boxes) >= 2:
            out.setdefault(boxes[1], []).append(r)
    return out


def infer_nearby_casas(hotspots, by_box, unmatched_rows_by_box):
    """Sections seen on THIS panorama via other, unambiguously-numeric
    hotspots — used to narrow a name-only match (e.g. plain "boiserie",
    19-way ambiguous by name alone) down to the section actually in view."""
    casas = set()
    for h in hotspots:
        box = h["box"]
        if not box.isdigit():
            continue
        for source in (by_box.get(box, []), unmatched_rows_by_box.get(box, [])):
            if len(source) == 1:
                casa = source[0].get("casa")
                if casa:
                    casas.add(casa)
    return casas


def label_for(box, by_box, names):
    cands = by_box.get(box)
    if not cands:
        return f"{box} (?)"
    if len(cands) > 1:
        return f"{box} (¡box duplicado en la fuente!)"
    meta = names.get(box, {})
    return f'{box} → {meta.get("name") or cands[0]["prodotto_ita"]}'


def do_preview():
    state = evaluate(CAPTURE_JS)
    if not isinstance(state, dict) or state.get("error"):
        return {"ok": False, "error": (state or {}).get("error", "sin respuesta del navegador")}

    hotspots = state.get("hotspots") or []
    if not hotspots:
        return {
            "ok": False,
            "error": f"No hay hotspots de producto en este panorama (media_name={state.get('media_name')}).",
        }

    rows = load_matched()
    by_box = rows_by_box(rows)
    names = load_catalog_names()

    best = hotspots[0]
    box = best["box"]
    candidates = by_box.get(box, [])

    nearby = [
        {"box": h["box"], "dist": round(h["dist"], 1) if h.get("dist") is not None else None, "label": label_for(h["box"], by_box, names)}
        for h in hotspots[1:5]
    ]

    if len(candidates) == 0:
        unmatched = load_unmatched()
        unmatched_hit = next((r for r in unmatched if (r.get("box_numbers") or [None, None])[1] == box), None)
        if unmatched_hit:
            cam = state["camera"]
            return {
                "ok": True,
                "new_product": True,
                "box": box,
                "row_index": unmatched_hit["rowIndex"],
                "nome": unmatched_hit["nome"],
                "product_id": None,
                "name": unmatched_hit["prodotto_ita"],
                "section": unmatched_hit.get("casa"),
                "old": None,
                "new": {
                    "media_name": state["media_name"],
                    "yaw": round(cam["yaw"], 1),
                    "pitch": round(cam["pitch"], 1),
                    "fov": round(cam["fov"], 1),
                },
                "already_verified": False,
                "risks": [],
                "nearby": nearby,
            }
        # Non-numeric label (e.g. "leaf", "boiserie") — the tour used the
        # product's own name instead of a box number for this marker. Try
        # matching it as a whole word against product names, matched rows
        # first (an update) then unmatched (a promotion, same as above).
        if not box.isdigit():
            unmatched_rows = load_unmatched()
            nearby_casas = infer_nearby_casas(hotspots, by_box, unmatched_by_box(unmatched_rows))
            hits = find_by_name_word(box, rows, unmatched_rows, current_media_name=state.get("media_name"), prefer_casas=nearby_casas)
            if len(hits) == 1:
                source, hit = hits[0]
                cam = state["camera"]
                new = {
                    "media_name": state["media_name"],
                    "yaw": round(cam["yaw"], 1),
                    "pitch": round(cam["pitch"], 1),
                    "fov": round(cam["fov"], 1),
                }
                if source == "matched":
                    old = {"media_name": hit.get("media_name"), "yaw": hit.get("yaw"), "pitch": hit.get("pitch"), "fov": hit.get("fov")}
                    risks = []
                    if hit.get("camera_verified") and str(old["media_name"]) != str(new["media_name"]):
                        risks.append(f'Esta fila YA estaba verificada ({hit["camera_verified"]}) con panorama "{old["media_name"]}", ahora en "{new["media_name"]}" — revisa que sea el mismo mueble.')
                    return {
                        "ok": True, "box": box, "row_index": hit["rowIndex"], "nome": hit["nome"],
                        "product_id": names.get(hit["box_numbers"][1] if len(hit.get("box_numbers", [])) > 1 else "", {}).get("product_id"),
                        "name": hit["prodotto_ita"], "section": hit.get("casa"),
                        "old": old, "new": new, "already_verified": bool(hit.get("camera_verified")),
                        "risks": risks + [f'Este hotspot está etiquetado "{box}" (nombre, no número de caja) en el tour — coincidencia encontrada por nombre de producto, no por box. Verifica que sea correcto.'],
                        "nearby": nearby,
                    }
                return {
                    "ok": True, "new_product": True, "box": box, "row_index": hit["rowIndex"], "nome": hit["nome"],
                    "product_id": None, "name": hit["prodotto_ita"], "section": hit.get("casa"),
                    "old": None, "new": new, "already_verified": False,
                    "risks": [f'Este hotspot está etiquetado "{box}" (nombre, no número de caja) en el tour — coincidencia encontrada por nombre de producto, no por box. Verifica que sea correcto.'],
                    "nearby": nearby,
                }
            if len(hits) > 1:
                narrowed_note = f' (acotado por sección a partir de los hotspots vecinos: {", ".join(sorted(nearby_casas))})' if nearby_casas else ""
                cam = state["camera"]
                new = {
                    "media_name": state["media_name"],
                    "yaw": round(cam["yaw"], 1),
                    "pitch": round(cam["pitch"], 1),
                    "fov": round(cam["fov"], 1),
                }
                return {
                    "ok": False,
                    "needs_manual_pick": True,
                    "box": box,
                    "new": new,
                    "error": f'El hotspot está etiquetado "{box}" (nombre de producto) y quedan {len(hits)} candidatos{narrowed_note} — elige a mano cuál es.',
                    "candidates": [
                        {"nome": h["nome"], "prodotto_ita": h["prodotto_ita"], "rowIndex": h["rowIndex"], "casa": h.get("casa"), "source": s}
                        for s, h in hits
                    ],
                    "nearby": nearby,
                }
        return {
            "ok": False,
            "error": f'El hotspot más cercano es box "{box}" pero ningún producto (ni siquiera en unmatched-products.json) usa ese número. Revisa a mano.',
            "nearby": nearby,
            "media_name": state.get("media_name"),
        }

    if len(candidates) > 1:
        cam = state["camera"]
        new = {
            "media_name": state["media_name"],
            "yaw": round(cam["yaw"], 1),
            "pitch": round(cam["pitch"], 1),
            "fov": round(cam["fov"], 1),
        }
        return {
            "ok": False,
            "needs_manual_pick": True,
            "box": box,
            "new": new,
            "error": f'El box "{box}" está duplicado en la propia fuente (matched-catalog.json) entre {len(candidates)} productos distintos — confírmalo a mano (y de paso corrígelo en la fuente, no debería repetirse).',
            "candidates": [{"nome": c["nome"], "prodotto_ita": c["prodotto_ita"], "rowIndex": c["rowIndex"], "casa": c.get("casa"), "source": "matched"} for c in candidates],
            "nearby": nearby,
        }

    row = candidates[0]
    meta = names.get(box, {})
    cam = state["camera"]
    new_yaw = round(cam["yaw"], 1)
    new_pitch = round(cam["pitch"], 1)
    new_fov = round(cam["fov"], 1)
    new_media = state["media_name"]
    old_media = row.get("media_name")

    risks = []
    if row.get("camera_verified") and str(old_media) != str(new_media):
        risks.append(
            f'Esta fila YA estaba verificada ({row["camera_verified"]}) con panorama "{old_media}", '
            f'y ahora se detectó en panorama "{new_media}" — un panorama totalmente distinto. '
            f"¿Seguro que este es el mismo mueble y no otro hotspot con el mismo número (ya pasó una vez)?"
        )
    if best.get("dist") is not None and best["dist"] > 35:
        risks.append(f'El hotspot más cercano está a {round(best["dist"],1)}° de donde apunta la cámara — algo lejos, revisa que sea el correcto.')
    seen_panos = _seen_box_panoramas.get(box)
    if seen_panos and str(new_media) not in seen_panos:
        risks.append(f'En esta misma sesión, el box "{box}" ya se confirmó antes en panorama {sorted(seen_panos)} — ahora aparece en "{new_media}", distinto.')

    return {
        "ok": True,
        "box": box,
        "row_index": row["rowIndex"],
        "nome": row["nome"],
        "product_id": meta.get("product_id"),
        "name": meta.get("name") or row["prodotto_ita"],
        "section": row.get("casa"),
        "old": {"media_name": old_media, "yaw": row.get("yaw"), "pitch": row.get("pitch"), "fov": row.get("fov")},
        "new": {"media_name": new_media, "yaw": new_yaw, "pitch": new_pitch, "fov": new_fov},
        "already_verified": bool(row.get("camera_verified")),
        "risks": risks,
        "nearby": nearby,
    }


def do_confirm(payload):
    row_index = payload.get("row_index")
    new = payload.get("new") or {}
    box = payload.get("box")
    is_new_product = bool(payload.get("new_product"))
    required = {"media_name", "yaw", "pitch", "fov"}
    if row_index is None or not required.issubset(new):
        return {"ok": False, "error": "payload incompleto"}

    with WRITE_LOCK:
        if is_new_product:
            unmatched = load_unmatched()
            promoted = None
            remaining = []
            for r in unmatched:
                if r["rowIndex"] == row_index:
                    promoted = r
                else:
                    remaining.append(r)
            if promoted is None:
                return {"ok": False, "error": f"rowIndex {row_index} ya no existe en unmatched-products.json (¿ya lo diste de alta antes?)"}

            promoted["media_name"] = new["media_name"]
            promoted["yaw"] = new["yaw"]
            promoted["pitch"] = new["pitch"]
            promoted["fov"] = new["fov"]
            promoted["camera_verified"] = time.strftime("%Y-%m-%d")
            promoted["needs_review"] = True  # never auto-matched by coordinates — worth a human glance later

            matched = load_matched()
            matched.append(promoted)
            save_matched(matched)
            save_unmatched(remaining)
        else:
            rows = load_matched()
            target = None
            for r in rows:
                if r["rowIndex"] == row_index:
                    target = r
                    break
            if target is None:
                return {"ok": False, "error": f"rowIndex {row_index} ya no existe en matched-catalog.json"}

            target["media_name"] = new["media_name"]
            target["yaw"] = new["yaw"]
            target["pitch"] = new["pitch"]
            target["fov"] = new["fov"]
            target["camera_verified"] = time.strftime("%Y-%m-%d")
            save_matched(rows)

    if box:
        _seen_box_panoramas.setdefault(box, set()).add(str(new["media_name"]))

    return {"ok": True}


def get_progress():
    rows = load_matched()
    total = len(rows)
    done_rows = [r for r in rows if r.get("camera_verified")]
    done = len(done_rows)
    pending = [r for r in rows if not r.get("camera_verified")]
    by_section = {}
    for r in pending:
        by_section.setdefault(r.get("casa") or "?", []).append(f'{r["nome"]} · {r["prodotto_ita"]}')
    return {
        "done": done,
        "total": total,
        "recent": [{"nome": r["nome"], "name": r["prodotto_ita"], "date": r["camera_verified"]} for r in done_rows][-8:][::-1],
        "pending_by_section": by_section,
    }


def do_rebuild():
    try:
        proc = subprocess.run(
            ["node", "scripts/build-febal-catalog.mjs"],
            cwd=ROOT, capture_output=True, text=True, timeout=60,
        )
        ok = proc.returncode == 0
        return {"ok": ok, "output": (proc.stdout or "") + (proc.stderr or "")}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "output": str(exc)}


PAGE = r"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Captura POV — Febal Casa</title>
<style>
  body { font-family: system-ui, sans-serif; background: #17181c; color: #eee; margin: 0; padding: 20px; }
  h1 { font-size: 15px; color: #999; font-weight: 500; margin: 0 0 14px; }
  button { font-family: inherit; }
  #capture { width: 100%; padding: 22px; font-size: 20px; font-weight: 700; border: none; border-radius: 10px;
             background: #e11; color: #fff; cursor: pointer; }
  #capture:active { background: #a00; }
  #capture:disabled { background: #444; cursor: wait; }
  #result { margin-top: 16px; padding: 14px; border-radius: 8px; background: #23252b; min-height: 60px; white-space: pre-wrap; font-size: 14px; }
  #result.ok { border-left: 5px solid #2ecc71; }
  #result.err { border-left: 5px solid #e74c3c; }
  #result.risk { border-left: 5px solid #e67e22; background: #2b2318; }
  .confirmrow { display: flex; gap: 10px; margin-top: 14px; }
  .confirmrow button { flex: 1; padding: 14px; font-size: 15px; font-weight: 600; border: none; border-radius: 8px; cursor: pointer; }
  #btn-confirm { background: #2ecc71; color: #0a2; color: #0b2b17; }
  #btn-discard { background: #333; color: #ccc; }
  #progress { margin-top: 16px; font-size: 13px; color: #aaa; }
  #bar { background: #2a2c33; border-radius: 6px; height: 10px; overflow: hidden; margin: 6px 0; }
  #barfill { background: #2ecc71; height: 100%; width: 0%; transition: width .3s; }
  #rebuild { margin-top: 14px; width: 100%; padding: 10px; font-size: 13px; border-radius: 8px; border: 1px solid #444; background: #1e1f24; color: #ccc; cursor: pointer; }
  .pending { margin-top: 10px; font-size: 12px; color: #888; max-height: 160px; overflow-y: auto; }
  .pending b { color: #bbb; }
  .nearby { margin-top: 10px; font-size: 12px; color: #999; }
  #picker { margin-top: 10px; display: flex; flex-direction: column; gap: 6px; }
  #picker button { text-align: left; padding: 10px 12px; font-size: 13px; border-radius: 8px; border: 1px solid #444; background: #1e1f24; color: #ddd; cursor: pointer; }
  #picker button:hover { background: #2a2c33; border-color: #666; }
</style>
</head>
<body>
  <h1>Febal Casa — captura manual de POV (panorama / yaw / pitch / fov)</h1>
  <button id="capture">📸 CAPTURAR</button>
  <div id="result">Encuadra el producto en la pestaña del tour y pulsa Capturar. Esto solo muestra una vista previa — no guarda nada todavía.</div>
  <div id="confirmrow" class="confirmrow" style="display:none">
    <button id="btn-confirm">✅ Confirmar y guardar</button>
    <button id="btn-discard">❌ Descartar</button>
  </div>
  <div id="picker"></div>
  <div id="progress">
    <div id="progresstext">cargando…</div>
    <div id="bar"><div id="barfill"></div></div>
  </div>
  <button id="rebuild">🔄 Reconstruir catalog.json</button>
  <div id="pending" class="pending"></div>

<script>
let pendingPreview = null;

async function refreshProgress() {
  const r = await fetch("/progress").then(r => r.json());
  document.getElementById("progresstext").textContent = `${r.done} / ${r.total} productos verificados`;
  document.getElementById("barfill").style.width = (100 * r.done / r.total) + "%";
  const pend = document.getElementById("pending");
  let html = "<b>Pendientes por sección:</b><br>";
  for (const [section, items] of Object.entries(r.pending_by_section)) {
    html += `<div style="margin-top:6px"><b>${section}</b> (${items.length})</div>`;
  }
  pend.innerHTML = html;
}

function nearbyText(nearby) {
  if (!nearby || !nearby.length) return "";
  return "\n\notros hotspots cerca en este panel: " + nearby.map(n => `${n.label} (${n.dist}°)`).join(", ");
}

function renderPicker(r) {
  const picker = document.getElementById("picker");
  if (!r.candidates || !r.needs_manual_pick) { picker.innerHTML = ""; return; }
  picker.innerHTML = "";
  for (const c of r.candidates) {
    const b = document.createElement("button");
    b.textContent = `${c.prodotto_ita}  —  ${c.nome}${c.casa ? "  (" + c.casa + ")" : ""}`;
    b.addEventListener("click", async () => {
      picker.innerHTML = "Guardando…";
      const out = document.getElementById("result");
      const resp = await fetch("/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row_index: c.rowIndex, box: r.box, new: r.new, new_product: c.source === "unmatched" }),
      }).then(x => x.json());
      picker.innerHTML = "";
      if (resp.ok) {
        out.className = "ok";
        out.textContent = `✅ Guardado: ${c.prodotto_ita} (${c.nome})`;
        refreshProgress();
      } else {
        out.className = "err";
        out.textContent = "⚠️ No se guardó: " + resp.error;
      }
    });
    picker.appendChild(b);
  }
}

document.getElementById("capture").addEventListener("click", async () => {
  const btn = document.getElementById("capture");
  const out = document.getElementById("result");
  const confirmRow = document.getElementById("confirmrow");
  confirmRow.style.display = "none";
  document.getElementById("picker").innerHTML = "";
  pendingPreview = null;
  btn.disabled = true;
  out.className = "";
  out.textContent = "Leyendo cámara…";
  try {
    const r = await fetch("/capture", { method: "POST" }).then(r => r.json());
    if (r.ok) {
      const risky = r.risks && r.risks.length;
      out.className = r.new_product ? "risk" : (risky ? "risk" : "ok");
      const oldLine = r.new_product
        ? "⚠️ Este producto NO está en el catálogo activo todavía — confirmar lo da de ALTA (hoy vive solo en unmatched-products.json, sin cámara ni product_id).\n\n"
        : `antes:  panorama ${r.old.media_name}  yaw ${r.old.yaw}  pitch ${r.old.pitch}  fov ${r.old.fov}\n`;
      out.textContent =
        (r.new_product ? "🆕 PRODUCTO NUEVO\n" : "") +
        (risky ? "⚠️ REVISAR ANTES DE CONFIRMAR ⚠️\n" + r.risks.join("\n") + "\n\n" : "") +
        `${r.name}  (${r.product_id || "sin id todavía"})${r.already_verified ? "  [ya estaba verificado]" : ""}\n` +
        `box: ${r.nome}   sección: ${r.section}\n\n` +
        oldLine +
        `PROPUESTO:  panorama ${r.new.media_name}  yaw ${r.new.yaw}  pitch ${r.new.pitch}  fov ${r.new.fov}` +
        nearbyText(r.nearby);
      pendingPreview = r;
      confirmRow.style.display = "flex";
    } else {
      out.className = "err";
      out.textContent = "⚠️ " + r.error + (r.candidates ? "\n\nElige abajo:" : "") + nearbyText(r.nearby);
      renderPicker(r);
    }
  } catch (e) {
    out.className = "err";
    out.textContent = "⚠️ " + e;
  }
  btn.disabled = false;
});

document.getElementById("btn-confirm").addEventListener("click", async () => {
  if (!pendingPreview) return;
  const out = document.getElementById("result");
  const r = await fetch("/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ row_index: pendingPreview.row_index, box: pendingPreview.box, new: pendingPreview.new, new_product: !!pendingPreview.new_product }),
  }).then(r => r.json());
  if (r.ok) {
    out.className = "ok";
    out.textContent = pendingPreview.new_product
      ? `✅ Dado de alta: ${pendingPreview.name} — reconstruye el catálogo (botón de abajo) para que reciba su product_id.`
      : `✅ Guardado: ${pendingPreview.name} (${pendingPreview.product_id || "?"})`;
    refreshProgress();
  } else {
    out.className = "err";
    out.textContent = "⚠️ No se guardó: " + r.error;
  }
  document.getElementById("confirmrow").style.display = "none";
  pendingPreview = null;
});

document.getElementById("btn-discard").addEventListener("click", () => {
  pendingPreview = null;
  document.getElementById("confirmrow").style.display = "none";
  document.getElementById("result").textContent = "Descartado. Reencuadra y vuelve a capturar.";
  document.getElementById("result").className = "";
});

document.getElementById("rebuild").addEventListener("click", async () => {
  const out = document.getElementById("result");
  out.className = "";
  out.textContent = "Reconstruyendo catalog.json…";
  const r = await fetch("/rebuild", { method: "POST" }).then(r => r.json());
  out.className = r.ok ? "ok" : "err";
  out.textContent = (r.ok ? "✅ " : "⚠️ ") + r.output;
});

refreshProgress();
</script>
</body>
</html>
"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # keep terminal quiet

    def _send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json_body(self):
        length = int(self.headers.get("Content-Length") or 0)
        if not length:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw)
        except Exception:  # noqa: BLE001
            return {}

    def do_GET(self):
        if self.path == "/" or self.path == "/index.html":
            body = PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif self.path == "/progress":
            self._send_json(get_progress())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/capture":
            try:
                self._send_json(do_preview())
            except Exception as exc:  # noqa: BLE001
                self._send_json({"ok": False, "error": f"excepción: {exc}"}, status=500)
        elif self.path == "/confirm":
            try:
                self._send_json(do_confirm(self._read_json_body()))
            except Exception as exc:  # noqa: BLE001
                self._send_json({"ok": False, "error": f"excepción: {exc}"}, status=500)
        elif self.path == "/rebuild":
            self._send_json(do_rebuild())
        else:
            self.send_response(404)
            self.end_headers()


def main():
    server = ThreadingHTTPServer(("localhost", PORT), Handler)
    print(f"Panel de captura en http://localhost:{PORT}  (Ctrl+C para detener)")
    print("Abrelo junto a la pestaña del tour. Capturar = vista previa; hay que Confirmar para guardar.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
