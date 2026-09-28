"""
Short decisions workbook: only what the official pages and the tour captures cannot settle.

    python scripts/build-decisions-xlsx.py [out.xlsx]    # default: ~/Downloads/febal-casa-decisiones.xlsx

Everything else is resolved from literal sources (see compile.ts, palette-decisions.json).
Every row carries what happens if it is left blank, so an unanswered row never blocks.
"""
import datetime as dt
import json
import os
import re
import sys

from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8")   # the Windows console defaults to cp1252
import febal_database as db  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FACTS = os.path.join(ROOT, "tour-project", "febal-casa", "product-facts")
CAPTURES = os.path.join(FACTS, "captures")
THUMBS = os.path.join(ROOT, ".scratch", "decision-thumbs")
TODAY = dt.date.today().isoformat()
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser("~"), "Downloads", "febal-casa-decisiones.xlsx")

load = lambda name: json.load(open(os.path.join(FACTS, name), encoding="utf-8"))
placements = {p["product_id"]: p for p in load("placements.json")}
pieces = {p["product_id"]: p for p in json.load(open(os.path.join(ROOT, "clients", "febal-casa", "catalog.json"), encoding="utf-8"))}
state = lambda p, k: p[k]["confirmado"] if isinstance(p[k], dict) else p[k]
missing_option = sum(1 for p in placements.values() if state(p, "opcion_oficial") == "NO")
missing_material = sum(1 for p in placements.values() if state(p, "material") == "NO")

HEAD = PatternFill("solid", fgColor="1F3A5F")
ANSWER = PatternFill("solid", fgColor="FFF2CC")
DEFAULT = PatternFill("solid", fgColor="EEF3F8")
THIN = Side(style="thin", color="C9D3DE")
BOX = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")

# (piece, what we do not know, what happens if left blank)
PIECES = [
    ("FEB-035", "¿El top es travertino? ¿Cuál: Gres Travertino Silver Bocciardato o Scenario Travertino? ¿Se puede pedir la madia así? "
                "(Su ficha solo lista para el top Gres Calacatta, casi blanco con vetas, y Gres Stone Grey, gris oscuro; "
                "esos dos travertinos aparecen en otras fichas de Febal: las camas de la línea Dormitorio y la librería Trenta.)",
     "Se describe lo que se ve (travertino) y bajo pedido solo se ofrece lo que lista la ficha."),
]

# (question, what happens if left blank)
GENERAL = [
    ("¿Existe una lista de los acabados exactos de las piezas del showroom (qué tela, qué laca, qué madera tiene cada una)? "
     "Si alguno ya no se vende, márcalo.",
     f"Con esa lista se completan solos los acabados exactos ({missing_option} piezas) y los materiales ({missing_material} piezas). "
     "Sin ella, se sacan de las fotos del tour solo cuando se ven sin duda; lo demás queda como «sin confirmar» con enlace a la ficha."),
    ("Nabuk Eagle: ¿es piel (nobuk) o microfibra? ¿Se puede ofrecer cuando piden piel?",
     "Nunca se dice que es piel; se ofrece como alternativa cercana aclarando que no es piel."),
]


def header(ws, row, titles, widths):
    for i, (t, w) in enumerate(zip(titles, widths), start=1):
        c = ws.cell(row, i, t)
        c.font, c.fill, c.alignment, c.border = Font(bold=True, color="FFFFFF"), HEAD, WRAP, BOX
        ws.column_dimensions[c.column_letter].width = w


def intro(ws, text, cols):
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=cols)
    c = ws.cell(1, 1, text)
    c.alignment, c.font = WRAP, Font(size=11)
    ws.row_dimensions[1].height = 62


def thumb(pid):
    src = next((os.path.join(CAPTURES, f) for f in (f"{pid}-ui.png", f"{pid}.png") if os.path.exists(os.path.join(CAPTURES, f))), None)
    if not src:
        return None
    os.makedirs(THUMBS, exist_ok=True)
    dst = os.path.join(THUMBS, f"{pid}.jpg")
    with Image.open(src) as im:
        im = im.convert("RGB")
        im.thumbnail((420, 260))
        im.save(dst, "JPEG", quality=82)
    return XLImage(dst)


# Vocabulary the tour runs with (code + client edits): every relation and mood, to review one by one.
onto = db.export_ontology()
concepts = {c["id"]: c for c in onto["concepts"]}
es = lambda cid: concepts[cid]["labels"]["es"] if cid in concepts else cid
FACET = {"color": "Color", "material": "Material", "style": "Estilo", "category": "Tipo de mueble", "shape": "Forma"}
KIND_ORDER = {"harmonizes": 0, "near": 1}
RELATIONS = sorted(onto["relations"], key=lambda r: (KIND_ORDER[r["type"]], r["from"].split(".")[0], r["from"], r["distance"], r["to"]))
MOODS = onto["moods"]
# Indicative swatch per colour family (the real finishes are in the database workbook).
SWATCH = {"color.white": "F4F3EF", "color.cream": "EDE3CC", "color.beige": "C9B89C", "color.grey": "9C9C9A", "color.anthracite": "3F4245",
          "color.black": "1E1E1E", "color.brown": "6B4A34", "color.natural_wood": "B08A5A", "color.yellow": "D9B23A", "color.gold": "C9A24A",
          "color.bronze": "8C6A45", "color.orange": "C8743A", "color.red": "A8322E", "color.pink": "D79AA6", "color.purple": "6E4A7A",
          "color.blue": "2F5A8A", "color.green": "5B7A4A", "color.transparent": "DDE8EA"}


def closeness(d):
    return "casi igual" if d <= 0.2 else "muy cercano" if d <= 0.3 else "cercano" if d <= 0.4 else "algo cercano" if d <= 0.5 else "lejano"


def how(rel):
    a, b = es(rel["from"]), es(rel["to"])
    if rel["type"] == "harmonizes":
        return f"Si piden {a} y no hay, puede ofrecer piezas en {b} diciendo que combinan (y al revés). También lo usa al recomendar."
    return f"Si piden {a} y no hay, ofrece {b} como alternativa parecida, aclarando que no es lo mismo (y al revés)."


wb = Workbook()
ws = wb.active
ws.title = "Piezas"
intro(ws, f"Actualizado el {TODAY}. Pendiente: {len(PIECES)} pieza en esta hoja, {len(GENERAL)} preguntas en «Preguntas», "
          f"{len(RELATIONS)} relaciones en «Combinaciones y parecidos» y {len(MOODS)} ánimos en «Ánimos». "
          "Todo lo demás se resolvió con las fichas oficiales y las fotos del tour; todos los datos del asistente están en «febal-casa-base-de-datos.xlsx». "
          "Llena solo la columna amarilla; si una fila queda vacía, se aplica lo que dice «Si no se responde».", 7)
header(ws, 2, ["#", "Foto (tour)", "Pieza", "Zona", "Qué no sabemos", "Si no se responde", "Respuesta"], [5, 60, 26, 20, 46, 36, 40])
for i, (pid, q, default) in enumerate(PIECES, start=1):
    r = i + 2
    p = pieces[pid]
    name = re.sub(r"\.$", "", p["name"])
    ws.cell(r, 1, i)
    ws.cell(r, 3, f"{pid}\n{name}")
    if p.get("detail_url"):
        ws.cell(r, 3).hyperlink = p["detail_url"]
        ws.cell(r, 3).font = Font(color="1F5FAF", underline="single")
    ws.cell(r, 4, p["section"])
    ws.cell(r, 5, q)
    ws.cell(r, 6, default).fill = DEFAULT
    ws.cell(r, 7).fill = ANSWER
    for col in range(1, 8):
        ws.cell(r, col).alignment, ws.cell(r, col).border = WRAP, BOX
    img = thumb(pid)
    if img:
        ws.add_image(img, f"B{r}")
    ws.row_dimensions[r].height = 200
ws.freeze_panes = "C3"

ws = wb.create_sheet("Preguntas")
intro(ws, "Preguntas generales sobre cómo responde el asistente. Llena solo la columna amarilla; "
          "si queda vacía, se aplica lo que dice «Si no se responde».", 4)
header(ws, 2, ["#", "Pregunta", "Si no se responde", "Respuesta"], [5, 70, 60, 50])
for i, (q, default) in enumerate(GENERAL, start=len(PIECES) + 1):
    r = i - len(PIECES) + 2
    ws.cell(r, 1, i)
    ws.cell(r, 2, q)
    ws.cell(r, 3, default).fill = DEFAULT
    ws.cell(r, 4).fill = ANSWER
    for col in range(1, 5):
        ws.cell(r, col).alignment, ws.cell(r, col).border = WRAP, BOX
    ws.row_dimensions[r].height = 16 * max(2, -(-max(len(q), len(default)) // 55))
ws.freeze_panes = "B3"

# ------------------------------------------------------------------ every relation, to review one by one
ws = wb.create_sheet("Combinaciones y parecidos")
intro(ws, "Todas las relaciones que usa el asistente. «Combina con» es criterio de diseño: cuando no hay el color pedido, "
          "ofrece uno que combina («no está en azul, pero sí en café, que combina con azul»). «Parecido a» decide qué alternativa ofrece "
          "cuando no hay lo pedido («no hay piel, pero sí nobuk, que se parece»). Marca SI o NO en cada fila; en «Comentario» escribe "
          "cambios, y abajo agrega lo que falte. Las muestras de color son orientativas.", 10)
header(ws, 2, ["#", "Tipo", "Qué", "De", "", "Con", "", "Qué tan cerca", "Qué hace el asistente", "¿Se aprueba? (SI/NO)", "Comentario"],
       [5, 16, 14, 18, 5, 18, 5, 13, 60, 13, 40])
dv = DataValidation(type="list", formula1='"SI,NO"', allow_blank=True)
ws.add_data_validation(dv)
for i, rel in enumerate(RELATIONS, start=1):
    r = i + 2
    ws.cell(r, 1, i)
    ws.cell(r, 2, "Combina con" if rel["type"] == "harmonizes" else "Parecido a")
    ws.cell(r, 3, FACET.get(rel["from"].split(".")[0], rel["from"].split(".")[0]))
    ws.cell(r, 4, es(rel["from"]))
    ws.cell(r, 6, es(rel["to"]))
    ws.cell(r, 8, closeness(rel["distance"]))
    ws.cell(r, 9, how(rel))
    for col, cid in ((5, rel["from"]), (7, rel["to"])):
        if cid in SWATCH:
            ws.cell(r, col).fill = PatternFill("solid", fgColor=SWATCH[cid])
    ws.cell(r, 10).fill = ANSWER
    ws.cell(r, 11).fill = ANSWER
    for col in range(1, 12):
        ws.cell(r, col).alignment, ws.cell(r, col).border = WRAP, BOX
    ws.row_dimensions[r].height = 32
dv.add(f"J3:J{len(RELATIONS) + 2}")
r = len(RELATIONS) + 4
ws.cell(r, 4, "¿Falta alguna? Escríbela aquí (tipo, de, con, comentario):").font = Font(bold=True)
for k in range(1, 8):
    for col in (2, 4, 6, 11):
        ws.cell(r + k, col).fill = ANSWER
        ws.cell(r + k, col).border = BOX
ws.freeze_panes = "E3"
ws.auto_filter.ref = f"A2:K{len(RELATIONS) + 2}"

# ------------------------------------------------------------------ moods
ws = wb.create_sheet("Ánimos")
intro(ws, "Cuando alguien pide un ambiente en vez de un mueble («algo acogedor»), el asistente muestra primero lo que está en "
          "«Muestra primero…». Solo cambia el orden: nunca esconde nada. Marca SI o NO y escribe en «Cambios» qué quitarías o agregarías.", 6)
header(ws, 2, ["#", "Ánimo", "Cuando el cliente dice…", "Muestra primero…", "¿Se aprueba? (SI/NO)", "Cambios"], [5, 16, 42, 62, 13, 45])
dv = DataValidation(type="list", formula1='"SI,NO"', allow_blank=True)
ws.add_data_validation(dv)
for i, mo in enumerate(MOODS, start=1):
    r = i + 2
    c = concepts.get(mo["mood"], {"labels": {"es": mo["mood"]}, "synonyms": {}})
    ws.cell(r, 1, i)
    ws.cell(r, 2, c["labels"]["es"])
    ws.cell(r, 3, ", ".join(c["synonyms"].get("es", [])))
    ws.cell(r, 4, ", ".join(es(x) for x in mo["prefer"]))
    ws.cell(r, 5).fill = ANSWER
    ws.cell(r, 6).fill = ANSWER
    for col in range(1, 7):
        ws.cell(r, col).alignment, ws.cell(r, col).border = WRAP, BOX
    ws.row_dimensions[r].height = 48
dv.add(f"E3:E{len(MOODS) + 2}")
ws.freeze_panes = "B3"

if any(re.search(r"Andrea|\bEdd\b", str(c.value or "")) for s in wb for row in s.iter_rows() for c in row):
    sys.exit("the workbook must not name people")
try:
    wb.save(OUT)
except PermissionError:
    OUT = OUT.replace(".xlsx", f" ({dt.datetime.now():%H%M}).xlsx")
    wb.save(OUT)
    print(f"AVISO: el archivo estaba abierto en Excel; se guardó como {OUT}")
print(f"{OUT}: {len(PIECES)} piezas + {len(GENERAL)} preguntas + {len(RELATIONS)} relaciones + {len(MOODS)} ánimos")
