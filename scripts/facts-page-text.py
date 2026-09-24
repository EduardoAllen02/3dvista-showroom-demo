#!/usr/bin/env python3
"""
Viewer for the manual reading step (docs/chatbot-v2/prompt-sesion-datos.md, Paso 3):
prints the FULL visible product text of ONE cached febalcasa.com page (div.app-page,
without menu/footer/modals), one block per line, so a human/Claude can read it whole
instead of a summary. The finish lists are summarized as counts because they are
already transcribed literally in models.json.

Usage:  python scripts/facts-page-text.py <model_key>
"""
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("scraper", os.path.join(HERE, "scrape-febal-facts.py"))
scraper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(scraper)

NOISE = {"Home", "/", "Chiudi", "Scopri", "Store Locator Prenota un appuntamento", "Prenota un appuntamento",
         "Trova il rivenditore più vicino", "Sei interessato a questo prodotto o vuoi più informazioni?",
         "Cerca un rivenditore Febal Casa più vicino a te, i nostri esperti saranno a tua disposizione",
         "Completa il tuo ambiente"}

BLOCK = {"h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "dt", "dd", "figcaption", "td", "th",
         "button", "a", "div", "section", "article", "header", "ul", "ol", "table", "tr"}


def block_text(node, out):
    buf = []

    def flush():
        line = " ".join(" ".join(buf).split())
        if line:
            out.append(line)
        buf.clear()

    def rec(n):
        for child in n.children:
            if isinstance(child, str):
                buf.append(child)
            elif child.tag in scraper.SKIP_TEXT_TAGS:
                continue
            elif child.tag == "ul" and "list--materials" in child.cls():
                flush()
                imgs = sum(1 for x in scraper.walk(child) if x.tag == "img")
                out.append(f"[lista de acabados: {child.attrs.get('data-label', '').strip() or '—'} · {imgs} muestras (ver models.json)]")
            elif child.tag in BLOCK:
                flush()
                rec(child)
                flush()
            else:
                rec(child)

    rec(node)
    flush()


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    key = sys.argv[1]
    path = os.path.join(scraper.RAW_DIR, key + ".html")
    with open(path, encoding="utf-8") as f:
        root = scraper.parse_dom(f.read())
    page = scraper.first_desc(root, lambda n: n.tag == "div" and "app-page" in n.cls()) or root
    lines = []
    block_text(page, lines)
    seen, prev = set(), None
    for line in lines:
        if line.startswith("Se sei interessato a vedere e toccare con mano"):
            break  # dealer/appointment form follows: boilerplate, not product data
        if line == prev or (len(line) > 60 and line in seen) or line in NOISE:
            continue
        seen.add(line)
        prev = line
        print(line)
    with open(scraper.MODELS_OUT, encoding="utf-8") as f:
        model = next((m for m in json.load(f) if m["model_key"] == key), None)
    if model:
        print("\n--- models.json:", json.dumps({
            "url": model["url"], "catalog_refs": [r["product_id"] + " " + r["name"] for r in model["catalog_refs"]],
            "groups": [g["group"] for g in model["finish_groups"]],
            "collections": [f'{c["name"]} ({len(c["options"])})' for g in model["finish_groups"] for c in g["collections"]],
            "dimensions": [d["context"] for d in model["dimensions"]][:8],
        }, ensure_ascii=False))


if __name__ == "__main__":
    main()
