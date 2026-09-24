#!/usr/bin/env python3
"""
Official product-facts capture from febalcasa.com (docs/chatbot-v2, plan part 3).

For every distinct detail_url of the ACTIVE pieces in clients/febal-casa/catalog.json
this downloads the product page as plain static HTML (no JS — which also sidesteps
the site's real "page rotates to a random product after a few seconds" bug seen in a
browser), caches it under product-facts/raw-html/, and extracts RAW, SOURCED facts:

  - finish/upholstery groups -> collections -> options (label, code, swatch URLs and
    the swatch's average color, read from the site's own 1x1 "-1x1.jpg" thumbnail);
    both page layouts are handled: the modal layout (div.group > li.macro > span.caption
    + ul.list--materials) and the accordion layout (#accordionFinishings >
    span.tagline + ul.list--materials[data-label]);
  - descriptive text blocks, meta description, sections present;
  - dimensions (cm/mm with context), modularity codes (FSxxxxx), materials mentioned;
  - any caption stating which finish the photographed piece has (Edd's condition:
    only fall back to tour screenshots when the official page doesn't say it).

It never touches the runtime (clients/, packages/, server/): output goes only to
tour-project/febal-casa/product-facts/{models.json, scrape-report.json,
swatch-colors.json, raw-html/}. Every value is raw page data; nothing is inferred
here (material/color-family proposals are a separate, explicitly-labeled step).

Usage:
  python scripts/scrape-febal-facts.py              # uses the raw-html cache when present
  python scripts/scrape-febal-facts.py --refresh    # re-download every page
  python scripts/scrape-febal-facts.py --only melrose [--only camden]
"""
import argparse
import datetime as dt
import io
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
CATALOG_PATH = os.path.join(ROOT, "clients", "febal-casa", "catalog.json")
OUT_DIR = os.path.join(ROOT, "tour-project", "febal-casa", "product-facts")
RAW_DIR = os.path.join(OUT_DIR, "raw-html")
MODELS_OUT = os.path.join(OUT_DIR, "models.json")
REPORT_OUT = os.path.join(OUT_DIR, "scrape-report.json")
SWATCH_CACHE = os.path.join(OUT_DIR, "swatch-colors.json")
URL_OVERRIDES = os.path.join(OUT_DIR, "url-overrides.json")

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/128.0 Safari/537.36"
)
PAGE_DELAY_S = 1.0
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta",
        "param", "source", "track", "wbr"}
SKIP_TEXT_TAGS = {"script", "style", "svg", "noscript", "template"}
BOILERPLATE = re.compile(
    r"newsletter|iscriviti|cookie|privacy|©|p\.\s?iva|trova il rivenditore|store locator|"
    r"prenota un appuntamento|tutti i diritti", re.I)

# Words we record when the page mentions them (raw mention + context, no inference).
MATERIAL_TERMS = [
    "pelle", "ecopelle", "similpelle", "cuoio", "nabuk", "nubuck", "velluto", "tessuto",
    "microfibra", "lino", "cotone", "lana", "piuma", "poliuretano", "legno", "massello",
    "rovere", "noce", "frassino", "eucalipto", "acacia", "impiallacciato", "laccato",
    "nobilitato", "laminato", "vetro", "cristallo", "specchio", "metallo", "acciaio",
    "alluminio", "ottone", "ferro", "marmo", "supermarmo", "gres", "ceramica",
    "superceramica", "laminam", "neolith", "quarzo", "pietra", "corian", "rattan",
]
CAPTION_RE = re.compile(
    r"(in foto|nella foto|in figura|nell['’]immagine|foto:|immagine:|rivestimento in|"
    r"finitura in|versione in|nella versione)[^.<]{0,140}", re.I)
DIM_RE = re.compile(r"(\d{1,4}(?:[.,]\d{1,2})?)\s?(cm|mm)\b", re.I)
MODULARITY_RE = re.compile(r"\b(?:[A-Z0-9]+_)?FS\d{4,6}[A-Z]?\b")
TIER_RE = re.compile(r"CAT\.?\s*(\d+)", re.I)
CODE_TOKEN_RE = re.compile(r"^(?:[a-z]{0,2}\d{2,5}[a-z]?|\d[a-z]|[a-z]\d)$", re.I)
IMG_EXT_RE = re.compile(r"\.(jpe?g|png|webp|gif)$", re.I)


# ---------------------------------------------------------------- tiny DOM builder
class Node:
    __slots__ = ("tag", "attrs", "children", "parent")

    def __init__(self, tag, attrs, parent):
        self.tag = tag
        self.attrs = {k: (v or "") for k, v in attrs}
        self.children = []
        self.parent = parent

    def cls(self):
        return self.attrs.get("class", "").split()


class DomBuilder(HTMLParser):
    """Lenient tree builder: void tags never push, and an end tag closes the nearest
    matching open element (unmatched end tags are ignored) — enough for this site."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root", [], None)
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.stack[-1])
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag, attrs, self.stack[-1]))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def parse_dom(html):
    builder = DomBuilder()
    builder.feed(html)
    builder.close()
    return builder.root


def walk(node):
    yield node
    for child in node.children:
        if isinstance(child, Node):
            yield from walk(child)


def text_of(node):
    parts = []
    for child in node.children:
        if isinstance(child, str):
            parts.append(child)
        elif child.tag not in SKIP_TEXT_TAGS:
            parts.append(text_of(child))
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def ancestor(node, pred):
    p = node.parent
    while p is not None:
        if pred(p):
            return p
        p = p.parent
    return None


def first_desc(node, pred):
    for n in walk(node):
        if n is not node and pred(n):
            return n
    return None


# ---------------------------------------------------------------- helpers
def model_key_for(url):
    path = urllib.parse.urlparse(url).path.strip("/").split("/")
    if path and path[0] == "it":
        path = path[1:]
    if path and path[0] == "prodotti":
        path = path[1:]
    return "-".join(path) or "unknown"


def norm_url(u):
    return (u or "").strip().rstrip("/").lower()


def fetch(url, retries=2):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "it-IT,it;q=0.9"})
    last_err = None
    for attempt in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8", errors="replace"), resp.geturl()
        except Exception as err:  # noqa: BLE001 — network flakiness, retried then reported
            last_err = err
            time.sleep(2 * (attempt + 1))
    raise last_err


def swatch_1x1_url(small, full):
    """The site ships a 1x1 average-color thumbnail next to every swatch
    (<name>-1x1.jpg). Prefer the one in src; else derive it from data-src."""
    for candidate in (small, full):
        if candidate and "-1x1." in candidate:
            return candidate
    if full:
        return IMG_EXT_RE.sub(lambda m: "-1x1" + m.group(0), full)
    return None


def unmangle_alt(alt, swatch_url):
    """febalcasa.com builds swatch alts from the file name but drops every "_r"
    sequence: jolie_g050_rose.jpg -> "Jolie G050ose", oro_rosa.jpg -> "Oroosa",
    rimini_anthrancite_r074.jpg -> "RIMINI ANTHRANCITE074". When the alt equals a
    tail of the (intact) file stem minus "_r", the missing " r" is re-inserted into
    the alt itself, keeping the alt's own casing. Returns (text, source)."""
    cleaned = IMG_EXT_RE.sub("", (alt or "").strip())
    stem = IMG_EXT_RE.sub("", urllib.parse.unquote(os.path.basename(urllib.parse.urlparse(swatch_url or "").path)))
    stem = stem.lower().replace("-1x1", "").replace("-", "_").rstrip("_")
    alt_norm = re.sub(r"[\s\-]+", "_", cleaned.lower())
    if not stem or not alt_norm or stem.endswith(alt_norm) or "_r" not in stem:
        return cleaned, "alt"
    starts = [0] + [m.end() for m in re.finditer(r"_", stem)]
    for k in starts:
        tail = stem[k:]
        if tail.replace("_r", "") != alt_norm:
            continue
        out, i, j = [], 0, 0
        while i < len(tail):
            if tail.startswith("_r", i):
                nxt = cleaned[j] if j < len(cleaned) else ""
                out.append(" R" if nxt.isupper() else " r")
                i += 2
            else:
                out.append(cleaned[j] if j < len(cleaned) else tail[i])
                i += 1
                j += 1
        return "".join(out), "alt + 'r' restored from file name (site alt drops '_r')"
    return cleaned, "alt"


# Filename-only suffixes that leak into alts (e.g. "..._rid.jpg" = resized image).
FILE_SUFFIX_TOKENS = {"rid"}


def split_camel(tok):
    """"SupermarmoOpaco" -> ["Supermarmo", "Opaco"]; codes and plain words untouched."""
    if not tok.isalpha():
        return [tok]
    return re.sub(r"(?<=[^\W\d_])(?<![A-ZÀ-Þ])(?=[A-ZÀ-Þ])", " ", tok).split() or [tok]


def parse_alt(alt, collection, swatch_url=None):
    """Split a swatch alt text into (label, code, label_source). Real examples:
    "Azure F011", "CAMPSBAY450 BLUSH S1", "CITY C322 Pearl", "Eagle M2100 Black",
    "Colonna D001 Titan.JPG", "Medici060 Sand.JPG", "Grigio Perla"."""
    cleaned, source = unmangle_alt(alt, swatch_url)
    restored = source != "alt"
    coll_words = {w.lower() for w in re.split(r"[\s\-_/]+", collection or "") if w}
    codes, words = [], []
    tokens = [t for tok in cleaned.split() for t in split_camel(tok)]
    for tok in tokens:
        low = tok.lower()
        if low in coll_words:
            continue
        glued = re.match(r"^([a-z]+)(\d{2,5}[a-z]?)$", low)
        if glued and glued.group(1) in coll_words:
            codes.append(tok[len(glued.group(1)):].upper())
            continue
        if CODE_TOKEN_RE.match(tok):
            codes.append(tok.upper())
            continue
        words.append(tok)
    if restored and words and words[-1].lower() in FILE_SUFFIX_TOKENS:
        words.pop()
    label = " ".join(words).strip()
    if not label and not codes:
        # e.g. alt "Specchio" inside collection SPECCHIO: the option IS the plain one.
        label = cleaned
    if restored or label.isupper() or label.islower():
        label = " ".join(w[:1].upper() + w[1:].lower() if w.isalpha() else w for w in label.split())
    return label, (" ".join(codes) or None), source


# ---------------------------------------------------------------- extraction
def extract_finishes(root):
    groups = {}   # (group_name, layout) -> {"group":..., "tier":..., "layout":..., "collections":[...]}
    order = []
    seen = set()
    for ul in walk(root):
        if not (ul.tag == "ul" and "list--materials" in ul.cls()):
            continue
        collection = ul.attrs.get("data-label", "").strip()
        if not collection and ul.parent is not None:
            for sib in ul.parent.children:
                if isinstance(sib, Node) and sib.tag == "span" and {"caption", "tagline", "label"} & set(sib.cls()):
                    collection = text_of(sib)
                    break
        layout, group_name = None, None
        acc = ancestor(ul, lambda n: n.tag == "li" and "accordion-item" in n.cls())
        if acc is not None:
            layout = "accordion"
            btn = first_desc(acc, lambda n: n.tag == "button" and "accordion-button" in n.cls())
            group_name = text_of(btn) if btn else None
        else:
            grp = ancestor(ul, lambda n: n.tag == "div" and "group" in n.cls())
            if grp is not None:
                layout = "modal-group"
                title = first_desc(grp, lambda n: n.tag == "span" and "title" in n.cls())
                group_name = text_of(title) if title else None
        options = []
        for img in walk(ul):
            if img.tag != "img":
                continue
            alt = img.attrs.get("alt", "").strip()
            small = img.attrs.get("src") or None
            full = img.attrs.get("data-src") or small
            li = ancestor(img, lambda n: n.tag == "li")
            li_label = None
            if li is not None:
                lab = first_desc(li, lambda n: n.tag == "span" and "label" in n.cls())
                li_label = text_of(lab) if lab else None
            key = (group_name, collection or li_label, alt, full)
            if key in seen:
                continue
            seen.add(key)
            label, code, label_source = parse_alt(alt, collection or li_label or "", full)
            options.append({
                "label": label or None,
                "code": code,
                "label_source": label_source,
                "alt_raw": alt,
                "swatch_url": full,
                "swatch_1x1_url": swatch_1x1_url(small, full),
                "swatch_hex": None,
            })
        if not options:
            continue
        gkey = (group_name, layout)
        if gkey not in groups:
            tier = TIER_RE.search(group_name or "")
            groups[gkey] = {"group": group_name, "tier": int(tier.group(1)) if tier else None,
                            "layout": layout, "collections": []}
            order.append(gkey)
        groups[gkey]["collections"].append({"name": collection or None, "options": options})
    return [groups[k] for k in order]


def extract_texts(root):
    blocks, seen = [], set()
    for n in walk(root):
        if n.tag in SKIP_TEXT_TAGS:
            continue
        if n.tag == "p" or (n.tag in ("h1", "h2", "h3", "h4")):
            t = text_of(n)
            if len(t) < 25 or BOILERPLATE.search(t) or t in seen:
                continue
            seen.add(t)
            blocks.append({"tag": n.tag, "text": t})
    return blocks


def meta_content(root, **match):
    for n in walk(root):
        if n.tag == "meta" and all(n.attrs.get(k) == v for k, v in match.items()):
            return n.attrs.get("content") or None
    return None


def visible_text(root):
    body = first_desc(root, lambda n: n.tag == "body") or root
    return text_of(body)


def extract_product_images(root):
    urls, seen = [], set()
    og = meta_content(root, property="og:image")
    if og:
        urls.append(og)
        seen.add(og)
    for n in walk(root):
        if n.tag != "img":
            continue
        u = n.attrs.get("data-src") or n.attrs.get("src") or ""
        if "/wp-content/uploads/" not in u or "/finishes/" in u or "-1x1." in u or u.endswith(".svg"):
            continue
        if u not in seen:
            seen.add(u)
            urls.append(u)
    return urls[:40]


def context_hits(regex, text, width=60, limit=30):
    hits, seen = [], set()
    for m in regex.finditer(text):
        ctx = text[max(0, m.start() - width): m.end() + width].strip()
        if ctx in seen:
            continue
        seen.add(ctx)
        hits.append({"match": m.group(0).strip(), "context": ctx})
        if len(hits) >= limit:
            break
    return hits


def extract_facts(html):
    root = parse_dom(html)
    title_node = first_desc(root, lambda n: n.tag == "title")
    canonical = None
    for n in walk(root):
        if n.tag == "link" and n.attrs.get("rel") == "canonical":
            canonical = n.attrs.get("href")
            break
    text = visible_text(root)
    low = text.lower()
    materials = {}
    for term in MATERIAL_TERMS:
        found = [m.start() for m in re.finditer(r"\b" + re.escape(term) + r"\b", low)]
        if found:
            i = found[0]
            materials[term] = {"count": len(found), "example": text[max(0, i - 60): i + 60].strip()}
    sections = [s for s in ("Rivestimenti", "Finiture", "Modularità", "Composizion", "Dettagli esclusivi",
                            "I componenti", "Imbottitur", "Dimensioni", "Misure", "Designer")
                if s.lower() in low]
    finish_groups = extract_finishes(root)
    h1 = first_desc(root, lambda n: n.tag == "h1")
    return {
        "page_title": text_of(title_node) if title_node else None,
        "heading": text_of(h1) if h1 else None,
        "canonical": canonical,
        "meta_description": meta_content(root, name="description") or meta_content(root, property="og:description"),
        "sections_present": sections,
        "text_blocks": extract_texts(root)[:60],
        "finish_groups": finish_groups,
        "dimensions": context_hits(DIM_RE, text),
        "modularity_codes": sorted(set(MODULARITY_RE.findall(html))),
        "materials_mentioned": materials,
        "photo_captions_stating_finish": context_hits(CAPTION_RE, text, width=20, limit=20),
        "images": extract_product_images(root),
    }


# ---------------------------------------------------------------- swatch colors
def load_swatch_cache():
    if os.path.exists(SWATCH_CACHE):
        with open(SWATCH_CACHE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def read_swatch_hex(url):
    from PIL import Image  # Pillow — already installed on this machine (12.x)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = resp.read()
        im = Image.open(io.BytesIO(data)).convert("RGB")
        if im.size != (1, 1):
            im = im.resize((1, 1), Image.LANCZOS)
        r, g, b = im.getpixel((0, 0))
        return "#%02x%02x%02x" % (r, g, b)
    except Exception as err:  # noqa: BLE001 — recorded, never fatal
        return "error:" + type(err).__name__


def fill_swatch_colors(models):
    cache = load_swatch_cache()
    wanted = sorted({o["swatch_1x1_url"] for m in models for g in m["finish_groups"]
                     for c in g["collections"] for o in c["options"]
                     if o["swatch_1x1_url"] and not str(cache.get(o["swatch_1x1_url"], "error")).startswith("#")})
    if wanted:
        print(f"swatches: fetching {len(wanted)} thumbnails (1x1) ...", flush=True)
        with ThreadPoolExecutor(max_workers=6) as pool:
            for url, hx in zip(wanted, pool.map(read_swatch_hex, wanted)):
                cache[url] = hx
        with open(SWATCH_CACHE, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=1, sort_keys=True)
    for m in models:
        for g in m["finish_groups"]:
            for c in g["collections"]:
                for o in c["options"]:
                    hx = cache.get(o["swatch_1x1_url"] or "")
                    o["swatch_hex"] = hx if hx and hx.startswith("#") else None


# ---------------------------------------------------------------- main
def load_url_overrides():
    """product-facts/url-overrides.json: {product_id: {"url": ..., "old_url": ..., "evidence": ..., "date": ...}}.
    Fixes wrong catalog links without editing the runtime catalog."""
    if not os.path.exists(URL_OVERRIDES):
        return {}
    with open(URL_OVERRIDES, encoding="utf-8") as f:
        return {pid: (v.get("url") or "").strip() for pid, v in json.load(f).items()}


def load_models_to_scrape():
    with open(CATALOG_PATH, encoding="utf-8") as f:
        catalog = json.load(f)
    overrides = load_url_overrides()
    by_url, no_url = {}, []
    for p in catalog:
        if not p.get("active"):
            continue
        url = overrides.get(p["product_id"]) or (p.get("detail_url") or "").strip()
        ref = {"product_id": p["product_id"], "name": p["name"], "category": p["category"],
               "section": p["section"]}
        if not url:
            no_url.append(ref)
            continue
        by_url.setdefault(url, []).append(ref)
    return by_url, no_url


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--refresh", action="store_true", help="re-download pages even if cached")
    ap.add_argument("--only", action="append", default=[], help="model_key(s) to process")
    args = ap.parse_args()

    os.makedirs(RAW_DIR, exist_ok=True)
    by_url, no_url = load_models_to_scrape()
    previous = {}
    if args.only and os.path.exists(MODELS_OUT):
        with open(MODELS_OUT, encoding="utf-8") as f:
            previous = {m["model_key"]: m for m in json.load(f)}

    models, report = [], {"generated_at": None, "models": [], "pieces_without_url": no_url}
    keys = [(model_key_for(u), u) for u in by_url]
    dupes = {k for k, _ in keys if [kk for kk, _ in keys].count(k) > 1}
    if dupes:
        sys.exit(f"model_key collision, fix model_key_for(): {sorted(dupes)}")

    for i, (key, url) in enumerate(sorted(keys)):
        if args.only and key not in args.only:
            if key in previous:
                models.append(previous[key])
            continue
        raw_path = os.path.join(RAW_DIR, key + ".html")
        entry = {"model_key": key, "url": url, "status": "ok", "notes": []}
        html, final_url, fetched = None, url, False
        if os.path.exists(raw_path) and not args.refresh:
            with open(raw_path, encoding="utf-8") as f:
                html = f.read()
        else:
            try:
                html, final_url = fetch(url)
                fetched = True
            except Exception as err:  # noqa: BLE001
                entry.update(status="fetch_error", notes=[repr(err)])
                report["models"].append(entry)
                print(f"[{i + 1}/{len(keys)}] {key}: FETCH ERROR {err!r}", flush=True)
                continue
        facts = extract_facts(html)
        integrity_ok = (facts["canonical"] is None) or (norm_url(facts["canonical"]) in (norm_url(url), norm_url(final_url)))
        if norm_url(final_url) != norm_url(url):
            entry["notes"].append(f"redirected to {final_url}")
        if not integrity_ok and fetched:
            # One retry: the site has a real "serves another product" bug in-browser.
            time.sleep(PAGE_DELAY_S)
            html, final_url = fetch(url)
            facts = extract_facts(html)
            integrity_ok = (facts["canonical"] is None) or (norm_url(facts["canonical"]) in (norm_url(url), norm_url(final_url)))
            entry["notes"].append("refetched after canonical mismatch")
        if fetched or not os.path.exists(raw_path):
            with open(raw_path, "w", encoding="utf-8") as f:
                f.write(html)
        n_coll = sum(len(g["collections"]) for g in facts["finish_groups"])
        n_opt = sum(len(c["options"]) for g in facts["finish_groups"] for c in g["collections"])
        missing = []
        if not facts["finish_groups"]:
            missing.append("finishes")
        if not facts["dimensions"]:
            missing.append("dimensions")
        if not integrity_ok:
            entry["status"] = "integrity_mismatch"
            entry["notes"].append(f"canonical={facts['canonical']}")
        model = {
            "model_key": key,
            "url": url,
            "final_url": final_url,
            "scraped_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "febalcasa.com (static HTML)",
            "raw_html": os.path.relpath(raw_path, OUT_DIR).replace("\\", "/"),
            "integrity_ok": integrity_ok,
            "catalog_refs": by_url[url],
            **facts,
            "counts": {"groups": len(facts["finish_groups"]), "collections": n_coll, "options": n_opt},
            "missing": missing,
        }
        models.append(model)
        entry.update(counts=model["counts"], missing=missing,
                     photo_captions=len(facts["photo_captions_stating_finish"]))
        report["models"].append(entry)
        print(f"[{i + 1}/{len(keys)}] {key}: groups={model['counts']['groups']} "
              f"collections={n_coll} options={n_opt} dims={len(facts['dimensions'])} "
              f"captions={len(facts['photo_captions_stating_finish'])} "
              f"{'' if integrity_ok else 'INTEGRITY-MISMATCH'}", flush=True)
        if fetched:
            time.sleep(PAGE_DELAY_S)

    fill_swatch_colors(models)
    models.sort(key=lambda m: m["model_key"])
    with open(MODELS_OUT, "w", encoding="utf-8") as f:
        json.dump(models, f, ensure_ascii=False, indent=1)
    report["generated_at"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    report["totals"] = {
        "urls": len(keys),
        "scraped": len(models),
        "with_finishes": sum(1 for m in models if m["finish_groups"]),
        "without_finishes": [m["model_key"] for m in models if not m["finish_groups"]],
        "with_dimensions": sum(1 for m in models if m["dimensions"]),
        "with_photo_captions": [m["model_key"] for m in models if m["photo_captions_stating_finish"]],
        "integrity_mismatch": [m["model_key"] for m in models if not m["integrity_ok"]],
        "options_total": sum(m["counts"]["options"] for m in models),
        "swatches_without_color": sum(1 for m in models for g in m["finish_groups"] for c in g["collections"]
                                      for o in c["options"] if not o["swatch_hex"]),
    }
    with open(REPORT_OUT, "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    print(json.dumps(report["totals"], ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
