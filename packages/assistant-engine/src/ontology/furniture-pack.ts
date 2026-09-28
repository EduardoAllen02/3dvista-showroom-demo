import type { Concept, ConceptRelation, MoodExpansion, OntologyPack } from "./types.js";

/**
 * Ontology pack "furniture" v1 (es / it / en).
 * Everything here is vocabulary, not product data: which surface forms mean the
 * same concept, which concepts are close, and (as a DRAFT until the client signs
 * it) which colors combine. Longest-match-first in the lexicon makes compound
 * false friends ("piel sintética", "effetto pelle") win over the bare word.
 */

const c = (
  id: string, facet: Concept["facet"], labels: [string, string, string],
  syn: { es?: string[]; it?: string[]; en?: string[] }, parent?: string, note?: string,
): Concept => ({ id, facet, parent, labels: { es: labels[0], it: labels[1], en: labels[2] }, synonyms: syn, note });

const CATEGORIES: Concept[] = [
  c("category.seating", "category", ["asiento", "seduta", "seating"], { es: ["asiento", "asientos"], it: ["sedute"], en: ["seating"] }),
  c("category.sofa", "category", ["sofá", "divano", "sofa"], { es: ["sofá", "sofás", "sofa", "sofas", "sillón de sala", "love seat", "loveseat", "sala", "salas"], it: ["divano", "divani", "divanetto"], en: ["sofa", "sofas", "couch", "couches", "settee"] }, "category.seating",
    "Sofá de varias plazas. En México 'sala' también se usa para el conjunto de sofás."),
  c("category.armchair", "category", ["sillón", "poltrona", "armchair"], { es: ["sillón", "sillones", "butaca", "butacas", "poltrona", "poltronas"], it: ["poltrona", "poltrone", "poltroncina", "poltroncine"], en: ["armchair", "armchairs", "lounge chair"] }, "category.seating"),
  c("category.pouf", "category", ["puf", "pouf", "pouf"], { es: ["puf", "pufs", "pouf", "poufs", "otomana", "otomanas", "reposapiés"], it: ["pouf", "pouff", "poggiapiedi"], en: ["pouf", "poufs", "ottoman", "ottomans", "footstool"] }, "category.seating"),
  c("category.chair", "category", ["silla", "sedia", "chair"], { es: ["silla", "sillas"], it: ["sedia", "sedie"], en: ["chair", "chairs", "dining chair"] }, "category.seating"),
  c("category.stool", "category", ["taburete", "sgabello", "stool"], { es: ["taburete", "taburetes", "banco alto", "bancos altos", "banco de barra"], it: ["sgabello", "sgabelli"], en: ["stool", "stools", "bar stool", "barstool"] }, "category.seating"),
  c("category.table", "category", ["mesa", "tavolo", "table"], { es: ["mesa", "mesas"], it: ["tavolo", "tavoli"], en: ["table", "tables"] }, undefined,
    "Cualquier mesa: de comedor o de centro."),
  c("category.dining_table", "category", ["mesa de comedor", "tavolo da pranzo", "dining table"], { es: ["mesa de comedor", "mesas de comedor", "comedor"], it: ["tavolo da pranzo", "tavoli da pranzo"], en: ["dining table", "dining tables"] }, "category.table"),
  c("category.coffee_table", "category", ["mesa de centro", "tavolino", "coffee table"], { es: ["mesa de centro", "mesas de centro", "mesita", "mesitas", "mesa auxiliar", "mesas auxiliares", "mesa baja", "mesa ratona"], it: ["tavolino", "tavolini", "coffee table", "tavolino da salotto"], en: ["coffee table", "coffee tables", "side table", "side tables"] }, "category.table"),
  c("category.sideboard", "category", ["aparador", "madia", "sideboard"], { es: ["aparador", "aparadores", "trinchador", "trinchadores", "credenza", "bufetera"], it: ["madia", "madie", "credenza", "credenze"], en: ["sideboard", "sideboards", "buffet", "credenza"] }),
  c("category.bookcase", "category", ["librero", "libreria", "bookcase"], { es: ["librero", "libreros", "librería", "estantería", "estanterías", "estante", "repisa"], it: ["libreria", "librerie", "scaffale"], en: ["bookcase", "bookcases", "bookshelf", "bookshelves", "shelving"] }),
  c("category.modular_system", "category", ["sistema modular", "sistema modulare", "modular system"], { es: ["sistema modular", "mueble modular", "pared equipada", "mueble de tv", "centro de entretenimiento", "mueble de sala"], it: ["sistema modulare", "sistemi modulari", "parete attrezzata", "pareti attrezzate", "mobile tv"], en: ["modular system", "wall unit", "tv unit", "media wall"] }),
  c("category.kitchen", "category", ["cocina", "cucina", "kitchen"], { es: ["cocina", "cocinas", "cocina integral", "cocinas integrales"], it: ["cucina", "cucine"], en: ["kitchen", "kitchens"] }),
  c("category.wardrobe", "category", ["armario", "armadio", "wardrobe"], { es: ["armario", "armarios", "clóset", "closet", "clósets", "closets", "ropero", "roperos", "guardarropa"], it: ["armadio", "armadi", "guardaroba"], en: ["wardrobe", "wardrobes", "closet", "closets"] }),
  c("category.walk_in_closet", "category", ["vestidor", "cabina armadio", "walk-in closet"], { es: ["vestidor", "vestidores", "cuarto de vestir"], it: ["cabina armadio", "cabine armadio"], en: ["walk-in closet", "walk in closet", "dressing room"] }, "category.wardrobe"),
  c("category.drawer_unit", "category", ["cajonera", "cassettiera", "chest of drawers"], { es: ["cajonera", "cajoneras"], it: ["cassettiera", "cassettiere"], en: ["chest of drawers", "drawer unit"] }),
  c("category.bedroom", "category", ["recámara", "camera da letto", "bedroom"], { es: ["recámara", "recámaras", "dormitorio", "dormitorios", "habitación"], it: ["camera da letto", "zona notte"], en: ["bedroom", "bedrooms"] }),
  c("category.bed", "category", ["cama", "letto", "bed"], { es: ["cama", "camas", "cabecera", "cabeceras"], it: ["letto", "letti", "testata", "testiera"], en: ["bed", "beds", "headboard"] }, "category.bedroom"),
  c("category.night_group", "category", ["mesita de noche", "gruppo notte", "nightstand"], { es: ["mesita de noche", "mesitas de noche", "buró", "burós", "cómoda", "cómodas", "sinfonier"], it: ["comodino", "comodini", "comò", "settimino", "gruppo notte"], en: ["nightstand", "nightstands", "bedside table", "dresser"] }, "category.bedroom"),
  c("category.boiserie", "category", ["boiserie", "boiserie", "wall panelling"], { es: ["boiserie", "panel de pared", "paneles de pared", "revestimiento de pared", "pared decorativa", "lambrín"], it: ["boiserie", "pannelli a parete"], en: ["boiserie", "wall panelling", "wall paneling", "wall panels"] }),
  c("category.mirror", "category", ["espejo", "specchio", "mirror"], { es: ["espejo", "espejos"], it: ["specchio", "specchi", "specchiera"], en: ["mirror", "mirrors"] }),
];

const SHAPES: Concept[] = [
  c("shape.corner", "shape", ["de ángulo", "ad angolo", "corner"], { es: ["de ángulo", "en ángulo", "angular", "esquinero", "esquineros", "esquinera", "rinconero", "rinconera", "en l", "en forma de l", "de esquina"], it: ["ad angolo", "angolare", "angolari", "a elle", "a l"], en: ["corner", "l-shaped", "l shaped", "sectional corner"] }, undefined,
    "Forma en L o esquinero. Incluye los sofás con chaise longue / penisola (decisión del cliente): un sofá con chaise es de ángulo."),
  c("shape.chaise", "shape", ["con chaise longue", "con chaise longue", "with chaise"], { es: ["chaise longue", "chaiselongue", "con chaise", "diván"], it: ["chaise longue", "chaiselongue", "penisola"], en: ["chaise", "chaise longue", "chaise lounge"] }, "shape.corner",
    "Módulo alargado sin respaldo para estirar las piernas (it. 'penisola' en sofás). En cocinas 'penisola' es península."),
  c("shape.modular", "shape", ["modular", "modulare", "modular"], { es: ["modular", "modulares", "componible", "seccional", "por módulos"], it: ["modulare", "modulari", "componibile", "componibili"], en: ["modular", "sectional"] }),
  c("shape.curved", "shape", ["curvo", "curvo", "curved"], { es: ["curvo", "curva", "curvado", "redondeado", "curvilíneo", "curvilínea", "sinuoso", "sinuosa"], it: ["curvo", "curva", "curvilineo", "curvilinea", "curvilinee", "sinuoso", "sinuosa", "curvato", "curvata", "curvatura", "arrotondato", "arrotondata"], en: ["curved", "rounded", "curvy"] }),
  c("shape.linear", "shape", ["lineal", "lineare", "linear"], { es: ["lineal", "recto", "recta"], it: ["lineare", "lineari"], en: ["linear", "straight"] }),
  c("shape.island", "shape", ["con isla", "a isola", "island"], { es: ["isla", "con isla", "de isla"], it: ["isola", "a isola"], en: ["island", "kitchen island"] }),
  c("shape.peninsula", "shape", ["con península", "a penisola", "peninsula"], { es: ["península", "con península"], it: ["penisola cucina"], en: ["peninsula"] }),
  c("shape.round", "shape", ["redondo", "rotondo", "round"], { es: ["redonda", "redondo", "redondas", "redondos", "circular", "circulares"], it: ["rotondo", "rotonda", "rotondi", "tondo", "tonda"], en: ["round", "circular"] }),
  c("shape.oval", "shape", ["ovalado", "ovale", "oval"], { es: ["ovalada", "ovalado", "ovaladas", "oval"], it: ["ovale", "ovali"], en: ["oval"] }),
  c("shape.rectangular", "shape", ["rectangular", "rettangolare", "rectangular"], { es: ["rectangular", "rectangulares"], it: ["rettangolare", "rettangolari"], en: ["rectangular"] }),
  c("shape.square", "shape", ["cuadrado", "quadrato", "square"], { es: ["cuadrada", "cuadrado", "cuadradas"], it: ["quadrato", "quadrata", "quadrati"], en: ["square"] }),
  c("shape.barrel", "shape", ["de tonel", "a botte", "barrel"], { es: ["de tonel", "tipo barril"], it: ["a botte"], en: ["barrel", "tonneau"] }),
  c("shape.extendable", "shape", ["extensible", "allungabile", "extendable"], { es: ["extensible", "extensibles", "extendible"], it: ["allungabile", "allungabili"], en: ["extendable", "extending", "expandable"] }),
  c("shape.swivel", "shape", ["giratorio", "girevole", "swivel"], { es: ["giratorio", "giratoria", "giratorios"], it: ["girevole", "girevoli"], en: ["swivel"] }),
  c("shape.hinged_doors", "shape", ["puertas abatibles", "ante battenti", "hinged doors"], { es: ["puertas abatibles", "puerta abatible", "batiente", "batientes"], it: ["battente", "battenti", "ante battenti"], en: ["hinged", "hinged doors"] }),
  c("shape.sliding_doors", "shape", ["puertas corredizas", "ante scorrevoli", "sliding doors"], { es: ["corredizas", "corrediza", "puertas corredizas", "deslizantes"], it: ["scorrevole", "scorrevoli", "ante scorrevoli"], en: ["sliding", "sliding doors"] }),
  c("shape.bridge", "shape", ["de puente", "a ponte", "bridge"], { es: ["de puente", "con puente", "portal", "con portal", "tipo puente"], it: ["a ponte", "con ponte", "portale", "vano ponte"], en: ["bridge", "over-bed"] }),
  c("shape.freestanding", "shape", ["centro de la habitación", "centro stanza", "freestanding"], { es: ["centro de la habitación", "al centro", "exento", "divisor"], it: ["centro stanza", "divisorio"], en: ["freestanding", "room divider"] }),
  c("shape.full_height", "shape", ["de piso a techo", "a tutta altezza", "full height"], { es: ["de piso a techo", "hasta el techo", "a toda altura"], it: ["a tutta altezza", "da terra a soffitto", "fino al soffitto"], en: ["full height", "floor to ceiling"] }),
  c("shape.u_shaped", "shape", ["en U", "a U", "U-shaped"], { es: ["en u", "en forma de u", "de herradura"], it: ["a u", "a ferro di cavallo"], en: ["u-shaped", "u shaped", "horseshoe"] }),
  c("shape.cylindrical", "shape", ["cilíndrico", "cilindrico", "cylindrical"], { es: ["cilíndrico", "cilíndrica", "cilindro", "tipo tambor"], it: ["cilindrico", "cilindrica", "cilindro"], en: ["cylindrical", "cylinder", "drum"] }),
  c("shape.enveloping", "shape", ["envolvente", "avvolgente", "wraparound"], { es: ["envolvente", "tipo concha", "de concha"], it: ["avvolgente", "a guscio", "a pozzetto"], en: ["wraparound", "shell", "tub chair"] }),
  c("shape.armless", "shape", ["sin brazos", "senza braccioli", "armless"], { es: ["sin brazos", "sin descansabrazos"], it: ["senza braccioli"], en: ["armless", "without arms"] }),
  c("shape.with_arms", "shape", ["con brazos", "con braccioli", "with arms"], { es: ["con brazos", "con descansabrazos", "con reposabrazos"], it: ["con braccioli", "con bracciolo"], en: ["with arms", "with armrests", "armchair-style"] }),
  c("shape.footrest", "shape", ["con reposapiés", "con poggiapiedi", "with footstool"], { es: ["con reposapiés", "con otomana", "con banquito"], it: ["con poggiapiedi", "con pouf"], en: ["with footstool", "with ottoman"] }),
  // No bare "abierto"/"open": too common in chat ("¿está abierto?") and would trip the answer scan.
  c("shape.open", "shape", ["sin puertas", "a giorno", "open shelving"], { es: ["sin puertas", "repisas abiertas", "estantería abierta", "librero abierto"], it: ["a giorno", "senza ante"], en: ["open shelving", "open shelves", "without doors"] }),
  c("shape.tv_unit", "shape", ["para TV", "porta TV", "for TV"], { es: ["para tv", "para la tele", "para televisión", "para la televisión"], it: ["porta tv", "porta-tv"], en: ["tv stand", "for the tv", "for tv"] }),
  // Bed sizes. No bare "individual"/"doble"/"single": "sillón individual" is not a bed.
  c("shape.double_bed", "shape", ["matrimonial", "matrimoniale", "double bed"], { es: ["matrimonial", "de matrimonio", "queen size", "king size", "tamaño queen", "tamaño king"], it: ["matrimoniale", "matrimoniali", "due piazze"], en: ["double bed", "queen size", "king size", "queen-size", "king-size"] }),
  c("shape.single_bed", "shape", ["de una plaza", "una piazza", "single bed"], { es: ["de una plaza", "una plaza", "plaza y media"], it: ["una piazza", "piazza e mezza", "singolo"], en: ["single bed", "twin bed", "twin size"] }),
];

const MATERIALS: Concept[] = [
  c("material.leather", "material", ["piel", "pelle", "leather"], { es: ["piel", "cuero", "piel auténtica", "piel natural", "cuero genuino"], it: ["pelle", "cuoio", "vera pelle", "pelle naturale"], en: ["leather", "genuine leather", "real leather"] }, undefined,
    "Piel animal auténtica. NO incluye similpiel/ecopelle/efecto piel (material.faux_leather) ni nobuk/nabuk (material.nubuck)."),
  c("material.faux_leather", "material", ["similpiel", "similpelle", "faux leather"], { es: ["similpiel", "piel sintética", "cuero sintético", "ecopiel", "polipiel", "vinipiel", "efecto piel", "piel vegana", "imitación piel"], it: ["similpelle", "ecopelle", "effetto pelle", "finta pelle"], en: ["faux leather", "leatherette", "eco-leather", "vegan leather", "leather-look", "leather look"] }),
  c("material.nubuck", "material", ["nobuk", "nabuk", "nubuck"], { es: ["nobuk", "nubuck", "nabuk"], it: ["nabuk", "nubuck"], en: ["nubuck", "nabuk"] }, undefined,
    "Acabado tipo nobuk. Si es piel real o microfibra está pendiente de validar (Nabuk Eagle)."),
  c("material.fabric", "material", ["tela", "tessuto", "fabric"], { es: ["tela", "telas", "tejido", "tejidos", "tapizado de tela", "textil"], it: ["tessuto", "tessuti", "stoffa"], en: ["fabric", "fabrics", "textile", "upholstery fabric", "cloth"] }),
  c("material.velvet", "material", ["terciopelo", "velluto", "velvet"], { es: ["terciopelo", "aterciopelado"], it: ["velluto", "vellutato"], en: ["velvet"] }, "material.fabric"),
  c("material.boucle", "material", ["bouclé", "bouclé", "bouclé"], { es: ["bouclé", "boucle", "borreguito"], it: ["bouclé", "boucle"], en: ["bouclé", "boucle"] }, "material.fabric"),
  c("material.microfiber", "material", ["microfibra", "microfibra", "microfiber"], { es: ["microfibra"], it: ["microfibra"], en: ["microfiber", "microfibre"] }, "material.fabric"),
  c("material.wood", "material", ["madera", "legno", "wood"], { es: ["madera", "maderas"], it: ["legno", "legni", "in legno", "ligneo", "lignea"], en: ["wood", "wooden", "timber"] }),
  c("material.wood_effect", "material", ["efecto madera", "effetto legno", "wood effect"], { es: ["efecto madera", "imitación madera", "tipo madera"], it: ["effetto legno", "aspetto legno", "finto legno"], en: ["wood effect", "wood look", "wood-look"] }, undefined,
    "Superficie que imita la madera (nobilitato, laminado): NO es madera ni chapa de madera."),
  c("material.wood_veneer", "material", ["chapa de madera", "impiallacciato", "wood veneer"], { es: ["chapa", "chapa de madera", "enchapado", "chapeado"], it: ["impiallacciato", "impiallacciati", "impiallacciatura"], en: ["veneer", "wood veneer"] }, "material.wood"),
  c("material.oak", "material", ["roble", "rovere", "oak"], { es: ["roble"], it: ["rovere"], en: ["oak"] }, "material.wood"),
  c("material.walnut", "material", ["nogal", "noce", "walnut"], { es: ["nogal"], it: ["noce"], en: ["walnut"] }, "material.wood"),
  c("material.eucalyptus", "material", ["eucalipto", "eucalipto", "eucalyptus"], { es: ["eucalipto"], it: ["eucalipto"], en: ["eucalyptus"] }, "material.wood"),
  c("material.melamine", "material", ["melamina", "nobilitato", "melamine"], { es: ["melamina", "melamínico", "aglomerado"], it: ["nobilitato", "nobilitati", "nobilitata", "nobilitate", "nobilitato noce", "nobilitato rovere", "nobilitato leather grey"], en: ["melamine", "laminated board"] }),
  c("material.laminate", "material", ["laminado", "laminato", "laminate"], { es: ["laminado", "fenix"], it: ["laminato", "laminati", "fenix"], en: ["laminate", "hpl"] }),
  c("material.lacquer", "material", ["lacado", "laccato", "lacquer"], { es: ["lacado", "laqueado", "laca", "lacados"], it: ["laccato", "laccati", "laccata", "laccate", "laccatura"], en: ["lacquer", "lacquered"] }),
  c("material.lacquer_matt", "material", ["lacado mate", "laccato opaco", "matt lacquer"], { es: ["lacado mate", "laca mate"], it: ["laccato opaco", "laccati opachi", "laccata opaca", "laccate opache"], en: ["matt lacquer", "matte lacquer"] }, "material.lacquer"),
  c("material.lacquer_gloss", "material", ["lacado brillante", "laccato lucido", "gloss lacquer"], { es: ["lacado brillante", "laca brillante", "alto brillo"], it: ["laccato lucido", "monolaccato lucido"], en: ["gloss lacquer", "high gloss"] }, "material.lacquer"),
  c("material.metal_skin", "material", ["efecto metal", "metal skin", "metal-effect"], { es: ["efecto metal", "metálico", "metal skin"], it: ["metal skin", "metalskin", "laccato metal", "laccato metalskin", "effetto metallo"], en: ["metal skin", "metal effect", "metallic finish"] }),
  c("material.metal", "material", ["metal", "metallo", "metal"], { es: ["metal", "hierro"], it: ["metallo", "ferro"], en: ["metal", "iron"] }),
  c("material.aluminium", "material", ["aluminio", "alluminio", "aluminium"], { es: ["aluminio"], it: ["alluminio"], en: ["aluminium", "aluminum"] }, "material.metal"),
  c("material.brass", "material", ["latón", "ottone", "brass"], { es: ["latón"], it: ["ottone"], en: ["brass"] }, "material.metal"),
  c("material.steel", "material", ["acero", "acciaio", "steel"], { es: ["acero", "acero inoxidable"], it: ["acciaio", "inox"], en: ["steel", "stainless steel"] }, "material.metal"),
  c("material.glass", "material", ["vidrio", "vetro", "glass"], { es: ["vidrio", "cristal", "vidrios", "cristales"], it: ["vetro", "vetri", "cristallo", "cristallo velvet"], en: ["glass", "crystal"] }),
  c("material.mirror", "material", ["espejo", "specchio", "mirror"], { es: ["espejo", "espejado"], it: ["specchio", "specchiato"], en: ["mirror", "mirrored"] }, "material.glass"),
  c("material.ceramic", "material", ["cerámica", "ceramica", "ceramic"], { es: ["cerámica", "porcelánico", "porcelanato", "gres", "laminam", "neolith", "superceramica"], it: ["ceramica", "gres", "superceramica", "laminam", "neolith", "grès"], en: ["ceramic", "porcelain", "stoneware", "sintered stone"] }),
  c("material.marble", "material", ["mármol", "marmo", "marble"], { es: ["mármol", "marmol", "mármol natural"], it: ["marmo", "marmo naturale"], en: ["marble", "natural marble"] }, undefined,
    "Mármol natural. NO incluye efecto mármol (supermarmo, Scenario): eso es material.marble_effect."),
  c("material.marble_effect", "material", ["efecto mármol", "effetto marmo", "marble effect"], { es: ["efecto mármol", "efecto marmol", "imitación mármol", "tipo mármol"], it: ["effetto marmo", "supermarmo", "finto marmo"], en: ["marble effect", "marble look", "faux marble"] }, undefined,
    "Superficie que imita el mármol (supermarmo, Scenario): NO es mármol natural; decirlo así."),
  c("material.stone", "material", ["piedra", "pietra", "stone"], { es: ["piedra", "piedra natural"], it: ["pietra", "pietra naturale"], en: ["stone", "natural stone"] }, undefined,
    "Piedra natural. NO incluye efecto piedra ni efecto cemento (material.stone_effect)."),
  c("material.stone_effect", "material", ["efecto piedra", "effetto pietra", "stone effect"], { es: ["efecto piedra", "efecto cemento", "cemento", "efecto travertino"], it: ["effetto pietra", "effetto cemento", "cemento", "effetto travertino"], en: ["stone effect", "concrete", "concrete effect"] }, undefined,
    "Superficie que imita piedra o cemento: NO es piedra natural; decirlo así."),
  c("material.plastic", "material", ["PET / plexiglás", "PET / plexiglass", "PET / plexiglass"], { es: ["plexiglás", "acrílico", "pet"], it: ["plexiglass", "pet"], en: ["plexiglass", "acrylic", "pet"] }),
];

const COLORS: Concept[] = [
  c("color.white", "color", ["blanco", "bianco", "white"], { es: ["blanco", "blanca", "blancos", "blancas"], it: ["bianco", "bianca", "bianchi"], en: ["white"] }),
  c("color.cream", "color", ["crema", "panna", "cream"], { es: ["crema", "marfil", "hueso", "perla"], it: ["panna", "crema", "avorio", "perla"], en: ["cream", "ivory", "off-white", "off white"] }),
  c("color.beige", "color", ["beige", "beige", "beige"], { es: ["beige", "beis", "arena", "arenas", "topo", "greige"], it: ["beige", "sabbia", "tortora", "corda", "canapa", "talpa"], en: ["beige", "sand", "taupe", "greige", "linen"] }),
  c("color.grey", "color", ["gris", "grigio", "grey"], { es: ["gris", "grises", "gris oscuro", "gris claro", "plata", "plateado", "gris perla"], it: ["grigio", "grigi", "grigia", "argento", "grigio perla"], en: ["grey", "gray", "silver", "pearl grey", "pearl gray"] }),
  c("color.anthracite", "color", ["antracita", "antracite", "anthracite"], { es: ["antracita", "grafito", "carbón", "gris carbón"], it: ["antracite", "grafite", "carbone"], en: ["anthracite", "graphite", "charcoal"] }, "color.grey"),
  c("color.black", "color", ["negro", "nero", "black"], { es: ["negro", "negra", "negros", "negras"], it: ["nero", "nera", "neri"], en: ["black"] }),
  c("color.brown", "color", ["café", "marrone", "brown"], { es: ["café", "cafés", "marrón", "marrones", "chocolate", "cognac", "coñac", "tabaco", "moka", "caramelo", "camel", "avellana"], it: ["marrone", "marroni", "moro", "testa di moro", "cioccolato", "tabacco", "caffè", "cognac", "moka", "nocciola"], en: ["brown", "chocolate", "cognac", "tobacco", "coffee", "espresso", "mocha", "camel", "caramel", "hazelnut"] }, undefined,
    "En México 'café' es el color marrón."),
  c("color.natural_wood", "color", ["madera natural", "legno naturale", "natural wood"], { es: ["madera natural", "tono madera", "color madera", "roble natural"], it: ["legno naturale", "naturale"], en: ["natural wood", "wood tone"] }, "color.brown"),
  c("color.yellow", "color", ["amarillo", "giallo", "yellow"], { es: ["amarillo", "amarilla", "amarillos", "amarillas", "mostaza", "ocre", "dorado claro", "limón"], it: ["giallo", "gialla", "gialli", "senape", "ocra", "limone"], en: ["yellow", "mustard", "ochre", "ocher", "lemon", "sunflower", "curry"] }),
  c("color.gold", "color", ["dorado", "oro", "gold"], { es: ["dorado", "dorada", "oro", "champán", "champagne"], it: ["oro", "dorato", "champagne", "ottone"], en: ["gold", "golden", "champagne", "brass"] }),
  c("color.bronze", "color", ["bronce", "bronzo", "bronze"], { es: ["bronce", "cobre", "cobrizo"], it: ["bronzo", "rame"], en: ["bronze", "copper"] }),
  c("color.orange", "color", ["naranja", "arancione", "orange"], { es: ["naranja", "naranjas", "anaranjado", "terracota", "óxido"], it: ["arancione", "arancio", "terracotta", "ruggine"], en: ["orange", "terracotta", "rust"] }),
  c("color.red", "color", ["rojo", "rosso", "red"], { es: ["rojo", "roja", "rojos", "rojas", "vino", "tinto", "borgoña", "burdeos", "granate", "ladrillo"], it: ["rosso", "rossa", "rossi", "bordeaux", "mattone", "marsala"], en: ["red", "burgundy", "wine", "brick", "marsala"] }),
  c("color.pink", "color", ["rosa", "rosa", "pink"], { es: ["rosa", "rosado", "rosada", "palo de rosa", "rosa palo"], it: ["rosa", "rosato", "cipria"], en: ["pink", "blush", "rose", "powder pink"] }),
  c("color.purple", "color", ["morado", "viola", "purple"], { es: ["morado", "morada", "violeta", "lila", "berenjena"], it: ["viola", "lilla", "melanzana"], en: ["purple", "violet", "lilac", "plum"] }),
  c("color.blue", "color", ["azul", "blu", "blue"], { es: ["azul", "azules", "azul marino", "marino", "petróleo", "turquesa", "celeste"], it: ["blu", "azzurro", "blu notte", "ottanio", "turchese", "petrolio"], en: ["blue", "navy", "petrol", "teal", "turquoise", "denim"] }),
  c("color.green", "color", ["verde", "verde", "green"], { es: ["verde", "verdes", "verde oliva", "oliva", "salvia", "esmeralda", "menta", "verdoso"], it: ["verde", "verdi", "oliva", "salvia", "smeraldo", "menta", "verdastro", "verdognolo"], en: ["green", "olive", "sage", "emerald", "mint"] }),
  c("color.transparent", "color", ["transparente", "trasparente", "transparent"], { es: ["transparente", "fumé", "ahumado"], it: ["trasparente", "fumé", "fume"], en: ["transparent", "clear", "smoked"] }),
];

const TONES: Concept[] = [
  c("tone.light", "tone", ["claro", "chiaro", "light"], { es: ["claro", "clara", "claros", "claritos", "clarito", "más claro"], it: ["chiaro", "chiara", "chiari", "più chiaro"], en: ["light", "lighter", "pale"] }),
  c("tone.dark", "tone", ["oscuro", "scuro", "dark"], { es: ["oscuro", "oscura", "oscuros", "más oscuro"], it: ["scuro", "scura", "scuri", "più scuro"], en: ["dark", "darker", "deep"] }),
];

const STYLES: Concept[] = [
  c("style.contemporary", "style", ["contemporáneo", "contemporaneo", "contemporary"], { es: ["contemporáneo", "contemporánea", "moderno", "moderna", "actual"], it: ["contemporaneo", "contemporanea", "moderno", "moderna", "attuale"], en: ["contemporary", "modern"] }),
  c("style.minimal", "style", ["minimalista", "minimal", "minimal"], { es: ["minimalista", "minimal", "sobrio", "esencial", "racional", "limpio", "lineal"], it: ["minimal", "minimale", "minimalista", "essenziale", "razionale", "rigoroso", "lineare"], en: ["minimal", "minimalist", "essential", "clean"] }),
  c("style.classic", "style", ["clásico", "classico", "classic"], { es: ["clásico", "clásica", "atemporal", "tradicional", "señorial"], it: ["classico", "classica", "senza tempo", "tradizionale", "signorile", "intramontabile"], en: ["classic", "timeless", "traditional"] }),
  c("style.elegant", "style", ["elegante", "elegante", "elegant"], { es: ["elegante", "elegantes", "refinado", "refinada", "sofisticado", "sofisticada", "fino", "fina", "chic", "distinguido", "lujoso", "lujosa", "de lujo", "exclusivo"], it: ["elegante", "eleganza", "raffinato", "raffinata", "raffinatezza", "sofisticato", "chic", "lussuoso", "di lusso", "esclusivo"], en: ["elegant", "refined", "sophisticated", "fancy", "chic", "luxurious", "upscale", "posh", "classy"] }, undefined,
    "Elegante NO es clásico: muchas piezas modernas son elegantes."),
  c("style.warm", "style", ["cálido y acogedor", "caldo accogliente", "warm and cozy"], { es: ["cálido", "cálida", "acogedor", "acogedora", "confortable", "hogareño"], it: ["caldo", "accogliente", "avvolgente"], en: ["warm", "cozy", "cosy", "inviting"] }),
  c("style.natural", "style", ["natural", "naturale", "natural"], { es: ["natural", "orgánico"], it: ["naturale", "organico"], en: ["natural", "organic"] }),
  c("style.industrial", "style", ["industrial", "industriale", "industrial"], { es: ["industrial"], it: ["industriale"], en: ["industrial"] }),
  c("style.nordic", "style", ["nórdico", "nordico", "nordic"], { es: ["nórdico", "escandinavo", "escandinava"], it: ["nordico", "scandinavo"], en: ["nordic", "scandinavian", "scandi"] }),
  c("style.rustic", "style", ["rústico", "rustico", "rustic"], { es: ["rústico", "rústica", "campestre"], it: ["rustico", "country"], en: ["rustic", "farmhouse", "country"] }),
  c("style.vintage", "style", ["vintage", "vintage", "vintage"], { es: ["vintage", "retro", "retró"], it: ["vintage", "rétro"], en: ["vintage", "retro"] }),
];

const MOODS: Concept[] = [
  c("mood.cozy", "mood", ["acogedor", "accogliente", "cozy"], { es: ["acogedor", "acogedora", "calidez", "cómodo"], it: ["accogliente", "comodo"], en: ["cozy", "cosy", "comfy"] }),
  c("mood.bright", "mood", ["luminoso", "luminoso", "bright"], { es: ["luminoso", "luminosa", "con luz"], it: ["luminoso", "luminosa"], en: ["bright", "airy"] }),
  c("mood.bold", "mood", ["atrevido", "audace", "bold"], { es: ["atrevido", "llamativo", "audaz", "con carácter"], it: ["audace", "di carattere"], en: ["bold", "statement"] }),
  c("mood.compact", "mood", ["compacto", "compatto", "compact"], { es: ["pequeño", "pequeña", "compacto", "compacta", "poco espacio", "espacio reducido"], it: ["piccolo", "compatto", "salvaspazio"], en: ["small", "compact", "space-saving"] }),
];

const h = (a: string, b: string, distance: number): ConceptRelation => ({ from: a, to: b, type: "harmonizes", distance, status: "draft" });
const n = (a: string, b: string, distance: number): ConceptRelation => ({ from: a, to: b, type: "near", distance, status: "signed" });

/** DRAFT harmony table (docs clean-room §2.4) — to be signed by the client (P3). */
const HARMONIES: ConceptRelation[] = [
  h("color.yellow", "color.brown", 0.4), h("color.yellow", "color.grey", 0.5), h("color.yellow", "color.blue", 0.5),
  h("color.yellow", "color.white", 0.6), h("color.yellow", "color.black", 0.6),
  h("color.green", "color.beige", 0.4), h("color.green", "color.brown", 0.4), h("color.green", "color.white", 0.5), h("color.green", "color.pink", 0.6),
  h("color.pink", "color.grey", 0.4), h("color.pink", "color.white", 0.5),
  h("color.blue", "color.beige", 0.4), h("color.blue", "color.white", 0.4), h("color.blue", "color.brown", 0.5),
  h("color.red", "color.grey", 0.5), h("color.red", "color.beige", 0.5),
  h("color.orange", "color.blue", 0.5), h("color.orange", "color.beige", 0.5),
  h("color.purple", "color.grey", 0.5),
  h("color.brown", "color.beige", 0.4), h("color.brown", "color.cream", 0.4),
  h("color.black", "color.white", 0.5), h("color.grey", "color.white", 0.4),
];

/** Perceptual/material closeness — vocabulary facts, not taste. */
const NEAR: ConceptRelation[] = [
  n("material.leather", "material.nubuck", 0.3), n("material.leather", "material.faux_leather", 0.3),
  n("material.velvet", "material.fabric", 0.3), n("material.boucle", "material.fabric", 0.3), n("material.microfiber", "material.fabric", 0.3),
  n("material.lacquer_matt", "material.lacquer_gloss", 0.4), n("material.wood_veneer", "material.melamine", 0.5),
  n("material.wood_effect", "material.wood", 0.3), n("material.wood_effect", "material.wood_veneer", 0.4),
  n("material.marble", "material.marble_effect", 0.2), n("material.stone", "material.stone_effect", 0.2),
  n("material.marble_effect", "material.stone_effect", 0.3), n("material.marble_effect", "material.ceramic", 0.3),
  n("material.marble", "material.ceramic", 0.4), n("material.marble", "material.stone", 0.4),
  n("shape.corner", "shape.modular", 0.5), n("shape.round", "shape.oval", 0.3),
  n("shape.island", "shape.peninsula", 0.3), n("shape.rectangular", "shape.square", 0.4), n("shape.rectangular", "shape.barrel", 0.3),
  n("color.yellow", "color.gold", 0.3), n("color.yellow", "color.orange", 0.4), n("color.beige", "color.cream", 0.2),
  n("color.cream", "color.white", 0.2), n("color.grey", "color.anthracite", 0.2), n("color.anthracite", "color.black", 0.3),
  n("color.brown", "color.bronze", 0.3), n("color.brown", "color.beige", 0.5), n("color.red", "color.pink", 0.4),
  n("color.red", "color.orange", 0.4), n("color.purple", "color.pink", 0.4), n("color.blue", "color.green", 0.6),
  n("style.minimal", "style.contemporary", 0.4), n("style.industrial", "style.minimal", 0.5), n("style.nordic", "style.natural", 0.3),
  n("style.nordic", "style.minimal", 0.4), n("style.rustic", "style.natural", 0.3), n("style.vintage", "style.classic", 0.5), n("style.classic", "style.elegant", 0.3),
  n("style.warm", "style.natural", 0.4),
  n("category.sofa", "category.armchair", 0.6), n("category.armchair", "category.pouf", 0.6),
  n("category.dining_table", "category.coffee_table", 0.7), n("category.bookcase", "category.modular_system", 0.4),
  n("category.wardrobe", "category.walk_in_closet", 0.3), n("category.sideboard", "category.modular_system", 0.5),
  n("category.chair", "category.stool", 0.5), n("category.bed", "category.night_group", 0.7),
];

const MOOD_EXPANSIONS: MoodExpansion[] = [
  { mood: "mood.cozy", prefer: ["style.warm", "material.velvet", "material.boucle", "material.fabric", "material.wood", "color.brown", "color.beige", "color.yellow", "color.green"] },
  { mood: "mood.bright", prefer: ["color.white", "color.cream", "color.beige", "tone.light", "material.glass", "material.mirror"] },
  { mood: "mood.bold", prefer: ["color.yellow", "color.blue", "color.green", "color.red", "material.velvet", "material.metal_skin"] },
  { mood: "mood.compact", prefer: ["category.armchair", "category.pouf"] },
];

/** Names and parts that contain a concept word but are not that concept (see OntologyPack.stop_phrases). */
const STOP_PHRASES = [
  "anta square", "ante square",                       // door model "Square", not a square shape
  "schienali scorrevoli", "schienale scorrevole",     // sliding backrests of a sofa, not sliding doors
  "maniglie a ponte", "maniglia a ponte",             // bridge handles, not a bridge wardrobe
  "tv girevole", "centrotavola girevole",             // the TV holder / the lazy susan swivels, not the piece
  "gambe lineari",                                    // straight legs, not a linear sofa
  "portale tv",                                       // a TV frame, not a bridge wardrobe
];

export const FURNITURE_PACK: OntologyPack = {
  id: "furniture",
  version: "1.0.0",
  concepts: [...CATEGORIES, ...SHAPES, ...MATERIALS, ...COLORS, ...TONES, ...STYLES, ...MOODS],
  relations: [...HARMONIES, ...NEAR],
  moods: MOOD_EXPANSIONS,
  stop_phrases: STOP_PHRASES,
};
