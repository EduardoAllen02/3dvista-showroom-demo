"""
The chatbot's data as spreadsheet sheets. One definition shared by
scripts/build-database-xlsx.py (writes the workbook) and scripts/import-database-xlsx.py
(reads an edited workbook back and turns the edits into data files).

Every sheet is a list of columns (header, width, editable) plus rows. The last column,
"clave" (hidden), identifies each row so an edited workbook can be matched back.

Sources:
  clients/febal-casa/catalog.v2.json            compiled catalog (what the chatbot uses)
  tour-project/febal-casa/product-facts/*.json  captures, page readings, palette decisions
  scripts/v2-export-ontology.mts                vocabulary the tour runs with (code + client edits)
"""
import json
import os
import re
import subprocess
from collections import Counter, defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
FACTS = os.path.join(ROOT, "tour-project", "febal-casa", "product-facts")
CLIENT = os.path.join(ROOT, "clients", "febal-casa")
CAPTURES = os.path.join(FACTS, "captures")

DECISIONS = {"aplica": "aplica", "aviso": "aviso", "no_aplica": "no aplica"}
DECISION_KEYS = {v: k for k, v in DECISIONS.items()}
STATUS = {"draft": "borrador", "signed": "aprobado"}
STATUS_KEYS = {v: k for k, v in STATUS.items()}
TONE = {"light": "claro", "medium": "medio", "mid": "medio", "dark": "oscuro"}
LINE_ES = {"notte": "Dormitorio", "armadi": "Armarios"}
FACET_ES = {"shape": "forma", "color": "color", "material": "material", "style": "estilo", "category": "categoría", "mood": "ánimo", "tone": "tono"}
FACET_ORDER = ["category", "shape", "color", "material", "style", "mood", "tone"]
ZONES = ["CASA 01", "CASA 02", "CASA 03", "CASA 04", "GALLERIA"]
KEY = "clave"
# Editable "what the assistant understood" columns -> (override field, facet).
UNDERSTOOD = {
    "color": "✎ Familia de color (lo que entiende el asistente)", "material": "✎ Material (lo que entiende el asistente)",
    "shape": "✎ Forma (lo que entiende el asistente)", "shapes": "✎ Forma (lo que entiende el asistente)",
    "materials": "✎ Materiales (lo que entiende el asistente)", "styles": "✎ Estilo (lo que entiende el asistente)",
}
UNDERSTOOD_FACET = {"color": "color", "material": "material", "shape": "shape", "shapes": "shape", "materials": "material", "styles": "style"}
PIECE_FIELDS = {UNDERSTOOD[k]: k for k in ("color", "material", "shape")}
MODEL_FIELDS = {UNDERSTOOD[k]: k for k in ("shapes", "materials", "styles")}


def load_json(path, default=None):
    if not os.path.exists(path):
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def export_ontology():
    out = subprocess.run("npx tsx scripts/v2-export-ontology.mts febal-casa", cwd=ROOT, shell=True, capture_output=True)
    if out.returncode:
        raise SystemExit("No se pudo exportar la ontología:\n" + out.stderr.decode("utf-8", "replace")[-800:])
    return json.loads(out.stdout.decode("utf-8"))


class Col:
    def __init__(self, header, width, editable=False, kind=None, choices=None):
        self.header, self.width, self.editable, self.kind, self.choices = header, width, editable, kind, choices


class Row:
    def __init__(self, key, values, links=None, swatches=None, photo=None, fills=None, height=None):
        self.key, self.values = key, values
        self.links, self.swatches, self.photo = links or {}, swatches or {}, photo
        self.fills, self.height = fills or {}, height


class Sheet:
    def __init__(self, title, cols, rows, freeze="C2", editable_note=""):
        self.title, self.cols, self.rows, self.freeze, self.editable_note = title, cols, rows, freeze, editable_note


class Data:
    """Everything the sheets are made of, loaded once."""

    def __init__(self):
        self.cat = load_json(os.path.join(CLIENT, "catalog.v2.json"))
        self.v1 = {p["product_id"]: p for p in load_json(os.path.join(CLIENT, "catalog.json"))}
        self.placements = {p["product_id"]: p for p in load_json(os.path.join(FACTS, "placements.json"))}
        self.attrs = {a["model_key"]: a for a in load_json(os.path.join(FACTS, "model-attributes.json"))}
        self.decisions = load_json(os.path.join(FACTS, "palette-decisions.json"), {})
        self.onto = export_ontology()
        self.concepts = {c["id"]: c for c in self.onto["concepts"]}
        self.models = {m["id"]: m for m in self.cat["models"]}
        self.exhibits = {e["id"]: e for e in self.cat["exhibits"]}
        self.exhibits_of = defaultdict(list)
        for e in self.cat["exhibits"]:
            self.exhibits_of[e["model_id"]].append(e)
        # Spanish label (or id) -> concept id, per facet and across facets, for reading edits back.
        self.by_label = defaultdict(dict)
        self.any_label = defaultdict(set)
        for c in self.onto["concepts"]:
            for k in (c["labels"]["es"], c["id"]):
                self.by_label[c["facet"]][norm(k)] = c["id"]
                self.any_label[norm(k)].add(c["id"])

    # ---- labels
    def es(self, cid):
        c = self.concepts.get(cid)
        return c["labels"]["es"] if c else cid

    def es_list(self, ids):
        return ", ".join(self.es(i) for i in ids or [])

    # ---- tour order and piece labels
    def tour_rank(self, model_id):
        zr = lambda z: next((i for i, p in enumerate(ZONES) if z.upper().startswith(p)), 9)
        return min(((zr(e["zone"]), e["id"]) for e in self.exhibits_of.get(model_id, [])), default=(99, model_id))

    def pieces_txt(self, model_id):
        es_ = sorted(self.exhibits_of.get(model_id, []), key=lambda e: e["id"])
        return ", ".join(f"{e['id']} ({e['zone'].split(' - ')[0].title()})" for e in es_) or "(sin pieza en el tour)"

    def verdict(self, model_key, collection):
        d = self.decisions.get(model_key)
        if not d:
            return None
        n = collection.strip().upper()
        for k in ("aplica", "aviso", "no_aplica"):
            if any(x.strip().upper() == n for x in d.get(k, [])):
                return k
        return d.get("default")


def norm(s):
    return re.sub(r"\s+", " ", str(s or "").strip().lower())


def split_list(s):
    return [x.strip() for x in str(s or "").replace("\n", ",").split(",") if x.strip()]


def known(attr):
    return attr.get("value") or [] if attr and attr.get("status") == "known" else []


def note_kind(notes, prefix):
    return [n for n in notes if n.startswith(prefix)]


# ------------------------------------------------------------------ sheets
def sheet_pieces(d):
    cols = [Col("ID", 9), Col("Pieza", 22), Col("Zona", 16), Col("Modelo", 22), Col("Ficha oficial", 10, kind="link"),
            Col("Foto del tour", 44, kind="photo"),
            Col("✎ Color de la parte principal", 20, True), Col(UNDERSTOOD["color"], 18, True),
            Col("✎ Material de la parte principal", 22, True), Col(UNDERSTOOD["material"], 20, True),
            Col("✎ Forma vista", 26, True), Col(UNDERSTOOD["shape"], 20, True),
            Col("✎ Acabado exacto del showroom", 26, True),
            Col("Otras partes de la pieza", 36), Col("Evidencia (lo que se ve en la foto)", 50), Col("Notas", 50), Col(KEY, 10)]
    rows = []
    for pid in sorted(d.placements):
        p, e = d.placements[pid], d.exhibits[pid]
        m = d.models.get(e["model_id"], {})
        comps = p["componentes"]
        dom = next((c for c in comps if c.get("dominante")), comps[0] if comps else {})
        conf = known(e["configuration"])
        cdom = next((c for c in conf if c["dominant"]), None)
        others_m = [d.es(c["material"]) for c in conf if not c["dominant"] and c.get("material")]
        mats = [d.es(cdom["material"]) if cdom and cdom.get("material") else ("sin confirmar" if others_m else "")] + ([", ".join(others_m)] if others_m else [])
        yes = lambda k: p[k]["confirmado"] == "SI"
        ev = [f"Color: {p['color']['evidencia']}",
              f"Material{'' if yes('material') else ' (sin confirmar)'}: {p['material']['evidencia']}",
              f"Forma: {p['forma']['evidencia']}" if p["forma"]["evidencia"] else "",
              f"Acabado{'' if yes('opcion_oficial') else ' (sin identificar)'}: {p['opcion_oficial']['evidencia']}"
              + (f" · candidatas: {p['opcion_oficial']['valor']}" if not yes("opcion_oficial") and p["opcion_oficial"]["valor"] else "")]
        others = "; ".join(f"{c['rol']}: {c.get('color') or '—'}{' · ' + c['material'] if c.get('material') else ''}" for c in comps if c is not dom)
        notes = p.get("notas") or []
        kind = "PENDIENTE" if note_kind(notes, "PENDIENTE") else "DUDA" if note_kind(notes, "DUDA") else "CORREGIDO" if note_kind(notes, "CORREGIDO") else None
        rows.append(Row(pid, [pid, p["name"], p["section"], m.get("name", e["model_id"]), "ficha ↗" if m.get("official_url") else "", "",
                              dom.get("color", "") if yes("color") else "", d.es_list(cdom["color_family"]) if cdom else "",
                              (dom.get("material") or "") if yes("material") else "", " · ".join(x for x in mats if x),
                              p["forma"]["valor"] if yes("forma") else "", d.es_list(known(e["shape_as_shown"])),
                              p["opcion_oficial"]["valor"] if yes("opcion_oficial") else "",
                              others, "\n".join(x for x in ev if x), "\n".join(notes), pid],
                        links={4: m.get("official_url")}, photo=pid, fills={0: kind, 1: kind} if kind else {}, height=150))
    return Sheet("Piezas (88)", cols, rows, freeze="C2")


def palette_summary(m):
    groups = [g for g in m.get("option_groups", []) if g.get("line")]
    if not groups:
        return "—"
    n = Counter(g["scope"] for g in groups)
    line = LINE_ES.get(groups[0]["line"], groups[0]["line"])
    return (f"Paleta de la línea {line}: la ofrece bajo pedido en {n['model']} colecciones, con aviso en {n['line']}, "
            f"no menciona {n['generic_palette']} (ver «Paletas por modelo»)")


def sheet_models(d):
    cols = [Col("Modelo", 26), Col("Nombre", 24), Col("Categoría", 16), Col("Ficha oficial", 10, kind="link"), Col("Piezas en el tour", 18),
            Col("Forma (ficha)", 26), Col(UNDERSTOOD["shapes"], 20, True),
            Col("Materiales (ficha)", 26), Col(UNDERSTOOD["materials"], 20, True),
            Col("Estilo (ficha)", 24), Col(UNDERSTOOD["styles"], 20, True), Col("Medidas", 40),
            Col("Lista de acabados", 40), Col("Paleta de la línea", 40), Col("Opciones en el texto de la ficha", 40),
            Col("Citas de la ficha", 50), Col("Descripción oficial", 50), Col("Notas", 40), Col(KEY, 10)]
    NOT = "(la ficha no lo dice)"

    def txt(v):
        if isinstance(v, list):
            return "; ".join(str(txt(x)) for x in v)
        if isinstance(v, dict):
            return "; ".join(f"{k}: {txt(x)}" for k, x in v.items())
        return "" if v is None else str(v)

    rows = []
    for key in sorted(d.attrs):
        a, m = d.attrs[key], d.models.get(key, {})
        g = lambda k: a.get(k) or {"confirmado": "NO", "valor": "", "evidencia": ""}
        val = lambda k: txt(g(k)["valor"]) if g(k)["confirmado"] == "SI" else NOT
        quotes = "\n".join(f"{lab}: {g(k)['evidencia']}" for lab, k in (("Forma", "forma"), ("Materiales", "materiales"), ("Estilo", "estilo"), ("Medidas", "medidas"))
                           if g(k)["confirmado"] == "SI" and g(k)["evidencia"])
        la = g("lista_acabados")
        rows.append(Row(key, [key, m.get("name", key), d.es(m.get("category")) if m.get("category") else "", "ficha ↗", d.pieces_txt(key),
                              val("forma"), d.es_list(known(m.get("shapes"))), val("materiales"), d.es_list(known(m.get("materials"))),
                              val("estilo"), d.es_list(known(m.get("styles"))), val("medidas"),
                              ("lista propia del modelo" if la["confirmado"] == "SI" else txt(la["valor"]) or "no trae lista"),
                              palette_summary(m), "\n".join(a.get("opciones_en_texto") or []), quotes,
                              m.get("description_it") or "", "\n".join(a.get("notas") or []), key],
                        links={3: a.get("url") or m.get("official_url")}))
    return Sheet("Modelos", cols, rows)


def origin(g):
    if g["scope"] == "text":
        return "nombrada en el texto de la ficha"
    return f"paleta de la línea {LINE_ES.get(g['line'], g['line'])} (aplica según su ficha)" if g.get("line") else "lista propia del modelo"


def sheet_options(d):
    cols = [Col("Modelo", 24), Col("Piezas en el tour", 22), Col("Origen", 24), Col("Grupo", 18), Col("Colección", 24),
            Col("Material de la colección", 18), Col("Opción", 26), Col("Código", 10), Col("Muestra", 9), Col("Hex", 10),
            Col("Familia de color", 20), Col("Tono", 8), Col(KEY, 10)]
    rows = []
    for m in sorted(d.cat["models"], key=lambda m: d.tour_rank(m["id"])):
        for g in m["option_groups"]:
            if g["scope"] not in ("model", "text"):
                continue
            for o in g["options"]:
                hexv = (o.get("swatch") or {}).get("hex") or ""
                mat = o.get("material") or g.get("material")
                rows.append(Row(o["id"], [m["name"], d.pieces_txt(m["id"]), origin(g), g.get("group_title") or "", g.get("name") or "",
                                          d.es(mat) if mat else "", o["official_name"], o.get("code") or "", "", hexv,
                                          d.es_list(o.get("color_family")), TONE.get(o.get("tone") or "", o.get("tone") or ""), o["id"]],
                                swatches={8: hexv}))
    return Sheet("Opciones oficiales", cols, rows, freeze="H2")


def sheet_palettes_by_model(d):
    cols = [Col("Modelo", 24), Col("Piezas en el tour", 22), Col("Línea", 12), Col("Colección", 26), Col("Acabados", 9),
            Col("✎ Decisión", 13, True, choices=list(DECISIONS.values())), Col("Qué hace el asistente", 34),
            Col("Por qué (cita de su ficha)", 70), Col(KEY, 10)]
    DOES = {"model": "La ofrece bajo pedido", "line": "La menciona con aviso: «confirma en su ficha si aplica»", "generic_palette": "No la menciona"}
    rows = []
    for m in sorted(d.cat["models"], key=lambda m: d.tour_rank(m["id"])):
        seen = {}
        for g in m["option_groups"]:
            if not g.get("line"):
                continue
            name = (g.get("name") or "").strip().upper()
            if name in seen:
                seen[name].values[4] += len(g["options"])
                continue
            v = d.verdict(m["id"], name)
            ev = (d.decisions.get(m["id"]) or {}).get("evidencia", "")
            row = Row(f"{m['id']}|{name}", [m["name"], d.pieces_txt(m["id"]), LINE_ES.get(g["line"], g["line"]), name, len(g["options"]),
                                            DECISIONS.get(v, "") if v else "", DOES.get(g["scope"], g["scope"]), ev, f"{m['id']}|{name}"])
            seen[name] = row
            rows.append(row)
    return Sheet("Paletas por modelo", cols, rows, freeze="E2")


def sheet_palette_contents(d):
    cols = [Col("Colección", 24), Col("Material de la colección", 18), Col("Acabado", 26), Col("Código", 10), Col("Muestra", 9), Col("Hex", 10),
            Col("Familia de color", 20), Col("Tono", 8), Col("Aparece en", 60), Col(KEY, 10)]
    acc = {}
    for m in sorted(d.cat["models"], key=lambda m: d.tour_rank(m["id"])):
        for g in m["option_groups"]:
            if not g.get("line"):
                continue
            for o in g["options"]:
                k = f"{(g.get('name') or '').strip().upper()}|{o['official_name'].strip().lower()}"
                r = acc.setdefault(k, {"g": g, "o": o, "mat": o.get("material") or g.get("material"), "models": []})
                if m["name"] not in r["models"]:
                    r["models"].append(m["name"])
    rows = []
    for k, r in sorted(acc.items()):
        o, hexv = r["o"], (r["o"].get("swatch") or {}).get("hex") or ""
        rows.append(Row(k, [(r["g"].get("name") or "").strip().upper(), d.es(r["mat"]) if r["mat"] else "", o["official_name"], o.get("code") or "", "", hexv,
                            d.es_list(o.get("color_family")), TONE.get(o.get("tone") or "", o.get("tone") or ""),
                            f"{len(r['models'])} modelos: " + ", ".join(r["models"]), k], swatches={4: hexv}))
    return Sheet("Acabados de las paletas", cols, rows, freeze="D2")


def sheet_synonyms(d):
    cols = [Col("Faceta", 11), Col("Concepto", 22), Col("✎ Nombre (es)", 18, True), Col("✎ Nome (it)", 18, True), Col("✎ Name (en)", 18, True),
            Col("Es un tipo de", 16), Col("✎ Sinónimos es", 50, True), Col("✎ Sinonimi it", 45, True), Col("✎ Synonyms en", 45, True),
            Col("Nota", 36), Col(KEY, 10)]
    rows = []
    for c in sorted(d.onto["concepts"], key=lambda c: (FACET_ORDER.index(c["facet"]) if c["facet"] in FACET_ORDER else 99, c["id"])):
        s = c.get("synonyms", {})
        rows.append(Row(c["id"], [FACET_ES.get(c["facet"], c["facet"]), c["id"], c["labels"]["es"], c["labels"]["it"], c["labels"]["en"],
                                  d.es(c["parent"]) if c.get("parent") else "", ", ".join(s.get("es", [])), ", ".join(s.get("it", [])),
                                  ", ".join(s.get("en", [])), c.get("note") or "", c["id"]]))
    return Sheet("Sinónimos", cols, rows, freeze="C2")


def color_names(d):
    names = {}
    for m in d.cat["models"]:
        for g in m["option_groups"]:
            for o in g["options"]:
                if not (o.get("swatch") or {}).get("hex") and not o.get("color_family"):
                    continue
                k = o["official_name"].strip().lower()
                r = names.setdefault(k, {"label": o["official_name"].strip(), "fam": set(), "hex": "", "tone": Counter(), "n": 0, "models": set()})
                r["fam"].update(o.get("color_family") or [])
                r["hex"] = r["hex"] or (o.get("swatch") or {}).get("hex") or ""
                if o.get("tone"):
                    r["tone"][o["tone"]] += 1
                r["n"] += 1
                r["models"].add(m["name"])
    return names


def sheet_colors(d):
    cols = [Col("Nombre del color (oficial)", 30), Col("Muestra", 9), Col("Hex", 10), Col("✎ Familia(s)", 26, True), Col("Tono", 8),
            Col("Veces", 7), Col("Modelos", 60), Col(KEY, 10)]
    rows = []
    for k, r in sorted(color_names(d).items()):
        tone = r["tone"].most_common(1)[0][0] if r["tone"] else ""
        rows.append(Row(k, [r["label"], "", r["hex"], d.es_list(sorted(r["fam"])), TONE.get(tone, tone), r["n"],
                            ", ".join(sorted(r["models"]))[:300], k], swatches={1: r["hex"]}))
    return Sheet("Colores → familia", cols, rows, freeze="B2")


def collections(d):
    coll = {}
    for m in d.cat["models"]:
        for g in m["option_groups"]:
            k = (g.get("name") or "").strip().upper()
            r = coll.setdefault(k, {"mat": set(), "opt_mat": set(), "models": set(), "scope": set(), "n": 0})
            if g.get("material"):
                r["mat"].add(g["material"])
            r["opt_mat"].update(o["material"] for o in g["options"] if o.get("material"))
            r["models"].add(m["name"])
            r["scope"].add(origin(g) if g["scope"] in ("model", "text") else "paleta de la línea (con aviso o sin mencionar)")
            r["n"] += len(g["options"])
    return coll


def sheet_materials(d):
    cols = [Col("Colección", 30), Col("✎ Material", 24, True), Col("Material de cada acabado (listas del texto)", 30), Col("Acabados", 9),
            Col("De dónde sale", 34), Col("Modelos", 60), Col(KEY, 10)]
    rows = []
    for k, r in sorted(collections(d).items()):
        rows.append(Row(k, [k, d.es_list(sorted(r["mat"])), d.es_list(sorted(r["opt_mat"] - r["mat"])), r["n"],
                            ", ".join(sorted(r["scope"])), ", ".join(sorted(r["models"])), k]))
    return Sheet("Materiales por colección", cols, rows, freeze="B2")


def sheet_styles(d):
    cols = [Col("Estilo", 20), Col("Sinónimos (es)", 50), Col("Modelos con ese estilo (según su ficha)", 80), Col(KEY, 10)]
    by = defaultdict(list)
    for m in d.cat["models"]:
        for s in known(m.get("styles")):
            by[s].append(f"{m['name']} ({m.get('style_text') or ''})")
    rows = [Row(c["id"], [c["labels"]["es"], ", ".join(c["synonyms"].get("es", [])), "\n".join(by.get(c["id"], [])) or "(ningún modelo)", c["id"]])
            for c in d.onto["concepts"] if c["facet"] == "style"]
    rows.append(Row("none", ["(sin estilo en la ficha)", "", ", ".join(m["name"] for m in d.cat["models"] if not known(m.get("styles"))), "none"]))
    return Sheet("Estilos", cols, rows, freeze="B2")


def rel_key(r):
    return f"{r['type']}|{r['from']}|{r['to']}"


def sheet_harmonies(d):
    cols = [Col("De", 20), Col("Con", 20), Col("Tipo", 30), Col("✎ Distancia (0 = igual, 1 = lejos)", 14, True),
            Col("✎ Estado", 12, True, choices=list(STATUS.values())), Col(KEY, 10)]
    rows = [Row(rel_key(r), [d.es(r["from"]), d.es(r["to"]), "combina con (armonía)" if r["type"] == "harmonizes" else "parecido a (alternativa cercana)",
                             r["distance"], STATUS.get(r["status"], r["status"]), rel_key(r)])
            for r in sorted(d.onto["relations"], key=lambda x: (x["type"], x["from"], x["to"]))]
    return Sheet("Armonías", cols, rows, freeze="C2")


def sheet_moods(d):
    cols = [Col("Ánimo", 18), Col("Cómo lo dice el visitante (se edita en «Sinónimos»)", 50),
            Col("✎ Lo que el asistente prefiere mostrar (solo ordena, nunca filtra)", 70, True), Col(KEY, 10)]
    rows = []
    for mo in d.onto["moods"]:
        c = d.concepts.get(mo["mood"], {"labels": {"es": mo["mood"]}, "synonyms": {}})
        rows.append(Row(mo["mood"], [c["labels"]["es"], ", ".join(c["synonyms"].get("es", [])), d.es_list(mo["prefer"]), mo["mood"]]))
    return Sheet("Ánimos", cols, rows, freeze="B2")


def sheet_corrections(d):
    cols = [Col("ID", 9), Col("Pieza", 26), Col("Estado", 22), Col("Qué", 20), Col("Detalle", 70), Col("Colores v1", 22),
            Col("Materiales v1", 22), Col("Forma v1", 22), Col(KEY, 10)]
    rows = []
    for pid in sorted(d.placements):
        p, old = d.placements[pid], d.v1.get(pid, {})
        for i, note in enumerate(note_kind(p["notas"], "CORREGIDO") + note_kind(p["notas"], "PENDIENTE")):
            head, _, body = note.partition(":")
            state, _, what = head.partition(" (")
            rows.append(Row(f"{pid}|{i}", [pid, p["name"], "Ya corregido en los datos" if state == "CORREGIDO" else "Pendiente: se arregla en el tour",
                                          what.rstrip(")"), body.strip(), ", ".join(old.get("colors") or []), ", ".join(old.get("materials") or []),
                                          old.get("shape") or "", f"{pid}|{i}"], fills={2: state}))
    return Sheet("Correcciones", cols, rows, freeze="C2")


def build_sheets(d=None):
    d = d or Data()
    return d, [sheet_pieces(d), sheet_models(d), sheet_options(d), sheet_palettes_by_model(d), sheet_palette_contents(d),
               sheet_synonyms(d), sheet_colors(d), sheet_materials(d), sheet_styles(d), sheet_harmonies(d), sheet_moods(d),
               sheet_corrections(d)]
