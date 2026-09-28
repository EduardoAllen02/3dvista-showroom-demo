#!/usr/bin/env python3
"""
Cleans official option labels in tour-project/febal-casa/product-facts/models.json that the
site exposes as file names or mangles, keeping the original in `label_raw`:

  "Copia di FebalCasa_Giorno_Madie_Aurora_Finiture_Nobilitato2_Basalto" -> "Basalto"
  "C Bianco Kent BK8X" -> "Bianco Kent BK8X"      "C GrigioPiomboGC7A" -> "Grigio Piombo GC7A"
  "CosaAnticoA7A" / "Opacoosa antico" -> "Rosa Antico A7A" / "Rosa antico"   (site drops "_R")
  "Ilaccato Opaco ..." / "Irovere ..." -> "Laccato Opaco ..." / "Rovere ..."
  "Nobilitato2 Basalto" -> "Basalto"      "Nobilitato2overe asiativo" -> "Rovere asiatico" (its swatch file)
  "Castoro CS7H (1)" -> "Castoro CS7H"    "Lucidobianco neve opaco (2)" -> "Bianco neve opaco"
  "Osso" with swatch "..._pet_rosso.jpg" -> "Rosso" (dropped "R")
  GRES "Calacatta" twice -> "Calacatta lucido" / "Calacatta opaco" (from the swatch file: greslucido / gresopaco)

Idempotent (always cleans from `label_raw`). Prints every change so it can be reviewed.

    python scripts/facts-clean-labels.py
"""
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODELS = os.path.join(ROOT, "tour-project", "febal-casa", "product-facts", "models.json")

# Collection name repeated at the start of a file-name label ("Nobilitato2_Basalto").
COLLECTION_PREFIX = re.compile(r"^(Nobilitato\d?|laccato ?opaco|MetalSkin|Gres ?Lucido|Gres ?Opaco|C)_", re.I)


def clean(label: str) -> str:
    s = re.sub(r"^(Copia di )+", "", label)
    s = re.sub(r"^FebalCasa_.*?_Finiture_", "", s)
    s = COLLECTION_PREFIX.sub("", s)
    s = re.sub(r"^metalvivabronzo$", "metal viva bronzo", s, flags=re.I)
    s = re.sub(r"^Cosa(?=[A-Z])", "Rosa", s)          # "C_R" + dropped "_R"
    s = re.sub(r"^(Opaco|Lucido)osa ", "Rosa ", s)
    s = re.sub(r"^C (?=[A-Z])", "", s)                # stray "C " prefix of the lacquer lists
    s = re.sub(r"^I(?=laccato|rovere)", "", s)        # stray "I" before lowercase file names
    s = re.sub(r"^Nobilitato2overe asiativo$", "Rovere asiatico", s)   # swatch file: rovere_asiatico.jpg
    s = re.sub(r"^Nobilitato\d\s+", "", s, flags=re.I)  # "Nobilitato2 Basalto"
    s = re.sub(r"^Lucido(?=bianco)", "", s)           # "Lucidobianco neve opaco"
    s = re.sub(r"\s*\(\d\)$", "", s)                  # "(1)" / "(2)" copies on the site
    s = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", s)        # CamelCase from file names
    s = re.sub(r"[_\s]+", " ", s).strip()
    return s[:1].upper() + s[1:] if s else s


def main():
    with open(MODELS, encoding="utf-8") as f:
        models = json.load(f)
    changed = 0
    for m in models:
        for g in m["finish_groups"]:
            for c in g["collections"]:
                for o in c["options"]:
                    raw = o.get("label_raw", o.get("label")) or ""
                    new = clean(raw)
                    swatch = (o.get("swatch_url") or "").lower()
                    # The site drops a leading "R" ("Osso" for Rosso): the swatch file keeps the full name.
                    tail = swatch.rsplit("/", 1)[-1].rsplit(".", 1)[0].rsplit("_", 1)[-1]
                    if new and tail == "r" + new.lower():
                        new = "R" + new.lower()
                    finish = "lucido" if "greslucido" in swatch else "opaco" if "gresopaco" in swatch else None
                    if c.get("name") == "GRES" and finish and new and finish not in new.lower():
                        new = f"{new} {finish}"
                    if new != raw:
                        o["label_raw"] = raw
                        if o.get("label") != new:
                            changed += 1
                            print(f"{m['model_key']}: {raw!r} -> {new!r}")
                        o["label"] = new
    with open(MODELS, "w", encoding="utf-8") as f:
        json.dump(models, f, ensure_ascii=False, indent=1)
    print(f"{changed} etiquetas limpiadas")


if __name__ == "__main__":
    main()
