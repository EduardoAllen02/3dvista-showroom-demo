#!/usr/bin/env python3
"""
Viewer for the capture/observation step: for ONE piece, print what is already known
(catalog v1 values, the earlier sample observation) and its model's official option
lists (name + swatch hex), so the observer can match what the capture shows to an
official option. Read-only.

    python scripts/facts-options.py FEB-001 [substring-filter]
"""
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FACTS = os.path.join(ROOT, "tour-project", "febal-casa", "product-facts")


def main():
    pid = sys.argv[1]
    flt = sys.argv[2].lower() if len(sys.argv) > 2 else ""
    cat = {p["product_id"]: p for p in json.load(open(os.path.join(ROOT, "clients", "febal-casa", "catalog.json"), encoding="utf-8"))}
    p = cat[pid]
    models = json.load(open(os.path.join(FACTS, "models.json"), encoding="utf-8"))
    attrs = {a["model_key"]: a for a in json.load(open(os.path.join(FACTS, "model-attributes.json"), encoding="utf-8"))}
    m = next((x for x in models if any(r["product_id"] == pid for r in x["catalog_refs"])), None)
    sample = {}
    sp = os.path.join(ROOT, ".scratch", "enrichment-findings.json")
    if os.path.exists(sp):
        sample = json.load(open(sp, encoding="utf-8")).get(pid, {})
    print(f"{pid} | {p['name']} | {p['section']} | v1: colors={p.get('colors')} materials={p.get('materials')} shape={p.get('shape')!r}")
    if sample:
        print(f"  muestra previa: colors={sample.get('colors')} materials={sample.get('materials')} shape={sample.get('shape')!r}")
    if not m:
        print("  (sin modelo/ficha)")
        return
    a = attrs.get(m["model_key"], {})
    lista = a.get("lista_acabados", {})
    print(f"  modelo: {m['model_key']} | lista: {lista.get('confirmado')} {str(lista.get('valor'))[:90]}")
    for t in a.get("opciones_en_texto", []):
        print(f"  texto: {t}")
    for g in m["finish_groups"]:
        for c in g["collections"]:
            opts = [f"{o['label']}{' ' + o['code'] if o.get('code') else ''} {o.get('swatch_hex') or ''}" for o in c["options"]]
            line = f"  [{g['group']}] {c['name']}: " + "; ".join(opts)
            if not flt or flt in line.lower():
                print(line[:700])


if __name__ == "__main__":
    main()
