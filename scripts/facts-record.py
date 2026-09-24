#!/usr/bin/env python3
"""
Helper for the manual reading step: merges hand-written model attribute records into
tour-project/febal-casa/product-facts/model-attributes.json (one entry per model_key).
Each attribute is binary: {"confirmado": "SI"|"NO", "valor": ..., "evidencia": "<literal quote>"}.

Usage (from Python): from importlib import util; ... rec(key, **fields)  — or pipe a JSON list:
  python scripts/facts-record.py < batch.json
"""
import datetime as dt
import json
import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "tour-project", "febal-casa", "product-facts", "model-attributes.json")
MODELS = os.path.join(ROOT, "tour-project", "febal-casa", "product-facts", "models.json")
FIELDS = ("forma", "materiales", "estilo", "medidas", "lista_acabados")


def attr(v):
    if isinstance(v, dict):
        return v
    confirmado, valor, evidencia = v
    return {"confirmado": confirmado, "valor": valor, "evidencia": evidencia}


def main():
    # Bytes, not sys.stdin: on Windows the text stream defaults to cp1252 and mangles accents.
    batch = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    data = {}
    if os.path.exists(OUT):
        with open(OUT, encoding="utf-8") as f:
            data = {e["model_key"]: e for e in json.load(f)}
    with open(MODELS, encoding="utf-8") as f:
        models = {m["model_key"]: m for m in json.load(f)}
    for e in batch:
        key = e["model_key"]
        if key not in models:
            sys.exit(f"unknown model_key {key}")
        m = models[key]
        entry = {
            "model_key": key,
            "url": m["url"],
            "piezas": [r["product_id"] for r in m["catalog_refs"]],
            "leido": dt.date.today().isoformat(),
            "fuente": "texto íntegro de la ficha (raw-html, div.app-page), leído a mano",
        }
        for field in FIELDS:
            if field in e:
                entry[field] = attr(e[field])
        entry["opciones_en_texto"] = e.get("opciones_en_texto", [])
        entry["notas"] = e.get("notas", [])
        data[key] = entry
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(sorted(data.values(), key=lambda x: x["model_key"]), f, ensure_ascii=False, indent=1)
    print(f"{len(batch)} registrados; total {len(data)}/{len(models)} modelos")


if __name__ == "__main__":
    main()
