"""Generates tour-project/febal-casa/product-facts/book-compo-finishes.json from the Book Compo
(FC_2025-10-Restyling_Cerasolo_Book_Compo_06-10.pdf), curated by hand piece by piece.

Per piece: the box (B_xxx), the PDF page, the book's own name, and the parts as the book lists
them: literal finish ("acabado"), the name said between «» in answers, the material concept, a
plain colour description in Italian (localized by the renderer) and the colour families. Colours
follow the official swatch (swatch-colors.json) or the book's swatch when the site has none.
"""
import json, os, sys

#   python scripts/build-book-compo-finishes.py      # then: npx tsx scripts/build-catalog-v2.ts febal-casa
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "tour-project", "febal-casa", "product-facts", "book-compo-finishes.json")
SOURCE = {
    "documento": "FC_2025-10-Restyling_Cerasolo_Book_Compo_06-10.pdf",
    "titulo": "Flagship Store Rimini Cerasolo 2025 / Book Compo",
    "fecha_documento": "2025-10-06",
    "recibido": "2026-09-30",
    "nota": "Ficha oficial de composición del showroom: por caja (B_xxx, la misma clave que los hotspots del tour) el producto y el acabado de cada parte. Página = página del PDF.",
}

M = {  # material concepts
    "fabric": "material.fabric", "velvet": "material.velvet", "boucle": "material.boucle", "leather": "material.leather",
    "nubuck": "material.nubuck", "faux": "material.faux_leather", "lac": "material.lacquer_matt", "gloss": "material.lacquer_gloss",
    "metalskin": "material.metal_skin", "veneer": "material.wood_veneer", "oak": "material.oak", "walnut": "material.walnut",
    "mel": "material.melamine", "lam": "material.laminate", "glass": "material.glass", "mirror": "material.mirror",
    "ceramic": "material.ceramic", "marble_fx": "material.marble_effect", "metal": "material.metal", "brass": "material.brass",
    "steel": "material.steel", "pet": "material.plastic", None: None,
}
C = {  # colour families
    "beige": ["color.beige"], "grey": ["color.grey"], "dgrey": ["color.grey"], "anth": ["color.anthracite"], "black": ["color.black"],
    "white": ["color.white", "color.cream"], "cream": ["color.cream"], "brown": ["color.brown"], "wood": ["color.natural_wood", "color.brown"],
    "charwood": ["color.anthracite", "color.natural_wood"], "green": ["color.green"], "gold": ["color.gold"], "bronze": ["color.bronze"],
    "smoke": ["color.transparent", "color.grey"], "red": ["color.red", "color.brown"], "taupe": ["color.beige", "color.grey"],
    "greybrown": ["color.grey", "color.brown"], "whitegold": ["color.white", "color.gold"],
    "brass": ["color.gold", "color.bronze"],  # "ottone" is both gold and brass in the lexicon
}

def P(part, finish, mat, color, fam, name=None, role="whole", main=False):
    # A handle's material doesn't make the piece "of" it (similpelle handles are not a leather-look
    # wardrobe): its finish stays as text, without a material concept for the search.
    return {"parte": part, "acabado": finish, "nombre": name or finish, "material": None if role == "handle" else M[mat],
            "color": color, "familias": C[fam], "rol": role, "principal": main}

E = {}
def ex(pid, box, page, book_name, *parts, nota=None):
    assert sum(p["principal"] for p in parts) == 1, pid
    E[pid] = {"caja": box, "pagina": page, "nombre_libro": book_name, "partes": list(parts), **({"nota": nota} if nota else {})}

# ---------------------------------------------------------------- CASA 1 · Autentica
ex("FEB-003", "B_106", 7, "Divano BALMORAL",
   P("Rivestimento", "Tessuto Earth Dune R215", "fabric", "sabbia", "beige", "Earth Dune R215", "upholstery", True),
   P("Struttura", "Nero Opaco", None, "nero opaco", "black", role="structure"))
for pid, box in (("FEB-004", "B_109"), ("FEB-005", "B_110")):
    ex(pid, box, 8, "Tavolino RIO",
       P("Top", "Rovere Spessart", "oak", "rovere scuro", "wood", role="top", main=True),
       P("Struttura", "Ottone Scuro", "brass", "ottone scuro", "brass", role="base"))
ex("FEB-007", "B_121", 9, "Composizione ISOLA (cucina Origina)",
   P("Ante", "Imp. Op. Cannettato Rovere Caffè", "veneer", "rovere caffè", "wood", "Rovere Caffè cannettato", "front", True),
   P("Top", "Ceramica Infinity Rosso Domus", "ceramic", "rosso scuro venato", "red", role="top"),
   P("Piano Totem", "Fenix Nero Ingo", "lam", "nero", "black", role="top"))
for pid in ("FEB-008", "FEB-009"):
    box = "B_122" if pid == "FEB-008" else "B_123"
    ex(pid, box, 9, "Composizione COLONNE (cucina Origina)",
       P("Ante", "Imp. Op. Cannettato Rovere Caffè", "veneer", "rovere caffè", "wood", "Rovere Caffè cannettato", "front", True),
       P("Ante", "Telaio Col. Nero Vetro Fumé", "glass", "vetro fumé", "smoke", role="doors"))
ex("FEB-010", "B_141", 10, "Composizione DICIOTTO / ANTA COVER / BASI (prototipo)",
   P("Pannelli Boiserie", "Laccato Opaco Mastice", "lac", "beige", "beige", "Mastice", main=True),
   P("Basi sospese 18 Ante", "Imp. Noce Eccimeri", "walnut", "noce", "brown", "Noce Eccimeri", "doors"),
   P("Bussolotti Pensili", "Laccato Op. Grigio Fango", "lac", "grigio scuro", "dgrey", "Grigio Fango"),
   P("Mensole", "Metallo Carbon Grey", "metal", "antracite", "anth", "Carbon Grey", "shelves"),
   nota="Prototipo según el libro.")
ex("FEB-012", "B_143", 11, "Libreria TRENTA",
   P("Ante Aurora Vetro", "Trasparente Fumè", "glass", "vetro fumé", "smoke", role="doors", main=True),
   P("Spalle Ripiani", "Laccato Opaco Castoro", "lac", "tortora", "beige", "Castoro", "shelves"),
   P("Ante", "Laccato Opaco Grigio Fango", "lac", "grigio scuro", "dgrey", "Grigio Fango", "doors"),
   P("Schiena", "Laccato Opaco Mastice", "lac", "beige", "beige", "Mastice"),
   P("Ante Aurora Telaio", "Metallo Carbon Grey", "metal", "antracite", "anth", "Carbon Grey", "frame"))
ex("FEB-013", "B_146", 12, "Madie AURORA",
   P("Anta Vetro", "Trasparente Fumè", "glass", "vetro fumé", "smoke", role="front", main=True),
   P("Top", "Laccato Opaco Grigio Fango", "lac", "grigio scuro", "dgrey", "Grigio Fango", "top"),
   P("Anta Telaio / Piedi", "Metallo Carbon Grey", "metal", "antracite", "anth", "Carbon Grey", "frame"))
ex("FEB-015", "B_161", 13, "Armadio PROFILE / BLOCK",
   P("Ante", "Laccato Opaco Mastice", "lac", "beige", "beige", "Mastice", "front", True),
   P("Fascia centrale", "Similpelle Inca 006 Bambù", "faux", "sabbia", "beige", "Inca 006 Bambù"),
   P("Maniglie e Profili", "Metallo Carbon Grey", "metal", "antracite", "anth", "Carbon Grey", "handle"))
ex("FEB-016", "B_162", 14, "Libreria LAPIS",
   P("Bussolotti", "Laccati Metal Viva", "metalskin", "grigio scuro", "anth", "Metal Viva", main=True),
   P("Pali e Struttura Ripiani", "Metallo", "metal", "antracite", "anth", role="structure"),
   P("Interno Ripiani", "Vetro Trasparente Fumè", "glass", "vetro fumé", "smoke", role="shelves"))
ex("FEB-017", "B_166", 15, "Pouff WINDSOR",
   P("Rivestimento", "Boston Taupe", "fabric", "tortora", "taupe", role="upholstery", main=True))
ex("FEB-020", "B_173", 17, "Composizione COLONNE DAILY (cucina Iosa Ghini, prototipo)",
   P("Ante", "Lac. Op. Grigio Oxford con inserti in metallo Metal Viva Champagne", "lac", "grigio", "grey", "Grigio Oxford", "front", True),
   P("Ante", "Vetro Trasparente Fumè", "glass", "vetro fumé", "smoke", role="doors"),
   P("Elemento a giorno", "Nobilitato Eucalipto", "mel", "marrone", "wood", "Eucalipto", "shelves"))
ex("FEB-021", "B_174", 17, "Composizione COLONNE (cucina Iosa Ghini, prototipo)",
   P("Ante", "Lac. Op. Grigio Oxford con inserti in metallo Metal Viva Champagne", "lac", "grigio", "grey", "Grigio Oxford", "front", True),
   P("Top e schienale (B_172, misma cocina)", "Optimum Gold Laurent", "marble_fx", "scuro venato", "anth", role="top"),
   P("Blocchi piano cottura e lavello (misma cocina)", "Inox satinato", "steel", "acciaio", "grey", role="top"),
   nota="Top y bloques de acero son de la misma cocina (B_171/B_172, pág. 16-17).")
ex("FEB-023", "B_182", 19, "Libreria TRENTA",
   P("Ante / Spalle / Portale", "Laccato Opaco Grigio Caldo", "lac", "grigio caldo", "grey", "Grigio Caldo", main=True),
   P("Schiena / Pannello Tv", "Nobilitato Noce", "mel", "noce", "brown", "Nobilitato Noce"),
   P("Pannello Retro", "Nobilitato Botticino", "marble_fx", "beige chiaro", "beige", "Botticino"))
ex("FEB-024", "B_186", 20, "BOISERIE",
   P("Pannelli", "Laccato Opaco Grigio Caldo", "lac", "grigio caldo", "grey", "Grigio Caldo", main=True),
   P("Mensole", "Metallo Champagne", "metal", "champagne", "gold", "Champagne", "shelves"))
ex("FEB-096", "B_192", 22, "Armadio PROFILE / LEATHER",
   P("Ante", "Similpelle Inca 0407 Bronzo", "faux", "bronzo", "bronze", "Inca 0407 Bronzo", "front", True),
   P("Fianchi / Schiene / Cappello Basi", "Nobilitato Noce", "mel", "noce", "brown", "Nobilitato Noce"),
   P("Maniglie e Profili", "Incasso Pelle Metal. Silver Shade", "metal", "grigio", "grey", "Silver Shade", "handle"))
ex("FEB-097", "B_193", 23, "Cabina Guardaroba",
   P("Fianco / Cappello Basi / Cassettiera / Schiene", "Nobilitato Noce", "mel", "noce", "brown", "Nobilitato Noce", main=True),
   P("Frontali Cassetti", "Specchio Bronzo", "mirror", "bronzo", "bronze", role="front"),
   P("Fianchi e Mensole Telaio", "Metallo Silver Shade", "metal", "grigio", "grey", "Silver Shade", "frame"),
   P("Mensole Ripiano", "Vetro Trasparente", "glass", "vetro", "smoke", role="shelves"))
ex("FEB-098", "B_194", 23, "Cassettiera SQUARE",
   P("Struttura", "Laccato Opaco Marrone Corteccia", "lac", "marrone scuro", "brown", "Marrone Corteccia", main=True),
   P("Frontali Cassetti", "Specchio Bronzo", "mirror", "bronzo", "bronze", role="front"),
   P("Top Vano a Giorno", "Gres Stone Grey", "ceramic", "grigio scuro venato", "anth", role="top"),
   P("Panca e Schiene Imbottite / Vassoi", "Similpelle Inca 0419 Caffè", "faux", "marrone", "brown", "Inca 0419 Caffè"),
   P("Maniglie Lama", "Silver Shade", "metal", "grigio", "grey", role="handle"))
ex("FEB-099", "B_191", 21, "Armadio BARRET PORTALE",
   P("Ante / Fianchi / Pannellatura", "Laccato Opaco Marrone Corteccia", "lac", "marrone scuro", "brown", "Marrone Corteccia", "front", True),
   P("Maniglie Incasso V55Y", "Similpelle Inca 0419 Caffè", "faux", "marrone", "brown", "Inca 0419 Caffè", "handle"),
   P("Casse Interne / Schiene", "Nobilitato Leather Grey", "mel", "grigio", "grey", "Leather Grey", "interior"))

# ---------------------------------------------------------------- CASA 2 · Perfetta
ex("FEB-025", "B_201", 25, "Libreria TRENTA LIBESKIND",
   P("Spalle / Ante / Ante Libeskind", "Laccato Metal Viva Bronzo", "metalskin", "bronzo scuro", "bronze", "Metal Viva Bronzo", main=True),
   P("Schiena / Mensole", "Laccato Opaco Grigio Seta", "lac", "grigio chiaro", "grey", "Grigio Seta", "shelves"))
ex("FEB-027", "B_203", 25, "Divani CAMDEN",
   P("Rivestimento", "Tessuto Cloud Dark Green", "fabric", "verde scuro", "green", "Cloud Dark Green", "upholstery", True),
   P("Struttura", "Nero Opaco", None, "nero opaco", "black", role="structure"))
ex("FEB-028", "B_204", 26, "Poltrone ASTOR",
   P("Rivestimento", "Jolie Sand", "fabric", "sabbia", "beige", role="upholstery", main=True),
   P("Struttura (base girevole)", "Nero Opaco", "metal", "nero opaco", "black", role="base"))
ex("FEB-029", "B_205", 26, "Tavolini INK",
   P("Top", "Cristallo Velvet Nero Opaco", "glass", "nero opaco", "black", role="top", main=True),
   P("Struttura", "Nero Opaco", "metal", "nero opaco", "black", role="base"))
ex("FEB-030", "B_221", 27, "Composizione ISOLA (cucina Origina Libeskind)",
   P("Ante Libeskind / Ante", "Lac. Metal Viva Bronzo", "metalskin", "bronzo scuro", "bronze", "Metal Viva Bronzo", "front", True),
   P("Top e fianchi", "Laminam Travertino Silver Bocciardato", "ceramic", "travertino", "beige", role="top"))
ex("FEB-031", "B_222", 27, "Composizione COLONNE (cucina Origina Libeskind)",
   P("Ante", "Imp. Op. Rovere Asiatico", "oak", "rovere scuro", "wood", "Rovere Asiatico", "front", True),
   P("Ante", "Vetro Op. Specchio Bronzo", "mirror", "bronzo", "bronze", role="doors"),
   P("Top e schienale", "Laminam Travertino Silver Bocciardato", "ceramic", "travertino", "beige", role="top"))
ex("FEB-032", "B_223", 28, "Pouff WINDSOR",
   P("Rivestimento", "Rimini Sahara", "fabric", "tortora scuro", "greybrown", role="upholstery", main=True))
ex("FEB-033", "B_241", 28, "Libreria TRENTA",
   P("Spalle Ripiani / Schiena", "Laccato Opaco Grigio Seta", "lac", "grigio chiaro", "grey", "Grigio Seta", main=True),
   P("Ante", "Nobilitato Rovere Asiatico", "mel", "rovere scuro", "wood", "Rovere Asiatico", "doors"),
   P("Ante Aurora Vetro", "Trasparente Fumè", "glass", "vetro fumé", "smoke", role="doors"))
ex("FEB-034", "B_242", 29, "Tavolo PHOENIX",
   P("Top", "Rovere Carbone", "oak", "rovere carbone", "charwood", role="top", main=True),
   P("Struttura", "Ottone Scuro", "brass", "ottone scuro", "brass", role="base"))
ex("FEB-035", "B_244", 29, "Madia LIBESKIND",
   P("Ante / Cassa", "Laccato Opaco Grigio Seta", "lac", "grigio chiaro", "grey", "Grigio Seta", "front", True),
   P("Top", "Gres Travertino", "ceramic", "travertino", "beige", role="top"),
   P("Struttura", "Carbon Grey", "metal", "antracite", "anth", role="base"))
ex("FEB-036", "B_245", 30, "Poltrona VIVIENNE",
   P("Rivestimento", "Pelle Eagle Grey", "nubuck", "grigio chiaro", "grey", "Eagle Grey", "upholstery", True),
   P("Struttura", "Nero Opaco", "metal", "nero opaco", "black", role="base"))
ex("FEB-037", "B_261", 31, "Armadio MOMENTI LAVANDERIA",
   P("Facciata / Cassa / Schiena", "Nobilitato Canapa Opaco", "mel", "beige chiaro", "beige", "Canapa Opaco", "front", True))
ex("FEB-038", "B_264", 32, "Composizione BOISERIE",
   P("Boiserie e Pannelli", "Laccato Opaco Mastice", "lac", "beige", "beige", "Mastice", main=True),
   P("Mensole Metallo", "Carbon Grey", "metal", "antracite", "anth", role="shelves"))
ex("FEB-039", "B_281", 32, "Letto COUPLE",
   P("Rivestimento", "Pelle Inca col.0055 Cemento", "faux", "grigio chiaro", "grey", "Inca 0055 Cemento", main=True),
   P("Pannello", "Laccato Opaco Grigio Seta", "lac", "grigio chiaro", "grey", "Grigio Seta", "headboard"),
   nota="El libro dice 'Pelle Inca'; Inca es similpiel en el resto del libro (Similpelle Inca 0101, 0407, 0419). Se trata como similpiel hasta que Febal lo confirme.")
ex("FEB-040", "B_284", 33, "Poltrona ISABELLE",
   P("Rivestimento", "Cloud Beige", "fabric", "beige", "beige", role="upholstery", main=True),
   P("Struttura", "Nero Opaco", None, "nero opaco", "black", role="structure"))
ex("FEB-041", "B_285", 33, "Specchio POLAR",
   P("Struttura", "Nero Opaco", None, "nero opaco", "black", role="frame", main=True))
ex("FEB-042", "B_291", 34, "BOISERIE (Libreria Lapis)",
   P("Boiserie", "Imp. Rovere Dark Eccimeri", "oak", "rovere scuro", "charwood", "Rovere Dark", main=True))
ex("FEB-043", "B_293", 34, "Cabina LAPIS",
   P("Bussolotti / Ripiani", "Laccato Opaco Grigio Seta", "lac", "grigio chiaro", "grey", "Grigio Seta", "front", True),
   P("Pali", "Metallo Silver Shade", "metal", "grigio", "grey", "Silver Shade", "structure"))
ex("FEB-045", "B_295", 35, "Armadio LEWITT PLUS",
   P("Ante / Maniglia / Fianchi", "Laccato Opaco Grigio Fango", "lac", "grigio scuro", "dgrey", "Grigio Fango", "front", True),
   P("Casse Interne / Schiene", "Nobilitato Leather Grey", "mel", "grigio", "grey", "Leather Grey", "interior"))

# ---------------------------------------------------------------- CASA 3 · Audace
ex("FEB-046", "B_301", 37, "DICIOTTO / PENSILE DECK / PORTA TV (prototipo)",
   P("Pannellatura / Top / Basi", "Imp. Ecc. Rovere Dark", "oak", "rovere scuro", "charwood", "Rovere Dark", main=True),
   P("Pensili Deck Schiene", "Nobilitato Marmo Imperiale", "marble_fx", "marrone scuro venato", "brown", "Marmo Imperiale"),
   P("Bussolotti Pensili", "Laccato Metal Viva Champagne", "metalskin", "champagne", "gold", "Metal Viva Champagne"),
   P("Pensili Deck Struttura / Telaio", "Metallo Carbon Grey", "metal", "antracite", "anth", "Carbon Grey", "frame"),
   nota="Prototipo según el libro.")
ex("FEB-047", "B_302", 38, "Libreria TRENTA",
   P("Spalle / Ante / Fasce e Pannelli", "Laccato Opaco Castoro", "lac", "tortora", "beige", "Castoro", main=True),
   P("Portale / Schiena", "Nobilitato Rovere Asiatico", "mel", "rovere scuro", "wood", "Rovere Asiatico"))
ex("FEB-048", "B_303", 38, "Divano MELROSE",
   P("Rivestimento", "Orlando Col. Taupe' C017", "fabric", "tortora", "taupe", "Orlando Taupe C017", "upholstery", True),
   P("Struttura", "Nero Opaco", None, "nero opaco", "black", role="structure"))
ex("FEB-049", "B_304", 39, "Poltrona ANDY",
   P("Rivestimento", "Velvet Brown F609", "velvet", "marrone", "brown", role="upholstery", main=True),
   P("Struttura", "Nero", None, "nero", "black", role="structure"))
ex("FEB-050", "B_308", 39, "Gruppo NOTTE - settimino MARLENE",
   P("Struttura / Top", "Laccato Opaco Castoro", "lac", "tortora", "beige", "Castoro", main=True),
   P("Maniglia", "Rivestita Similpelle Inca 0419 Caffè", "faux", "marrone", "brown", "Inca 0419 Caffè", "handle"))
ex("FEB-051", "B_321", 40, "Composizione a parete (cucina Modula)",
   P("Ante colonne", "Nobilitato Basalto", "mel", "tortora", "taupe", "Basalto", "front", True),
   P("Top e schienale", "Lam. Marmo Imperiale", "ceramic", "marrone scuro venato", "brown", "Laminam Marmo Imperiale", "top"),
   P("Ante pensili", "Pet Acciaio Champagne", "pet", "champagne", "gold", "Acciaio Champagne", "doors"),
   P("Schienale", "Lam. Fenix Grigio Aragona", "lam", "grigio scuro", "dgrey", "Fenix Grigio Aragona"))
ex("FEB-052", "B_322", 41, "Tavolo MADEIRA",
   P("Top", "Cristallo velvet_Nero opaco", "glass", "nero opaco", "black", "Cristallo Velvet Nero Opaco", "top", True),
   P("Struttura", "Ottone Scuro", "brass", "ottone scuro", "brass", role="base"),
   nota="El libro dice vidrio (Cristallo Velvet); el 28/09 se había dicho gres. Pendiente de confirmar con Febal.")
ex("FEB-053", "B_323", 41, "Sedia NINA",
   P("Rivestimento", "Bouquet Antracite", "velvet", "antracite", "anth", role="upholstery", main=True),
   nota="Material (terciopelo) según la captura; el libro da solo el color.")
ex("FEB-054", "B_324", 41, "Madia LEAF",
   P("Ante / Cassa", "Laccato Opaco Metal Viva Champagne", "metalskin", "champagne", "gold", "Metal Viva Champagne", "front", True),
   P("Top", "Nobilitato Marmo Imperiale", "marble_fx", "marrone scuro venato", "brown", "Marmo Imperiale", "top"),
   P("Piedi", "Metallo Carbon Grey", "metal", "antracite", "anth", "Carbon Grey", "legs"))
ex("FEB-100", "B_341", 42, "Armadio HALLEY",
   P("Ante Superiori", "Nobilitato Desert", "mel", "crema", "cream", "Desert", "front", True),
   P("Ante Inferiori", "Nobilitato Rovere Asiatico", "mel", "rovere scuro", "wood", "Rovere Asiatico", "doors"),
   P("Maniglia e Profili", "Laccato Marrone Corteccia", "lac", "marrone scuro", "brown", "Marrone Corteccia", "handle"))
ex("FEB-055", "B_342", 43, "Libreria TRENTA",
   P("Spalle / Fasce / Schiena / Ante", "Nobilitato Rovere Asiatico", "mel", "rovere scuro", "wood", "Rovere Asiatico", main=True),
   P("Pann. Interno Nicchia", "Lacc. Metal Viva Champagne", "metalskin", "champagne", "gold", "Metal Viva Champagne"))
ex("FEB-101", "B_343", 44, "Letto ARDEN",
   P("Giroletto / Testata", "Impiallacciato Rovere Smoke tipo Eccimeri", "oak", "rovere scuro", "wood", "Rovere Smoke", main=True))
ex("FEB-056", "B_344", 44, "Gruppo NOTTE - comodini MARLENE",
   P("Struttura", "Laccato Opaco Metal Viva Champagne", "metalskin", "champagne", "gold", "Metal Viva Champagne", main=True),
   P("Top", "Nobilitato Rovere Asiatico", "mel", "rovere scuro", "wood", "Rovere Asiatico", "top"),
   P("Maniglia", "Rivestita Similpelle Inca 0419 Caffè", "faux", "marrone", "brown", "Inca 0419 Caffè", "handle"))
ex("FEB-058", "B_361", 45, "Armadio MOMENTI",
   P("Colore facciata", "Nobilitato Porfido", "mel", "grigio chiaro", "grey", "Porfido", "front", True),
   P("Cassa / Schiena / Finiture", "Nobilitato Canapa Opaco", "mel", "beige chiaro", "beige", "Canapa Opaco"),
   P("Elemento a giorno / Scrivania / Comodino", "Nobilitato Bronzo Ossidato", "mel", "marrone scuro", "brown", "Bronzo Ossidato", "shelves"),
   P("Maniglia PIN / Piede", "Champagne Spazzolato", "metal", "champagne", "gold", role="handle"))
ex("FEB-059", "B_362", 46, "Letto MOMENTI",
   P("Tessuto", "Ecochic Colore Dorian", "fabric", "grigio chiaro", "grey", "Ecochic Dorian", main=True))
ex("FEB-060", "B_363", 46, "Libreria INFINITY",
   P("Ante", "Nobilitato Porfido", "mel", "grigio chiaro", "grey", "Porfido", "doors", True),
   P("Struttura / Schiena", "Nobilitato Bronzo Ossidato", "mel", "marrone scuro", "brown", "Bronzo Ossidato", "structure"))
ex("FEB-061", "B_364", 46, "Pouf WINDSOR",
   P("Rivestimento", "Campsbay Natural", "fabric", "beige", "beige", role="upholstery", main=True))

# ---------------------------------------------------------------- CASA 4 · A-Mare
for pid in ("FEB-063", "FEB-064"):
    ex(pid, "B_401", 49, "LIBRERIA TRENTA / BOISERIE",
       P("Spalle Ripiani Schiene", "Laccato Opaco Bianco Kent", "lac", "bianco", "white", "Bianco Kent", main=True),
       P("Mensole / Telaio Ripiani Plus", "Metallo Silver Shade", "metal", "grigio", "grey", "Silver Shade", "shelves"),
       P("Ripiani Plus", "Vetro Trasparente", "glass", "vetro", "smoke", role="shelves"),
       P("Cassetti", "Laccato Opaco Metal Viva Champagne", "metalskin", "champagne", "gold", "Metal Viva Champagne"))
ex("FEB-065", "B_402", 49, "Madia ZAHA HADID",
   P("Anta", "Vetro Metal Viva Champagne", "glass", "champagne", "gold", "Vetro Metal Viva Champagne", "front", True),
   P("Struttura", "Laccato Metal Viva Champagne", "metalskin", "champagne", "gold", "Metal Viva Champagne", "structure"),
   P("Piedi", "Metallo Silver Shade", "metal", "grigio", "grey", "Silver Shade", "legs"))
ex("FEB-066", "B_403", 50, "Divano NAVIGLI",
   P("Rivestimento", "Roma Vanilla Ice", "boucle", "bianco panna", "white", role="upholstery", main=True),
   P("Struttura", "Nero", None, "nero", "black", role="structure"),
   nota="Material (bouclé) según la captura; el libro da el tejido Roma Vanilla Ice.")
ex("FEB-067", "B_421", 51, "Libreria LAPIS ELDOM",
   P("Struttura", "Carbon grey", "metal", "antracite", "anth", "Carbon Grey", "structure", True),
   P("Mensole", "Lac. Op. Castoro", "lac", "tortora", "beige", "Castoro", "shelves"),
   P("Mensole", "Vetro", "glass", "vetro", "smoke", role="shelves"))
ex("FEB-068", "B_422", 51, "Composizione COLONNE (cucina Origina Sagoma 37)",
   P("Ante", "Nobilitato Eucalipto", "mel", "marrone scuro", "wood", "Eucalipto", "front", True))
ex("FEB-069", "B_423", 51, "Composizione PENISOLA (cucina Origina Sagoma 37)",
   P("Ante", "Lac. Luc. Marrone Corteccia", "gloss", "marrone scuro lucido", "brown", "Marrone Corteccia", "front", True),
   P("Top e fianchi", "Abitum Marmo Brown Rigato", "marble_fx", "marrone venato", "brown", role="top"),
   P("Elementi a giorno", "Lac. Op. Castoro", "lac", "tortora", "beige", "Castoro", "shelves"))
ex("FEB-072", "B_442", 52, "Tavolo LEEDS (Bontempi)",
   P("Top", "Impiallacciato Rovere Spessart", "oak", "rovere scuro", "wood", "Rovere Spessart", "top", True),
   P("Struttura", "Ottone Scuro", "brass", "ottone scuro", "brass", role="base"))
ex("FEB-073", "B_443", 52, "Sedia NIVES BRACCIOLI (Bontempi)",
   P("Rivestimento", "Pelle Premium Fango", "leather", "tortora scuro", "greybrown", "Premium Fango", "upholstery", True),
   P("Struttura", "Ottone Scuro", "brass", "ottone scuro", "brass", role="legs"))
ex("FEB-074", "B_461", 53, "Armadio Scorrevole RODIN",
   P("Ante / Fianchi", "Laccato Opaco Bianco Kent", "lac", "bianco", "white", "Bianco Kent", "front", True),
   P("Maniglie e Profili", "Laccato Opaco Bianco Kent", "lac", "bianco", "white", "Bianco Kent", "handle"),
   P("Casse Interne / Schiene", "Nobilitato Trama Natural", "mel", "grigio chiaro", "grey", "Trama Natural", "interior"))
ex("FEB-075", "B_465", 55, "Cabina HYPE",
   P("Pannelli", "Laccato Opaco Bianco Kent", "lac", "bianco", "white", "Bianco Kent", main=True),
   P("Mensole / Cassettiere", "Laccato Opaco Grigio Fango", "lac", "grigio scuro", "dgrey", "Grigio Fango", "shelves"),
   P("Struttura Metallo / Maniglie", "Silver Shade", "metal", "grigio", "grey", role="structure"),
   P("Cassettiere / Pannello a DX", "Specchio Bronzo", "mirror", "bronzo", "bronze", role="front"))
ex("FEB-076", "B_501", 56, "Composizione ISOLA (Origina Onda, Zaha Hadid)",
   P("Anta", "Onda Zaha Hadid Metal Champagne", "glass", "champagne", "gold", "Onda Metal Champagne", "front", True),
   P("Anta", "Lac. Metal Viva Champagne", "metalskin", "champagne", "gold", "Metal Viva Champagne", "doors"),
   P("Top e fianchi", "Acciaio Inox Soft Touch", "steel", "acciaio", "grey", role="top"),
   P("Zoccolo", "Laminam Bianco Statuario Venato Soft Touch", "ceramic", "bianco venato", "white", "Laminam Bianco Statuario", "base"),
   nota="Material de la puerta Onda (vidrio) según la ficha oficial; el libro da el acabado Metal Champagne.")
ex("FEB-077", "B_502", 56, "Composizione COLONNE E RIENTRANTI (Origina Square)",
   P("Ante", "Imp. Op. Rovere Europeo vena cont.", "oak", "rovere naturale", "wood", "Rovere Europeo", "front", True),
   P("Schienali e top", "Laminam Bianco Statuario Venato Soft Touch", "ceramic", "bianco venato", "white", "Laminam Bianco Statuario", "top"),
   P("Mensole", "Lac. Metal Viva Champagne", "metalskin", "champagne", "gold", "Metal Viva Champagne", "shelves"))

# ---------------------------------------------------------------- GALLERIA
ex("FEB-079", "B_601", 58, "Armadio PROFILE / LEATHER",
   P("Ante", "Similpelle Inca 0101 Panna", "faux", "panna", "cream", "Inca 0101 Panna", "front", True),
   P("Fianchi / Schiene / Cappello Basi", "Nobilitato Noce", "mel", "noce", "brown", "Nobilitato Noce"),
   P("Maniglie e Profili", "Incasso Pelle Metal. Silver Shade", "metal", "grigio", "grey", "Silver Shade", "handle"))
ex("FEB-081", "B_603", 59, "Armadio PROFILE / SOLID",
   P("Ante", "Laccato Opaco Grigio Caldo", "lac", "grigio caldo", "grey", "Grigio Caldo", "front", True),
   P("Schiene", "Nobilitato Noce", "mel", "noce", "brown", "Nobilitato Noce", "interior"),
   P("Maniglie e Profili", "Metallo Silver Shade", "metal", "grigio", "grey", "Silver Shade", "handle"))
ex("FEB-083", "B_605", 61, "Armadio PROFILE / REFLEX",
   P("Ante", "Specchio Fumè", "mirror", "fumé", "smoke", "Specchio Fumé", "front", True),
   P("Maniglie e Profili", "Metallo Carbon Grey", "metal", "antracite", "anth", "Carbon Grey", "handle"),
   P("Fianchi / Schiene", "Nobilitato Trama Natural", "mel", "grigio chiaro", "grey", "Trama Natural", "interior"))
ex("FEB-084", "B_607", 62, "Armadio AURORA TELAIO",
   P("Ante", "Vetro Stopsol", "glass", "vetro fumé", "smoke", "Stopsol", "front", True),
   P("Fianchi / Cappello Basi", "Nobilitato Noce", "mel", "noce", "brown", "Nobilitato Noce"),
   P("Maniglie / Fianco telaio", "Metallo Silver Shade", "metal", "grigio", "grey", "Silver Shade", "frame"))
ex("FEB-085", "B_621", 63, "Composizione ISOLA e COLONNE RIENTRANTI (Origina telaio alluminio)",
   P("Ante isola", "Vetro Flutes Tortora", "glass", "tortora", "taupe", "Vetro Flutes Tortora", "front", True),
   P("Top", "Neolith Pietra di Luna Silk", "ceramic", "grigio chiaro", "grey", "Neolith Pietra di Luna", "top"),
   P("Ante colonne", "Nobilitato Rovere Africano", "mel", "rovere", "wood", "Rovere Africano", "doors"),
   P("Fianchi isola", "Lac. Op. Grigio Etna", "lac", "grigio", "grey", "Grigio Etna"),
   P("Piano snack / Ante pensili", "Fenix Beige Arizona", "lam", "beige", "beige", role="top"))
ex("FEB-086", "B_622", 64, "Armadio BARRET",
   P("Ante", "Impiallacciato Rovere Sand Eccimeri", "oak", "rovere", "wood", "Rovere Sand", "front", True),
   P("Maniglie V52P", "Similp. Inca 0419 Caffè", "faux", "marrone", "brown", "Inca 0419 Caffè", "handle"),
   P("Schiene / Fianchi / Cappello Basi", "Nobilitato Leather Grey", "mel", "grigio", "grey", "Leather Grey"))
ex("FEB-087", "B_623", 64, "Sgabelli LOLA",
   P("Rivestimento", "Bouquet Noce Moscata", "fabric", "marrone", "brown", role="upholstery", main=True),
   P("Struttura", "Sabbia", "metal", "sabbia", "beige", role="legs"))
ex("FEB-088", "B_641", 65, "Armadio LUMIA",
   P("Ante / Maniglie", "Laccato Opaco Grigio Caldo", "lac", "grigio caldo", "grey", "Grigio Caldo", "front", True),
   P("Fianchi / Cappello Basi", "Nobilitato Eucalipto", "mel", "marrone scuro", "wood", "Eucalipto"),
   P("Schiene", "Nobilitato Leather Grey", "mel", "grigio", "grey", "Leather Grey", "interior"))
ex("FEB-090", "B_643", 67, "Armadio LEWITT PLUS",
   P("Ante / Fianchi laterali", "Laccato Opaco Grigio Caldo", "lac", "grigio caldo", "grey", "Grigio Caldo", "front", True),
   P("Maniglie", "Laccato Opaco Marrone Corteccia", "lac", "marrone scuro", "brown", "Marrone Corteccia", "handle"),
   P("Fianchi / Schiene", "Nobilitato Leather Grey", "mel", "grigio", "grey", "Leather Grey", "interior"))
ex("FEB-091", "B_644", 68, "Tavolo MADEIRA",
   P("Top", "Cristallo Velvet Tortora Opaco", "glass", "tortora opaco", "taupe", role="top", main=True),
   P("Struttura", "Sabbia", "metal", "sabbia", "beige", role="base"),
   nota="El libro dice vidrio (Cristallo Velvet); el 28/09 se había dicho gres. Pendiente de confirmar con Febal.")
for pid, box, page in (("FEB-092", "B_645", 68), ("FEB-094", "B_665", 70)):
    ex(pid, box, page, "Sedia DEA",
       P("Rivestimento", "Bouquet Argan", "fabric", "marrone", "brown", role="upholstery", main=True),
       P("Struttura", "Sabbia", "metal", "sabbia", "beige", role="legs"))
ex("FEB-093", "B_664", 70, "Tavolo DANIEL",
   P("Top", "Supermarmo Lucido Etoile Gold", "marble_fx", "bianco venato oro", "whitegold", role="top", main=True),
   P("Struttura", "Sabbia", "metal", "sabbia", "beige", role="base"))

# Gres, ceramica, Laminam and Neolith are ceramic (Andrea, 28/09 and 30/09: "el material es gres, que es
# cerámica, y debe ofrecerse al pedir mármol aunque solo sea el acabado"): material.ceramic, which the pack
# offers for marble (marble → ceramic). Only non-ceramic marble looks (Supermarmo, Nobilitato Marmo,
# Optimum, Abitum) stay material.marble_effect.

# Wood said as "Impiallacciato rovere/noce" is both a veneer and that wood: the part keeps one material
# for its description and a silent twin (no text) so "chapa de madera" and "roble"/"nogal" both find it.
# Rio and Phoenix: the book says only "Rovere …", the capture saw veneer (legno impiallacciato).
WOOD = {"rovere": "material.oak", "noce": "material.walnut"}
VENEER_ALSO = {"FEB-004", "FEB-005", "FEB-034"}
for pid, e in E.items():
    have = {pt["material"] for pt in e["partes"]}
    for pt in list(e["partes"]):
        f = pt["acabado"].lower()
        if not (f.startswith("imp") or (pid in VENEER_ALSO and pt["material"] == M["oak"])):
            continue
        species = next((m for k, m in WOOD.items() if k in f), None)
        for mat in (M["veneer"], species):
            if mat and mat not in have:
                have.add(mat)
                e["partes"].append({"parte": f"{pt['parte']} (madera)", "acabado": pt["acabado"], "nombre": "", "material": mat,
                                    "color": "", "familias": [], "rol": pt["rol"], "principal": False})

# Ceramic with a marble or travertine look is gres for what it is made of, and marble-look for search
# and wording ("travertino" said about it must be backed): a silent marble-effect twin.
MARBLE_LOOK = ("marmo", "travertino", "statuario", "rosso domus")
for pid, e in E.items():
    have = {pt["material"] for pt in e["partes"]}
    for pt in list(e["partes"]):
        if pt["material"] == M["ceramic"] and any(w in pt["acabado"].lower() for w in MARBLE_LOOK) and M["marble_fx"] not in have:
            have.add(M["marble_fx"])
            e["partes"].append({"parte": f"{pt['parte']} (aspecto)", "acabado": pt["acabado"], "nombre": "", "material": M["marble_fx"],
                                "color": "", "familias": [], "rol": pt["rol"], "principal": False})

json.dump({"_fuente": SOURCE, **E}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(E), "piezas")
