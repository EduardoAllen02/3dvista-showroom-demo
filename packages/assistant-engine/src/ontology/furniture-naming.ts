import type { ConceptId } from "../catalog/types.js";
import { Lexicon, normalizeText } from "./lexicon.js";

/**
 * Proposals (never truth until reviewed) that turn official finish names into
 * ontology concepts: color family + tone for an option name ("Grigio Perla",
 * "Racing Green", "Rovere caffè"), and material for a collection/line name
 * ("LACCATO OPACO", "BOSTON"). Name evidence first, swatch colour second; when
 * both exist and disagree the proposal is flagged for the reviewer.
 */

// Basic colour words win over descriptive ones inside the same name ("Grigio Perla" → grey).
const BASIC: Record<string, ConceptId> = {
  bianco: "color.white", white: "color.white", nero: "color.black", black: "color.black",
  grigio: "color.grey", grey: "color.grey", gray: "color.grey", marrone: "color.brown", brown: "color.brown",
  giallo: "color.yellow", yellow: "color.yellow", verde: "color.green", green: "color.green",
  blu: "color.blue", blue: "color.blue", azzurro: "color.blue", rosso: "color.red", red: "color.red",
  rosa: "color.pink", pink: "color.pink", viola: "color.purple", purple: "color.purple",
  arancio: "color.orange", arancione: "color.orange", orange: "color.orange", beige: "color.beige",
};

// Descriptive words seen in febalcasa.com option names (IT/EN), beyond the ontology synonyms.
const DESCRIPTIVE: Record<string, ConceptId> = {
  panna: "color.cream", avorio: "color.cream", ivory: "color.cream", cream: "color.cream", perla: "color.cream", pearl: "color.cream",
  shell: "color.cream", swan: "color.white", feather: "color.beige", crema: "color.cream",
  extrawhite: "color.white", snowwhite: "color.white", ottico: "color.white", marble: "color.white", calacatta: "color.white",
  valacatta: "color.white", arabescato: "color.white", statuario: "color.white", neve: "color.white", kent: "color.white", snow: "color.white",
  sabbia: "color.beige", sand: "color.beige", tortora: "color.beige", taupe: "color.beige", canapa: "color.beige", linen: "color.beige",
  dune: "color.beige", sahara: "color.beige", desert: "color.beige", natural: "color.beige", nature: "color.beige", mandorla: "color.beige",
  corda: "color.beige", limestone: "color.beige", botticino: "color.beige", greige: "color.beige", visone: "color.beige", castoro: "color.brown",
  fango: "color.brown", mud: "color.brown", cognac: "color.brown", tobacco: "color.brown", tabacco: "color.brown", espresso: "color.brown",
  moka: "color.brown", mocha: "color.brown", caffe: "color.brown", coffee: "color.brown", choco: "color.brown", chocolate: "color.brown",
  bison: "color.brown", liver: "color.brown", camel: "color.brown", corteccia: "color.brown", moro: "color.brown", rosewood: "color.brown",
  noce: "color.brown", walnut: "color.brown", rovere: "color.natural_wood", oak: "color.natural_wood", eucalipto: "color.natural_wood",
  cacao: "color.brown", castano: "color.brown", braun: "color.brown",
  acacia: "color.natural_wood", termotrattato: "color.natural_wood", termo: "color.natural_wood", wood: "color.natural_wood", ilice: "color.natural_wood",
  antracite: "color.anthracite", anthracite: "color.anthracite", anthrancite: "color.anthracite", grafite: "color.anthracite",
  graphite: "color.anthracite", carbone: "color.anthracite", charcoal: "color.anthracite", coal: "color.anthracite", ardesia: "color.anthracite",
  piombo: "color.grey", pewter: "color.grey", cemento: "color.grey", cement: "color.grey", stone: "color.grey", steel: "color.grey",
  iron: "color.grey", silver: "color.grey", argento: "color.grey", platinum: "color.grey", titanio: "color.grey", titan: "color.grey",
  mineral: "color.grey", dust: "color.grey", fume: "color.grey", fumo: "color.grey", ghiaia: "color.grey", basalto: "color.grey",
  greystone: "color.grey", stopsol: "color.grey", carbon: "color.anthracite",
  caviar: "color.black", raven: "color.black", noir: "color.black", ink: "color.blue", intenso: "color.black",
  mustard: "color.yellow", senape: "color.yellow", sunflower: "color.yellow", curry: "color.yellow", ocra: "color.yellow",
  lemon: "color.yellow", mais: "color.yellow", sun: "color.yellow", gold: "color.gold", oro: "color.gold", champagne: "color.gold",
  ottone: "color.gold", brass: "color.gold", bronzo: "color.bronze", bronze: "color.bronze", copper: "color.bronze", rame: "color.bronze",
  terracotta: "color.orange", pumpkin: "color.orange", rust: "color.orange", ruggine: "color.orange", coral: "color.orange", melon: "color.orange",
  mattone: "color.red", brick: "color.red", marsala: "color.red", bordeaux: "color.red", strawberry: "color.red", wine: "color.red",
  blush: "color.pink", rose: "color.pink", cipria: "color.pink", antico: "color.pink",
  navy: "color.blue", denim: "color.blue", petrol: "color.blue", petrolio: "color.blue", ottanio: "color.blue", oceano: "color.blue",
  ocean: "color.blue", ceruleo: "color.blue", turquoise: "color.blue", turchese: "color.blue", niagara: "color.blue", horizon: "color.blue",
  notte: "color.blue", azure: "color.blue", jeans: "color.blue",
  olive: "color.green", oliva: "color.green", sage: "color.green", salvia: "color.green", salice: "color.green", emerald: "color.green",
  thyme: "color.green", ivy: "color.green", hunter: "color.green", lime: "color.green", turtle: "color.green", cinabro: "color.green",
  vintage: "color.green", antigua: "color.green", mint: "color.green", menta: "color.green", smeraldo: "color.green",
  pine: "color.green", pino: "color.green",
  lilla: "color.purple", plum: "color.purple", lilac: "color.purple", lila: "color.purple", pureple: "color.purple",
  trasparente: "color.transparent", transparent: "color.transparent",
};

export interface ColorProposal {
  families: ConceptId[];
  tone: "light" | "medium" | "dark" | null;
  basis: "name" | "swatch" | "name+swatch" | "none";
  agree: boolean | null;   // null when only one of the two sources exists
  swatch_family: ConceptId | null;
}

function hexToHsl(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function swatchFamily(hex: string | null): { family: ConceptId | null; tone: ColorProposal["tone"] } {
  const hsl = hex ? hexToHsl(hex) : null;
  if (!hsl) return { family: null, tone: null };
  const [h, s, l] = hsl;
  const tone = l > 0.7 ? "light" : l < 0.33 ? "dark" : "medium";
  if (l < 0.14) return { family: "color.black", tone };
  if (s < 0.12) return { family: l > 0.86 ? "color.white" : l < 0.36 ? "color.anthracite" : "color.grey", tone };
  if (l > 0.85) return { family: "color.cream", tone };
  if (h >= 34 && h < 68 && s >= 0.5 && l >= 0.4) return { family: "color.yellow", tone };
  if (h >= 20 && h < 50 && s < 0.45 && l > 0.55) return { family: "color.beige", tone };
  if (h >= 8 && h < 45 && l <= 0.55) return { family: "color.brown", tone };
  if (h >= 45 && h < 68 && s >= 0.3) return { family: "color.yellow", tone };
  // Desaturated olive/khaki (Moss, Khaki) and vanilla creams: not red or pink.
  if (h >= 45 && h < 68) return { family: l > 0.75 ? "color.cream" : l > 0.55 ? "color.beige" : "color.green", tone };
  if (h >= 15 && h < 45) return { family: s > 0.5 ? "color.orange" : "color.beige", tone };
  if (h >= 68 && h < 170) return { family: "color.green", tone };
  if (h >= 170 && h < 260) return { family: "color.blue", tone };
  if (h >= 260 && h < 300) return { family: "color.purple", tone };
  if (l > 0.62) return { family: "color.pink", tone };
  return { family: "color.red", tone };
}

export function proposeColor(name: string, hex: string | null): ColorProposal {
  const toks = normalizeText(name).split(" ");
  const basic = [...new Set(toks.map((t) => BASIC[t]).filter(Boolean))];
  const desc = [...new Set(toks.map((t) => DESCRIPTIVE[t]).filter(Boolean))];
  // A basic word wins over descriptive ones, except refinements it implies: "Grigio Antracite" is
  // also anthracite, "Oro Rosa" is also gold.
  const extras = desc.filter((f) => (f === "color.anthracite" && basic.includes("color.grey")) || f === "color.gold");
  const byName = basic.length ? [...basic, ...extras.filter((f) => !basic.includes(f))] : desc.slice(0, 2);
  const sw = swatchFamily(hex);
  let tone = sw.tone;
  if (toks.some((t) => ["scuro", "dark", "deep", "notte"].includes(t))) tone = "dark";
  if (toks.some((t) => ["chiaro", "light", "pale"].includes(t))) tone = "light";
  if (byName.length && sw.family) {
    const agree = byName.includes(sw.family) || byName.some((f) => related(f, sw.family!));
    return { families: byName, tone, basis: "name+swatch", agree, swatch_family: sw.family };
  }
  if (byName.length) return { families: byName, tone, basis: "name", agree: null, swatch_family: null };
  if (sw.family) return { families: [sw.family], tone, basis: "swatch", agree: null, swatch_family: sw.family };
  return { families: [], tone: null, basis: "none", agree: null, swatch_family: null };
}

const CLOSE: [ConceptId, ConceptId][] = [
  ["color.white", "color.cream"], ["color.cream", "color.beige"], ["color.beige", "color.brown"], ["color.grey", "color.anthracite"],
  ["color.anthracite", "color.black"], ["color.natural_wood", "color.brown"], ["color.natural_wood", "color.beige"], ["color.yellow", "color.gold"],
  ["color.yellow", "color.orange"], ["color.orange", "color.brown"], ["color.gold", "color.beige"], ["color.bronze", "color.brown"],
  ["color.red", "color.pink"], ["color.red", "color.brown"], ["color.pink", "color.orange"], ["color.blue", "color.green"], ["color.grey", "color.beige"],
  ["color.yellow", "color.green"], ["color.gold", "color.brown"], ["color.bronze", "color.orange"],
];
function related(a: ConceptId, b: ConceptId): boolean {
  return CLOSE.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

export interface MaterialProposal {
  material: ConceptId | null;
  source: "page_header" | "page_text" | "name_inference" | "to_confirm";
  note?: string;
}

/** Collections whose material another official page states ("TESSUTO CAVALIERE", "MICROFIBRA BELLEZZA"). */
const HEADER_ELSEWHERE: Record<string, [ConceptId, string]> = {
  cavaliere: ["material.fabric", "'TESSUTO CAVALIERE' en la paleta NOTTE"], colonna: ["material.fabric", "'TESSUTO COLONNA' en la paleta NOTTE"],
  "key west": ["material.fabric", "'TESSUTO KEY WEST' en la paleta NOTTE"], medici: ["material.fabric", "'TESSUTO MEDICI' en la paleta NOTTE"],
  jolie: ["material.fabric", "'TESSUTO JOLIE' en la paleta NOTTE"], roma: ["material.fabric", "'TESSUTO ROMA' en la paleta NOTTE"],
  bellezza: ["material.microfiber", "'MICROFIBRA BELLEZZA' en la paleta NOTTE"],
  "supporti a lama": ["material.metal", "'PIEDI IN METALLO' (Carbon Grey, Silver Shade) en la ficha de Madia Onda"],
};
const UPHOLSTERY_LINES = ["boston", "campsbay", "city", "cloud", "miracle", "new lucca", "orlando", "pulse", "rimini", "solaris", "earth", "natural", "tecno", "pisa", "cheyenne", "mirabella"];

export function proposeLineMaterial(lexicon: Lexicon, collection: string): MaterialProposal {
  const norm = normalizeText(collection);
  if (norm.includes("nabuk")) return { material: "material.nubuck", source: "name_inference", note: "¿piel o microfibra? pendiente de Andrea" };
  if (norm === "velvet") return { material: "material.velvet", source: "name_inference", note: "'Velvet' = terciopelo" };
  if (norm.includes("leather grey")) return { material: "material.melamine", source: "page_text", note: "'casse interne in nobilitato Leather grey' (Lewitt Plus)" };
  if (norm.includes("cassa interna")) return { material: "material.melamine", source: "to_confirm", note: "interiores: Eucalipto, Leather Grey, Trama Natural, Noce" };
  if (norm === "scenario") return { material: "material.marble_effect", source: "to_confirm", note: "frontales de boiserie: Calacatta, Nero Marquinia, Black Saint Laurent (efecto mármol), Travertino, Brown Stone" };
  if (norm === "pet" || norm.startsWith("pet ")) return { material: "material.plastic", source: "page_header" };
  if (norm.includes("metalskin") || norm.includes("metal skin")) return { material: "material.metal_skin", source: "page_header" };
  if (norm.includes("impiallac")) return { material: "material.wood_veneer", source: "page_header", note: norm.includes("impiallaciat") ? "la web escribe 'IMPIALLACIATI' (typo)" : undefined };
  if (norm.includes("fenix")) return { material: "material.laminate", source: "page_header" };
  if (norm.includes("supermarmo")) return { material: "material.marble_effect", source: "page_header", note: "acabado efecto mármol ('supermarmo')" };
  if (HEADER_ELSEWHERE[norm]) return { material: HEADER_ELSEWHERE[norm][0], source: "page_header", note: HEADER_ELSEWHERE[norm][1] };
  if (UPHOLSTERY_LINES.includes(norm)) return { material: "material.fabric", source: "to_confirm", note: "la ficha del sofá/sillón dice 'tessuti' en general" };
  const hits = lexicon.match(collection, ["material"]);
  if (hits.length) {
    // Most specific (child) concept wins: "laccato opaco" → lacquer_matt rather than lacquer.
    const ids = hits.map((h) => h.concept);
    const best = ids.find((id) => !ids.some((o) => o !== id && lexicon.isA(o, id))) ?? ids[0];
    return { material: best, source: "page_header" };
  }
  return { material: null, source: "to_confirm" };
}
