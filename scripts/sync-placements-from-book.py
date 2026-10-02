#!/usr/bin/env python3
"""
Brings the per-piece record (product-facts/placements.json, what the database workbook shows and
edits) in line with the client's composition book (product-facts/book-compo-finishes.json):

- "opcion_oficial" (the exact finish in the showroom) becomes SI with the book's literal finish;
- colour, material and parts become the book's, each with its page as evidence;
- parts only the capture saw (a metal base the book does not list) are kept, marked as such;
- what the capture had said stays in "notas", so nothing observed is lost.

The compiled catalog already takes the book first (scripts/build-catalog-v2.ts); this keeps the
workbook, its round-trip (import-database-xlsx.py) and the compiler's "observed" block consistent.

    python scripts/sync-placements-from-book.py
"""
import datetime as dt
import json
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FACTS = os.path.join(ROOT, "tour-project", "febal-casa", "product-facts")
PLACEMENTS = os.path.join(FACTS, "placements.json")
BOOK = os.path.join(FACTS, "book-compo-finishes.json")
PACK = os.path.join(ROOT, "packages", "assistant-engine", "src", "packs", "furniture.json")
TODAY = dt.date.today().isoformat()

# Which part of a piece a book role and a capture's (Spanish) part name refer to.
ROLE_GROUP = {"legs": ("support",), "base": ("support",), "structure": ("support",), "frame": ("support",),
              "top": ("top",), "doors": ("doors",), "front": ("doors",), "shelves": ("shelves",),
              "handle": ("handle",), "interior": ("back",)}
CAPTURE_GROUP = {"support": ("pata", "base", "pie", "estructura", "montante", "marco"), "top": ("cubierta", "top"),
                 "doors": ("puerta", "ante", "vitrina", "alacena"), "shelves": ("repisa", "mensol"),
                 "handle": ("jalader", "perfil"), "back": ("fondo", "respaldo", "interior")}


def main():
    book = json.load(open(BOOK, encoding="utf-8"))
    src = book["_fuente"]
    pack = json.load(open(PACK, encoding="utf-8"))
    concepts = pack["concepts"] if isinstance(pack["concepts"], list) else list(pack["concepts"].values())
    it = {c["id"]: (c.get("labels") or {}).get("it") or c["id"] for c in concepts}
    placements = json.load(open(PLACEMENTS, encoding="utf-8"))
    by_id = {p["product_id"]: p for p in placements}
    done = 0
    for pid, entry in book.items():
        if pid.startswith("_") or pid not in by_id:
            continue
        p = by_id[pid]
        cite = f"{src['titulo']}, pág. {entry['pagina']}, {entry['caja']}"
        literal = "; ".join(f"{pt['parte']}: {pt['acabado']}" for pt in entry["partes"])
        main_part = next(pt for pt in entry["partes"] if pt["principal"])
        old_comps = p.get("componentes") or []
        old_dom = next((c for c in old_comps if c.get("dominante")), old_comps[0] if old_comps else {})
        comps = [{"rol": pt["rol"], "dominante": pt["principal"], "color": pt["color"],
                  "material": it.get(pt["material"], "") if pt["material"] else "", "acabado": pt["acabado"],
                  "fuente": f"libro pág. {entry['pagina']}"} for pt in entry["partes"]]
        # Parts only the capture saw keep their material (a metal base, a glass lid); a part the
        # book already describes (legs, top, doors…) is the book's, not the capture's.
        book_groups = {g for pt in entry["partes"] for g in ROLE_GROUP.get(pt["rol"], ())}
        book_mats = {c["material"] for c in comps if c["material"]}
        for c in old_comps:
            if c.get("dominante") or not c.get("material") or c.get("fuente", "").startswith("libro"):
                continue
            groups = {g for g, words in CAPTURE_GROUP.items() if any(w in c.get("rol", "").lower() for w in words)}
            if groups & book_groups or any(c["material"].split(" ")[0] in m for m in book_mats):
                continue
            comps.append({**c, "fuente": "captura"})
        note = (f"LIBRO ({src['recibido']}): acabados del Book Compo, {entry['caja']} pág. {entry['pagina']}. "
                f"La captura decía: color «{old_dom.get('color', '')}», material «{old_dom.get('material', '')}».")
        if entry.get("nota"):
            note += f" {entry['nota']}"
        p["componentes"] = comps
        p["color"] = {"confirmado": "SI", "valor": main_part["color"], "evidencia": f"{cite}: {main_part['parte']}: {main_part['acabado']}"}
        main_mat = it.get(main_part["material"], "") if main_part["material"] else ""
        p["material"] = {"confirmado": "SI" if main_mat else p["material"]["confirmado"],
                         "valor": main_mat or p["material"]["valor"],
                         "evidencia": f"{cite}: {main_part['parte']}: {main_part['acabado']}" if main_mat else p["material"]["evidencia"]}
        p["opcion_oficial"] = {"confirmado": "SI", "valor": main_part["acabado"], "evidencia": f"{cite}: {literal}"}
        p["fuente_acabados"] = f"{src['titulo']} ({src['documento']})"
        p["notas"] = [n for n in (p.get("notas") or []) if not n.startswith("LIBRO (")] + [note]
        # Compiler-facing literals, as facts-placement.py writes them.
        dom = [c for c in comps if c.get("dominante")]
        p["observed"] = {
            **p.get("observed", {}),
            "colors": [c["color"] for c in dom if c.get("color")],
            "materials": [(dom[0].get("material") or "") if dom else ""] + [c["material"] for c in comps if not c.get("dominante") and c.get("material")],
        }
        done += 1
    with open(PLACEMENTS, "w", encoding="utf-8") as f:
        json.dump(placements, f, ensure_ascii=False, indent=1)
    print(f"placements.json: {done} piezas sincronizadas con el libro")


if __name__ == "__main__":
    main()
