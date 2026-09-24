#!/usr/bin/env python3
"""
Builds the review workbook for the client (Andrea) and Edd from the v2 sources:

  clients/febal-casa/catalog.v2.json            (compiled catalog: models, exhibits, options, facts)
  tour-project/febal-casa/product-facts/*.json  (placements = captures, model-attributes, url-overrides)
  .scratch/ontology.json                        (npx tsx scripts/v2-export-ontology.mts > .scratch/ontology.json)

Every reviewable row has "¿OK?" (SI/NO), "Corrección" and "Nota" columns plus a hidden
fact_ids column, so scripts/import-review-xlsx.py can turn the filled workbook into
tour-project/febal-casa/product-facts/review.reviewed.json (what build-catalog-v2 reads).

    python scripts/build-review-xlsx.py [output.xlsx]
"""
import datetime as dt
import json
import os
import re
import sys
from collections import defaultdict

from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.formatting.rule import CellIsRule, FormulaRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FACTS = os.path.join(ROOT, "tour-project", "febal-casa", "product-facts")
CAPTURES = os.path.join(FACTS, "captures")
THUMBS = os.path.join(ROOT, ".scratch", "review-thumbs")
TODAY = dt.date.today().isoformat()
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser("~"), "Downloads", f"febal-casa-revision-{TODAY}.xlsx")


def load(*parts):
    with open(os.path.join(*parts), encoding="utf-8") as f:
        return json.load(f)


cat = load(ROOT, "clients", "febal-casa", "catalog.v2.json")
v1 = {p["product_id"]: p for p in load(ROOT, "clients", "febal-casa", "catalog.json")}
placements = {p["product_id"]: p for p in load(FACTS, "placements.json")}
attrs = {a["model_key"]: a for a in load(FACTS, "model-attributes.json")}
overrides = load(FACTS, "url-overrides.json")
onto = load(ROOT, ".scratch", "ontology.json")
concepts = {c["id"]: c for c in onto["concepts"]}
fact_ids = {f["id"] for f in cat["facts"]}
models = {m["id"]: m for m in cat["models"]}
exhibits = {e["id"]: e for e in cat["exhibits"]}


def es(cid):
    c = concepts.get(cid)
    return c["labels"]["es"] if c else cid


def es_list(ids):
    return ", ".join(es(i) for i in ids or [])


def txt(v):
    if isinstance(v, list):
        return "; ".join(str(txt(x)) for x in v)
    if isinstance(v, dict):
        return "; ".join(f"{k}: {txt(x)}" for k, x in v.items())
    return "" if v is None else v


def mat_summary(conf):
    dom = [es(c["material"]) for c in conf if c["dominant"] and c.get("material")]
    other = [es(c["material"]) for c in conf if not c["dominant"] and c.get("material")]
    parts = [dom[0] if dom else ("sin confirmar" if other else "")]
    if other:
        parts.append("otras partes: " + ", ".join(other))
    return " · ".join(x for x in parts if x)


def attr_ids(a):
    return a.get("value") or [] if a and a.get("status") == "known" else []


# ------------------------------------------------------------------ styling
RED = "C8102E"
HEAD = PatternFill("solid", fgColor=RED)
HEAD_FONT = Font(bold=True, color="FFFFFF")
REVIEW = PatternFill("solid", fgColor="FFF4CC")      # review columns (filled by the reviewer)
ERROR = PatternFill("solid", fgColor="F8D7DA")       # an ERROR note on this row
DOUBT = PatternFill("solid", fgColor="FFE8B3")       # open question on this row
CONFIRM = PatternFill("solid", fgColor="E4EDF8")     # SI/NO data columns: soft blue
# Any NO turns fluorescent (conditional format, so a NO typed later in "¿OK?" lights up too).
NEON = PatternFill(start_color="CCFF00", end_color="CCFF00", fill_type="solid")
NAME_RE = re.compile(r"Andrea|\bEdd\b")
WRAP = Alignment(wrap_text=True, vertical="top")
THIN = Border(bottom=Side(style="thin", color="DDDDDD"))

wb = Workbook()


def sheet(title, headers, widths, review_cols=0, hidden_cols=0):
    ws = wb.create_sheet(title)
    ws.append(headers)
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    for cell in ws[1]:
        cell.fill, cell.font, cell.alignment = HEAD, HEAD_FONT, Alignment(wrap_text=True, vertical="center")
    ws.row_dimensions[1].height = 32
    ws.freeze_panes = "C2"
    ws._review = (len(headers) - review_cols - hidden_cols + 1, len(headers) - hidden_cols) if review_cols else None
    ws._hidden = hidden_cols
    return ws


def finish(ws):
    n = ws.max_row
    ws.auto_filter.ref = f"A1:{get_column_letter(ws.max_column)}{n}"
    for row in ws.iter_rows(min_row=2, max_row=n):
        for cell in row:
            cell.alignment = WRAP
            cell.border = THIN
    if ws._review:
        a, b = ws._review
        dv = DataValidation(type="list", formula1='"SI,NO"', allow_blank=True)
        ws.add_data_validation(dv)
        dv.add(f"{get_column_letter(a)}2:{get_column_letter(a)}{n}")
        for r in range(2, n + 1):
            for col in range(a, b + 1):
                ws.cell(r, col).fill = REVIEW
        L = get_column_letter(a)
        ws.conditional_formatting.add(f"{L}2:{L}{n}", CellIsRule(operator="equal", formula=['"NO"'], fill=NEON))
    for i in range(ws._hidden):
        ws.column_dimensions[get_column_letter(ws.max_column - i)].hidden = True


def link(cell, url, text=None):
    if url:
        cell.value = text or url
        cell.hyperlink = url
        cell.font = Font(color="0563C1", underline="single")


def yn_cols(ws, cols, prefix_cols=()):
    """SI/NO data columns: soft tint; any NO (or a cell that starts with "NO ·") fluorescent."""
    n = ws.max_row
    for col in (*cols, *prefix_cols):
        L = get_column_letter(col)
        for r in range(2, n + 1):
            ws.cell(r, col).fill = CONFIRM
        rule = (FormulaRule(formula=[f'LEFT(TRIM({L}2),2)="NO"'], fill=NEON) if col in prefix_cols
                else CellIsRule(operator="equal", formula=['"NO"'], fill=NEON))
        ws.conditional_formatting.add(f"{L}2:{L}{n}", rule)


def thumb(pid):
    src = os.path.join(CAPTURES, f"{pid}-ui.png")
    if not os.path.exists(src):
        src = os.path.join(CAPTURES, f"{pid}.png")
    if not os.path.exists(src):
        return None
    os.makedirs(THUMBS, exist_ok=True)
    dst = os.path.join(THUMBS, f"{pid}.jpg")
    with Image.open(src) as im:
        im = im.convert("RGB")
        im.thumbnail((300, 190))
        im.save(dst, "JPEG", quality=80)
    img = XLImage(dst)
    return img


# ------------------------------------------------------------------ Léeme
pl = list(placements.values())
count = lambda key, v: sum(1 for p in pl if (p[key]["confirmado"] if isinstance(p[key], dict) else p[key]) == v)
errors = [p for p in pl if any(n.startswith("ERROR") for n in p["notas"])]
v1_errors = [p for p in pl if any(n.startswith("ERROR") and "catálogo v1" in n for n in p["notas"])]
doubts = [p for p in pl if any(n.startswith("DUDA") for n in p["notas"])]

ws = wb.active
ws.title = "Léeme"
ws.column_dimensions["A"].width = 120
lines = [
    ("Febal Casa · revisión de datos del asistente (v2)", Font(bold=True, size=16, color=RED)),
    (f"Generado el {TODAY}. Para revisar y devolver con las columnas amarillas llenas.", None),
    ("", None),
    ("Qué es este archivo", Font(bold=True, size=12)),
    ("Todo lo que el asistente puede decir de cada mueble sale de aquí. Hasta que se revise, nada cuenta como verdad definitiva (hechos validados: 0).", None),
    ("Cada dato es binario: SI = confirmado con evidencia literal (captura del tour o texto de la ficha oficial); NO = no se pudo confirmar, y el asistente dirá que no está confirmado en vez de inventarlo.", None),
    ("", None),
    ("Cómo revisar", Font(bold=True, size=12)),
    ("1. Las columnas amarillas son para la revisión: «¿OK?» (elegir SI o NO), «Corrección» (el valor correcto) y «Nota».", None),
    ("2. Basta revisar lo que esté mal; una fila sin marcar sigue como pendiente.", None),
    ("3. En «Piezas», fila roja = ERROR detectado (dato del catálogo anterior que la captura corrigió, ficha mal enlazada o punto de vista mal encuadrado); fila naranja = DUDA abierta. Cada nota dice de qué es el error o la duda.", None),
    ("4. Hoja «Sinónimos»: todas las palabras que el asistente entiende para forma, color, material, estilo y categoría. Se pueden agregar o quitar sinónimos en las columnas amarillas.", None),
    ("5. Hoja «Armonías»: qué colores combinan (borrador de diseño). El asistente solo lo usa como propuesta hasta que se apruebe.", None),
    ("6. Acabados: «Opciones oficiales» trae solo las listas propias de cada modelo (esas el asistente sí las ofrece bajo pedido), en el orden en que se recorre el tour. Las paletas que la web repite igual en varias fichas están en «Paletas por confirmar» (una fila por paleta: ¿aplica de verdad a esos modelos?) y en «Paletas genéricas» (cada opción una sola vez). Mientras una paleta no se confirme, el asistente no la ofrece como opción segura y remite a la ficha.", None),
    ("7. Colores: las columnas de datos SI/NO van en azul suave; cualquier NO se resalta en verde fosforescente, también el que se marque en «¿OK?».", None),
    ("", None),
    ("Regla de disponibilidad (ya implementada)", Font(bold=True, size=12)),
    ("Si un color, acabado o variante no está físicamente en el tour pero la ficha oficial sí lo ofrece, el asistente dice que en el showroom no está así, que sí está disponible bajo pedido, y enlaza la ficha oficial.", None),
    ("", None),
    ("Resumen de las capturas (88 piezas del tour, una por una desde su punto de vista)", Font(bold=True, size=12)),
    (f"Pieza visible en su punto de vista: {count('visible', 'SI')}/88 · Color confirmado: {count('color', 'SI')}/88 · Material confirmado: {count('material', 'SI')}/88 · Forma confirmada: {count('forma', 'SI')}/88 · Opción oficial exacta identificada: {count('opcion_oficial', 'SI')}/88", None),
    (f"Errores detectados: {len(errors)} ({len(v1_errors)} del catálogo anterior, ya corregidos) · Dudas abiertas: {len(doubts)}", None),
    ("__OPTIONS_SUMMARY__", None),
    ("", None),
    ("Hojas", Font(bold=True, size=12)),
    ("Piezas (88) · Modelos · Opciones oficiales · Paletas por confirmar · Paletas genéricas · Sinónimos · Colores → familia · Materiales por colección · Estilos · Armonías · Ánimos · Errores · Preguntas abiertas", None),
]
for i, (text, font) in enumerate(lines, start=1):
    c = ws.cell(i, 1, text)
    c.alignment = Alignment(wrap_text=True, vertical="top")
    if font:
        c.font = font

# ------------------------------------------------------------------ Piezas
H = ["ID", "Pieza", "Zona", "Modelo", "Ficha oficial", "Captura (con marcador)", "Visible en su punto de vista",
     "Color ¿confirmado?", "Color visto", "Familia de color", "Evidencia del color",
     "Material ¿confirmado?", "Material visto", "Material (concepto: dominante · otras partes)", "Evidencia del material",
     "Forma ¿confirmada?", "Forma vista", "Forma (conceptos)", "Evidencia de la forma",
     "Opción oficial ¿identificada?", "Opción oficial / candidatas", "Evidencia de la opción",
     "Componentes vistos", "Notas y dudas", "Descripción (catálogo v1)",
     "¿OK?", "Corrección", "Nota", "fact_ids"]
W = [9, 22, 16, 22, 14, 44, 10, 10, 20, 16, 40, 10, 22, 18, 40, 10, 26, 22, 30, 10, 30, 36, 44, 50, 50, 8, 30, 30, 20]
ws = sheet("Piezas (88)", H, W, review_cols=3, hidden_cols=1)
for r, pid in enumerate(sorted(placements), start=2):
    p, e = placements[pid], exhibits[pid]
    m = models.get(e["model_id"], {})
    conf = e["configuration"].get("value") or []
    dom = next((c for c in conf if c["dominant"]), None)
    comps = "; ".join(f"{c['rol']}{' (dominante)' if c.get('dominante') else ''}: {c.get('color') or '—'}{' · ' + c['material'] if c.get('material') else ''}" for c in p["componentes"])
    fids = [f for f in (f"F-{pid}-conf", f"F-{pid}-shape") if f in fact_ids]
    row = [pid, p["name"], p["section"], m.get("name", e["model_id"]), None, None, p["visible"],
           p["color"]["confirmado"], p["color"]["valor"], es_list(dom["color_family"]) if dom else "", p["color"]["evidencia"],
           p["material"]["confirmado"], p["material"]["valor"] if p["material"]["confirmado"] == "SI" else (p["material"]["valor"] or ""), mat_summary(conf), p["material"]["evidencia"],
           p["forma"]["confirmado"], p["forma"]["valor"], es_list(attr_ids(e["shape_as_shown"])), p["forma"]["evidencia"],
           p["opcion_oficial"]["confirmado"], p["opcion_oficial"]["valor"], p["opcion_oficial"]["evidencia"],
           comps, "\n".join(p["notas"]), v1.get(pid, {}).get("description") or "",
           None, None, None, ",".join(fids)]
    ws.append(row)
    link(ws.cell(r, 5), m.get("official_url"), "ficha ↗")
    img = thumb(pid)
    if img:
        ws.add_image(img, f"F{r}")
        ws.row_dimensions[r].height = 150
    fill = ERROR if any(n.startswith("ERROR") for n in p["notas"]) else DOUBT if any(n.startswith("DUDA") for n in p["notas"]) else None
    if fill:
        for col in (1, 2, 24):
            ws.cell(r, col).fill = fill
yn_cols(ws, (7, 8, 12, 16, 20))
finish(ws)

# ------------------------------------------------------------------ Modelos
pieces_of = defaultdict(list)
for e in cat["exhibits"]:
    pieces_of[e["model_id"]].append(e["id"])
H = ["Modelo", "Nombre", "Categoría", "Ficha oficial", "Piezas en el tour",
     "Forma ¿confirmada?", "Forma (texto ficha)", "Forma (conceptos)", "Evidencia forma",
     "Materiales ¿confirmados?", "Materiales (texto ficha)", "Materiales (conceptos)", "Evidencia materiales",
     "Estilo ¿confirmado?", "Estilo (texto ficha)", "Estilo (conceptos)", "Evidencia estilo",
     "Medidas ¿confirmadas?", "Medidas", "Lista de acabados", "Opciones en el texto de la ficha",
     "Descripción oficial", "Notas", "¿OK?", "Corrección", "Nota", "fact_ids"]
W = [26, 24, 16, 12, 16, 10, 26, 20, 36, 10, 26, 20, 36, 10, 24, 20, 36, 10, 40, 40, 40, 50, 40, 8, 30, 30, 20]
ws = sheet("Modelos", H, W, review_cols=3, hidden_cols=1)
for r, key in enumerate(sorted(attrs), start=2):
    a, m = attrs[key], models.get(key, {})
    g = lambda k: a.get(k) or {"confirmado": "", "valor": "", "evidencia": ""}
    fids = [f for f in (f"F-{key}-shape", f"F-{key}-style", f"F-{key}-materials", f"F-{key}-dims") if f in fact_ids]
    ws.append([key, m.get("name", key), es(m.get("category")) if m.get("category") else "", None, ", ".join(pieces_of.get(key, [])) or "(sin pieza en el tour)",
               txt(g("forma")["confirmado"]), txt(g("forma")["valor"]), es_list(attr_ids(m.get("shapes"))), txt(g("forma")["evidencia"]),
               txt(g("materiales")["confirmado"]), txt(g("materiales")["valor"]), es_list(attr_ids(m.get("materials"))), txt(g("materiales")["evidencia"]),
               txt(g("estilo")["confirmado"]), txt(g("estilo")["valor"]), es_list(attr_ids(m.get("styles"))), txt(g("estilo")["evidencia"]),
               txt(g("medidas")["confirmado"]), txt(g("medidas")["valor"]), f"{txt(g("lista_acabados")["confirmado"])} · {txt(g("lista_acabados")["valor"])}",
               "\n".join(a.get("opciones_en_texto") or []), m.get("description_it") or "", "\n".join(a.get("notas") or []),
               None, None, None, ",".join(fids)])
    link(ws.cell(r, 4), a.get("url") or m.get("official_url"), "ficha ↗")
yn_cols(ws, (6, 10, 14, 18), prefix_cols=(20,))
finish(ws)

# ------------------------------------------------------------------ Opciones oficiales (only model / text lists)
SCOPE = {"model": "lista propia del modelo", "text": "nombrada en el texto de la ficha", "generic_palette": "paleta genérica"}
TONE = {"light": "claro", "mid": "medio", "dark": "oscuro"}
ZONES = ["CASA 01", "CASA 02", "CASA 03", "CASA 04", "GALLERIA"]
zone_rank = lambda z: next((i for i, p in enumerate(ZONES) if z.upper().startswith(p)), 9)
exhibits_of = defaultdict(list)
for e in cat["exhibits"]:
    exhibits_of[e["model_id"]].append(e)
tour_order = lambda m: min(((zone_rank(e["zone"]), e["id"]) for e in exhibits_of.get(m["id"], [])), default=(99, m["id"]))
pieces_txt = lambda mid: ", ".join(f"{e['id']} ({e['zone'].split(' - ')[0].title()})" for e in sorted(exhibits_of.get(mid, []), key=lambda e: e["id"])) or "(sin pieza en el tour)"


def swatch(ws, r, col, hexv):
    if re.fullmatch(r"#[0-9a-fA-F]{6}", hexv or ""):
        ws.cell(r, col).fill = PatternFill("solid", fgColor=hexv[1:].upper())


H = ["Modelo", "Piezas en el tour", "Grupo", "Colección", "Material de la colección", "Alcance", "Opción", "Código", "Muestra", "Hex",
     "Familia de color propuesta", "Tono", "¿OK?", "Corrección", "Nota", "fact_ids"]
W = [24, 22, 18, 26, 18, 18, 26, 10, 9, 10, 22, 8, 8, 26, 26, 20]
ws = sheet("Opciones oficiales", H, W, review_cols=3, hidden_cols=1)
r = 1
for m in sorted(cat["models"], key=tour_order):
    for grp in m["option_groups"]:
        if grp["scope"] == "generic_palette":
            continue
        for o in grp["options"]:
            r += 1
            hexv = (o.get("swatch") or {}).get("hex") or ""
            mat = o.get("material") or grp.get("material")
            ws.append([m["name"], pieces_txt(m["id"]), grp.get("group_title") or "", grp.get("name") or "", es(mat) if mat else "",
                       SCOPE.get(grp["scope"], grp["scope"]), o["official_name"], o.get("code") or "", "", hexv,
                       es_list(o.get("color_family")), TONE.get(o.get("tone") or "", o.get("tone") or ""),
                       None, None, None, o.get("fact") or grp.get("fact") or ""])
            swatch(ws, r, 9, hexv)
finish(ws)
ws.freeze_panes = "H2"

# ------------------------------------------------------------------ generic palettes, deduplicated
palettes = {}   # collection -> titles, models, group ids, options (each once)
for m in sorted(cat["models"], key=tour_order):
    for grp in m["option_groups"]:
        if grp["scope"] != "generic_palette":
            continue
        # Same collection name AND same options = the same palette (armadi vs letti lists differ).
        key = ((grp.get("name") or "").strip().upper(), tuple(sorted(o["official_name"].strip().lower() for o in grp["options"])))
        pal = palettes.setdefault(key, {"titles": [], "models": [], "groups": [], "options": {}})
        if grp.get("group_title") and grp["group_title"] not in pal["titles"]:
            pal["titles"].append(grp["group_title"])
        if m["id"] not in pal["models"]:
            pal["models"].append(m["id"])
        pal["groups"].append(grp["id"])
        for o in grp["options"]:
            k = o["official_name"].strip().lower()
            row = pal["options"].setdefault(k, {"o": o, "mat": o.get("material") or grp.get("material"), "models": [], "facts": set()})
            if m["id"] not in row["models"]:
                row["models"].append(m["id"])
            row["facts"].add(grp["fact"])
model_label = lambda mid: f"{models[mid]['name']} ({', '.join(e['id'] for e in sorted(exhibits_of.get(mid, []), key=lambda e: e['id'])) or 'sin pieza'})"

H = ["Paleta (colección)", "Títulos en la web", "Opciones distintas", "Aparece en estos modelos (piezas del tour)",
     "¿Aplica de verdad a todos estos modelos?", "Modelos donde NO aplica", "Nota", "group_ids"]
W = [28, 34, 10, 70, 16, 34, 30, 20]
ws = sheet("Paletas por confirmar", H, W, review_cols=3, hidden_cols=1)
for key, pal in sorted(palettes.items(), key=lambda kv: (-len(kv[1]["models"]), kv[0][0], " ".join(kv[1]["titles"]))):
    ws.append([key[0].title(), " · ".join(pal["titles"]), len(pal["options"]), "\n".join(model_label(mid) for mid in pal["models"]),
               None, None, None, ",".join(pal["groups"])])
finish(ws)

H = ["Paleta (colección)", "Material de la colección", "Opción", "Código", "Muestra", "Hex", "Familia de color propuesta", "Tono",
     "Aparece en", "¿OK?", "Corrección", "Nota", "fact_ids"]
W = [24, 18, 26, 10, 9, 10, 22, 8, 50, 8, 26, 26, 20]
ws = sheet("Paletas genéricas", H, W, review_cols=3, hidden_cols=1)
r = 1
for key, pal in sorted(palettes.items(), key=lambda kv: (-len(kv[1]["models"]), kv[0][0], " ".join(kv[1]["titles"]))):
    for k, row in sorted(pal["options"].items()):
        r += 1
        o = row["o"]
        hexv = (o.get("swatch") or {}).get("hex") or ""
        ws.append([key[0].title(), es(row["mat"]) if row["mat"] else "", o["official_name"], o.get("code") or "", "", hexv,
                   es_list(o.get("color_family")), TONE.get(o.get("tone") or "", o.get("tone") or ""),
                   f"{len(row['models'])} modelos: " + ", ".join(models[mid]["name"] for mid in row["models"]),
                   None, None, None, ",".join(sorted(row["facts"]))])
        swatch(ws, r, 5, hexv)
finish(ws)
ws.freeze_panes = "D2"
generic_unique = sum(len(p["options"]) for p in palettes.values())

# ------------------------------------------------------------------ Sinónimos
FACET_ES = {"shape": "forma", "color": "color", "material": "material", "style": "estilo", "category": "categoría", "mood": "ánimo", "tone": "tono"}
ORDER = ["shape", "color", "material", "style", "category", "mood", "tone"]
H = ["Faceta", "Concepto", "Nombre (es)", "Nome (it)", "Name (en)", "Es un tipo de", "Sinónimos es", "Sinonimi it", "Synonyms en", "Nota interna",
     "¿OK?", "Agregar sinónimos", "Quitar sinónimos", "Nota"]
W = [11, 22, 18, 18, 18, 16, 50, 45, 45, 36, 8, 30, 30, 26]
ws = sheet("Sinónimos", H, W, review_cols=4)
for c in sorted(onto["concepts"], key=lambda c: (ORDER.index(c["facet"]) if c["facet"] in ORDER else 99, c["id"])):
    s = c.get("synonyms", {})
    ws.append([FACET_ES.get(c["facet"], c["facet"]), c["id"], c["labels"]["es"], c["labels"]["it"], c["labels"]["en"],
               es(c["parent"]) if c.get("parent") else "", ", ".join(s.get("es", [])), ", ".join(s.get("it", [])), ", ".join(s.get("en", [])),
               c.get("note") or "", None, None, None, None])
finish(ws)

# ------------------------------------------------------------------ Colores → familia
names = defaultdict(lambda: {"fam": set(), "hex": "", "n": 0, "models": set()})
for m in cat["models"]:
    for grp in m["option_groups"]:
        for o in grp["options"]:
            if not (o.get("swatch") or {}).get("hex") and not o.get("color_family"):
                continue  # text options that are not colors ("a botte", "Piano: ..."): see "Opciones oficiales"
            k = o["official_name"].strip()
            d = names[k.lower()]
            d["label"] = k
            d["fam"].update(o.get("color_family") or [])
            d["hex"] = d["hex"] or (o.get("swatch") or {}).get("hex") or ""
            d["n"] += 1
            d["models"].add(m["id"])
H = ["Nombre del color (oficial)", "Muestra", "Hex", "Familia(s) propuesta(s)", "Revisar", "Veces", "Modelos", "¿OK?", "Familia correcta", "Nota"]
W = [30, 9, 10, 26, 22, 7, 50, 8, 24, 26]
ws = sheet("Colores → familia", H, W, review_cols=3)
rows = []
for d in names.values():
    fam = sorted(d["fam"])
    flag = "sin familia" if not fam else "varias familias" if len(fam) > 2 else ""
    rows.append((0 if flag else 1, d["label"].lower(), [d["label"], "", d["hex"], es_list(fam), flag, d["n"], ", ".join(sorted(d["models"]))[:300], None, None, None]))
for r, (_, _, row) in enumerate(sorted(rows), start=2):
    ws.append(row)
    if re.fullmatch(r"#[0-9a-fA-F]{6}", row[2] or ""):
        ws.cell(r, 2).fill = PatternFill("solid", fgColor=row[2][1:].upper())
    if row[4]:
        ws.cell(r, 5).fill = DOUBT
finish(ws)

# ------------------------------------------------------------------ Materiales por colección
coll = defaultdict(lambda: {"mat": set(), "models": set(), "scope": set(), "n": 0})
for m in cat["models"]:
    for grp in m["option_groups"]:
        d = coll[(grp.get("name") or "").strip().upper()]
        if grp.get("material"):
            d["mat"].add(grp["material"])
        d["mat"].update(o["material"] for o in grp["options"] if o.get("material"))
        d["models"].add(m["id"])
        d["scope"].add(SCOPE.get(grp["scope"], grp["scope"]))
        d["n"] += len(grp["options"])
H = ["Colección", "Material propuesto", "Revisar", "Opciones", "Alcance", "Modelos", "¿OK?", "Material correcto", "Nota"]
W = [30, 26, 16, 9, 30, 60, 8, 24, 26]
ws = sheet("Materiales por colección", H, W, review_cols=3)
for r, (name, d) in enumerate(sorted(coll.items(), key=lambda kv: (bool(kv[1]["mat"]), kv[0])), start=2):
    ws.append([name, es_list(sorted(d["mat"])), "" if d["mat"] else "sin material", d["n"], ", ".join(sorted(d["scope"])), ", ".join(sorted(d["models"])), None, None, None])
    if not d["mat"]:
        ws.cell(r, 3).fill = DOUBT
finish(ws)

# ------------------------------------------------------------------ Estilos
H = ["Estilo", "Sinónimos (es)", "Modelos con ese estilo (según su ficha)", "¿OK?", "Corrección", "Nota"]
W = [20, 50, 80, 8, 30, 26]
ws = sheet("Estilos", H, W, review_cols=3)
by_style = defaultdict(list)
for m in cat["models"]:
    for s in attr_ids(m.get("styles")):
        by_style[s].append(f"{m['name']} ({m.get('style_text') or ''})")
for c in [c for c in onto["concepts"] if c["facet"] == "style"]:
    ws.append([c["labels"]["es"], ", ".join(c["synonyms"].get("es", [])), "\n".join(by_style.get(c["id"], [])) or "(ningún modelo)", None, None, None])
no_style = [m["name"] for m in cat["models"] if not attr_ids(m.get("styles"))]
ws.append(["(sin estilo en la ficha)", "", ", ".join(no_style), None, None, None])
finish(ws)

# ------------------------------------------------------------------ Armonías y cercanías
H = ["De", "Con", "Tipo", "Distancia (0 = igual, 1 = lejos)", "Estado", "¿Se aprueba?", "Corrección", "Nota"]
W = [20, 20, 30, 14, 12, 10, 30, 30]
ws = sheet("Armonías", H, W, review_cols=3)
for rel in sorted(onto["relations"], key=lambda x: (x["type"], x["from"], x["to"])):
    ws.append([es(rel["from"]), es(rel["to"]), "combina con (armonía)" if rel["type"] == "harmonizes" else "parecido a (alternativa cercana)",
               rel["distance"], "borrador" if rel["status"] == "draft" else "firmado", None, None, None])
finish(ws)

# ------------------------------------------------------------------ Ánimos
H = ["Ánimo", "Cómo lo dice el visitante", "Lo que el asistente prefiere mostrar (solo ordena, nunca filtra)", "¿OK?", "Corrección", "Nota"]
W = [18, 50, 70, 8, 30, 26]
ws = sheet("Ánimos", H, W, review_cols=3)
for mo in onto["moods"]:
    c = concepts.get(mo["mood"], {"labels": {"es": mo["mood"]}, "synonyms": {}})
    ws.append([c["labels"]["es"], ", ".join(c["synonyms"].get("es", [])), es_list(mo["prefer"]), None, None, None])
finish(ws)

# ------------------------------------------------------------------ Errores
H = ["ID", "Pieza", "Tipo", "Detalle", "Colores v1", "Materiales v1", "Forma v1", "¿OK?", "Nota"]
W = [9, 26, 26, 70, 22, 22, 22, 8, 30]
ws = sheet("Errores", H, W, review_cols=2)
for p in sorted(errors, key=lambda x: x["product_id"]):
    old = v1.get(p["product_id"], {})
    for note in (n for n in p["notas"] if n.startswith("ERROR")):
        head, _, body = note.partition(":")
        ws.append([p["product_id"], p["name"], head.replace("ERROR", "Error", 1), body.strip(),
                   ", ".join(old.get("colors") or []), ", ".join(old.get("materials") or []), old.get("shape") or "", None, None])
finish(ws)

# ------------------------------------------------------------------ Preguntas abiertas
QUESTIONS = [
    ("P1", "¿Una chaise longue o una penisola cuentan como sofá «de ángulo»?", "Hoy son formas cercanas, no iguales: un sofá con chaise sale como alternativa de «en L», no como coincidencia exacta.", ""),
    ("P3", "¿Se aprueba la tabla de armonías y los ánimos (hojas «Armonías» y «Ánimos»)?", "Mientras sea borrador, el asistente solo propone combinaciones como sugerencia.", ""),
    ("P4", "¿Qué debe decir el asistente si una pieza expuesta tiene un acabado descatalogado?", "", ""),
    ("P5", "Máximo de tarjetas por respuesta.", "Propuesta: 8, y 12 en listados completos.", ""),
    ("P6", "¿Qué hacer con idiomas no soportados (hoy: español, italiano, inglés)?", "Propuesta: responder en inglés y ofrecer los tres idiomas.", ""),
    ("P7", "¿Las preferencias generales (p. ej. «nada negro») se mantienen al cambiar de tema?", "", ""),
    ("P8", "Canal de contacto cuando falta un dato (¿correo, WhatsApp, formulario de la ficha?).", "", ""),
    ("P9", "¿Mostrar siempre algo físico del showroom cuando la coincidencia es solo bajo pedido?", "Propuesta: sí (ya implementado).", ""),
    ("P10", "Nabuk Eagle: ¿se puede decir que es «parecido a la piel» cuando piden piel?", "Hoy se ofrece como alternativa cercana, aclarando que no es piel.", ""),
    ("P11", "Profile/Leather: la puerta es «effetto pelle» (similpiel). ¿Correcto que el asistente nunca diga «de piel»?", "Ver FEB-079 y FEB-096.", ""),
    ("P12", "Letto Couple (FEB-039): la ficha solo trae la paleta genérica «Finiture per NOTTE». ¿Qué acabados reales tiene?", "", ""),
    ("P13", "Fichas sin lista de acabados (Andy, Rio, Ink, Nina, Polar, Leeds, Dea, Daniel, Windsor…): ¿hay catálogo de acabados en otro lado?", "Hoy el asistente dice que el dato no está confirmado y enlaza la ficha.", ""),
    ("P14", "FEB-010 Sistema Diciotto y FEB-012 Libreria Trenta son la misma pared vista desde dos lados: ¿qué parte es cada modelo?", "", ""),
    ("P15", "FEB-031 Sistema Origina: la ficha asignada es «Anta Libeskind», pero esas puertas son lisas de madera. ¿Qué anta es?", "", ""),
    ("P16", "FEB-035 Madia Libeskind022: el top se ve travertino, pero la ficha solo lista Gres Calacatta y Stone Grey. ¿Acabado especial?", "", ""),
    ("P17", "FEB-037 Armario Momenti: la ficha asignada es de lavandería (mobili di servizio). ¿Cuál es la ficha correcta?", "", ""),
    ("P18", "FEB-056 estaba enlazado a la cama Astrid; la captura muestra un buró Marlene. Se volvió a enlazar a Marlene: ¿correcto?", "", ""),
    ("P19", "FEB-077: el tour muestra la etiqueta «CASA 01: AUTENTICA» en esa panorámica, pero el catálogo la pone en CASA 04. ¿Cuál es la zona correcta?", "", ""),
    ("P20", "FEB-085 Cucina Telaio Alluminio vetro: el marcador cae sobre la península; las puertas de aluminio y vidrio se ven al fondo. ¿Qué parte es la pieza?", "", ""),
    ("P21", "FEB-094 Sedia Dea: su punto de vista apunta al muestrario y la silla casi no se ve. ¿Se reencuadra el punto de vista en el tour?", "", ""),
    ("P22", "FEB-099 Armadio Barret con Portale: la captura es compatible con puertas abatibles (sin rieles). ¿Es Barret battente?", "", ""),
    ("P23", "FEB-026 / FEB-027: el catálogo v1 traía datos de prueba («cognac» para Camden, que en realidad es verde). ¿Hay más datos de prueba?", "", ""),
]
H = ["#", "Pregunta", "Contexto / propuesta", "Respuesta"]
W = [6, 80, 60, 60]
ws = sheet("Preguntas abiertas", H, W)
for q in QUESTIONS:
    ws.append(list(q))
finish(ws)
for r in range(2, ws.max_row + 1):
    ws.cell(r, 4).fill = REVIEW

own = sum(len(g["options"]) for m in cat["models"] for g in m["option_groups"] if g["scope"] != "generic_palette")
repeated = sum(len(g["options"]) for m in cat["models"] for g in m["option_groups"] if g["scope"] == "generic_palette")
for row in wb["Léeme"].iter_rows():
    for c in row:
        if c.value == "__OPTIONS_SUMMARY__":
            c.value = (f"Modelos (fichas oficiales): {len(attrs)} · Opciones propias de los modelos: {own} · "
                       f"Paletas genéricas: {len(palettes)} paletas con {generic_unique} opciones distintas (en la web aparecen repetidas {repeated} veces)")
named = [f"{w.title}!{c.coordinate}" for w in wb.worksheets for row in w.iter_rows() for c in row
         if isinstance(c.value, str) and NAME_RE.search(c.value)]
if named:
    sys.exit(f"El libro menciona personas en: {', '.join(named[:12])}")
os.makedirs(os.path.dirname(OUT), exist_ok=True)
wb.save(OUT)
print(OUT)
