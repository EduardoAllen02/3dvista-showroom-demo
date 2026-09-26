"""
Short decisions workbook: only what the official pages and the tour captures cannot settle.

    python scripts/build-decisions-xlsx.py [out.xlsx]

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
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FACTS = os.path.join(ROOT, "tour-project", "febal-casa", "product-facts")
CAPTURES = os.path.join(FACTS, "captures")
THUMBS = os.path.join(ROOT, ".scratch", "decision-thumbs")
TODAY = dt.date.today().isoformat()
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser("~"), "Downloads", f"febal-casa-decisiones-{TODAY}.xlsx")

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
    ("FEB-031", "Está enlazada a la ficha «Origina Anta Libeskind», pero las puertas de esta pared son lisas de madera. ¿Qué puerta es?",
     "Sigue enlazada a «Origina Anta Libeskind»."),
    ("FEB-035", "El top se ve travertino, pero la ficha solo lista Gres Calacatta y Stone Grey para el top. ¿Es un acabado especial?",
     "Se describe lo que se ve (travertino) y bajo pedido solo se ofrece lo que lista la ficha."),
    ("FEB-037", "Está enlazado a la ficha de lavandería (mobili di servizio). ¿Cuál es la ficha correcta de este armario Momenti?",
     "Sigue enlazado a la ficha de lavandería."),
    ("FEB-077", "En esa panorámica el tour muestra la etiqueta «CASA 01: AUTENTICA», pero el catálogo lo pone en CASA 04. ¿En qué zona está?",
     "Se queda en CASA 04 - A-MARE, como dice el catálogo."),
    ("FEB-085", "El marcador cae sobre la península; las puertas de aluminio y vidrio se ven al fondo. ¿Qué parte es la pieza?",
     "Se describe lo que muestra el marcador."),
    ("FEB-099", "La foto es compatible con puertas abatibles (no se ven rieles de corredera). ¿Es Barret battente?",
     "Se trata como Barret battente (puertas abatibles)."),
]

# (question, what happens if left blank)
GENERAL = [
    ("¿Existe una lista de los acabados exactos de las piezas del showroom (qué tela, qué laca, qué madera tiene cada una)?",
     f"Con esa lista se completan solos los acabados exactos ({missing_option} piezas) y los materiales ({missing_material} piezas). "
     "Sin ella, se sacan de las fotos del tour solo cuando se ven sin duda; lo demás queda como «sin confirmar» con enlace a la ficha."),
    ("¿Una chaise longue o una penisola cuentan como sofá «de ángulo»?",
     "Salen como alternativa cercana de un sofá en L, no como coincidencia exacta."),
    ("¿Se aprueban las combinaciones de colores y los ánimos («acogedor», «luminoso»…) que propone el asistente?",
     "El asistente las presenta solo como sugerencia, nunca como regla de la marca."),
    ("¿Qué debe decir el asistente si una pieza expuesta tiene un acabado que ya no se fabrica?",
     "Describe la pieza como se ve y ofrece los acabados que lista su ficha hoy."),
    ("¿Cuántas tarjetas de productos como máximo por respuesta?",
     "8, y 12 cuando piden un listado completo."),
    ("¿Qué hacer si escriben en un idioma distinto de español, italiano o inglés?",
     "Se programa así: responde en inglés y ofrece los tres idiomas (hoy elige el más cercano de los tres)."),
    ("Si el cliente dice algo general («nada negro») y luego cambia de tipo de mueble, ¿se sigue respetando?",
     "No: al cambiar de tipo de mueble se empieza de cero."),
    ("¿A qué canal se envía al cliente cuando falta un dato (correo, WhatsApp, cita en tienda)?",
     "Enlace a la ficha oficial del modelo, que tiene el botón para reservar cita."),
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


wb = Workbook()
ws = wb.active
ws.title = "Piezas"
intro(ws, f"Solo {len(PIECES) + len(GENERAL)} decisiones: {len(PIECES)} piezas en esta hoja y {len(GENERAL)} preguntas en «Preguntas». "
          "Todo lo demás se resolvió con las fichas oficiales y las fotos del tour. "
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

if any(re.search(r"Andrea|\bEdd\b", str(c.value or "")) for s in wb for row in s.iter_rows() for c in row):
    sys.exit("the workbook must not name people")
wb.save(OUT)
print(f"{OUT}: {len(PIECES)} piezas + {len(GENERAL)} preguntas")
