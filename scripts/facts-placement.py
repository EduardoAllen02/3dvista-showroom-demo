#!/usr/bin/env python3
"""
Records hand-made observations of tour captures into
tour-project/febal-casa/product-facts/placements.json (one entry per product_id).

Input (stdin): JSON list of
  {"product_id": "FEB-001",
   "visible": "SI"|"NO",                         # is the piece clearly in frame?
   "componentes": [{"rol": "front", "dominante": true, "color": "nero venato bianco", "material": "effetto marmo (Scenario)"}],
   "color": ["SI"|"NO", "<literal>", "<evidence>"],
   "material": ["SI"|"NO", "<literal>", "<evidence>"],
   "forma": ["SI"|"NO", "<literal>", "<evidence>"],
   "opcion_oficial": ["SI"|"NO", "<collection · option or candidates>", "<evidence>"],
   "notas": ["..."]}

It also writes the compiler-facing "observed" block (colors/materials/shape literals).
"""
import datetime as dt
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FACTS = os.path.join(ROOT, "tour-project", "febal-casa", "product-facts")
OUT = os.path.join(FACTS, "placements.json")
MANIFEST = os.path.join(FACTS, "captures", "manifest.json")


def b(v):
    return {"confirmado": v[0], "valor": v[1], "evidencia": v[2]} if isinstance(v, list) else v


def main():
    # Bytes, not sys.stdin: on Windows the text stream defaults to cp1252 and mangles accents.
    batch = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    data = {}
    if os.path.exists(OUT):
        data = {e["product_id"]: e for e in json.load(open(OUT, encoding="utf-8"))}
    manifest = {m["product_id"]: m for m in json.load(open(MANIFEST, encoding="utf-8"))} if os.path.exists(MANIFEST) else {}
    cat = {p["product_id"]: p for p in json.load(open(os.path.join(ROOT, "clients", "febal-casa", "catalog.json"), encoding="utf-8"))}
    for e in batch:
        pid = e["product_id"]
        man = manifest.get(pid, {})
        comps = e.get("componentes", [])
        dom = [c for c in comps if c.get("dominante")] or comps[:1]
        color, material, forma = b(e["color"]), b(e["material"]), b(e["forma"])
        entry = {
            "product_id": pid, "name": cat[pid]["name"], "section": cat[pid]["section"],
            "captura": man.get("file"), "landing_ok": man.get("landing_ok"), "capturado": man.get("captured_at"),
            "observado": dt.date.today().isoformat(), "fuente": "captura del tour desde su POV verificado, observada a mano",
            "visible": e["visible"], "componentes": comps,
            "color": color, "material": material, "forma": forma, "opcion_oficial": b(e["opcion_oficial"]),
            "notas": e.get("notas", []),
            # Compiler-facing literals (only what is confirmed SI).
            "observed": {
                "name": cat[pid]["name"],
                "colors": [c["color"] for c in dom if c.get("color")] if color["confirmado"] == "SI" else [],
                # First slot = dominant surface ("" when unconfirmed), so a secondary part
                # (shelves, a handle) is never promoted to the piece's main material.
                "materials": ([(dom[0].get("material") or "") if dom else ""] + [c["material"] for c in comps if not c.get("dominante") and c.get("material")]) if material["confirmado"] == "SI" else [],
                "shape": forma["valor"] if forma["confirmado"] == "SI" else "",
            },
        }
        data[pid] = entry
    json.dump(sorted(data.values(), key=lambda x: x["product_id"]), open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"{len(batch)} registradas; total {len(data)}/88")


if __name__ == "__main__":
    main()
