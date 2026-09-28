import type { CanonicalCatalog, ConceptId, Lang } from "../catalog/types.js";
import type { Lexicon } from "../ontology/lexicon.js";
import { normalizeText } from "../ontology/lexicon.js";
import { DEFAULT_PROFILE, type AssistantProfile } from "./profile.js";
import type { Bundle } from "../engine/types.js";
import { allCards } from "./render.js";
import { detectLang } from "./state.js";

/**
 * Verifier (clean-room §7). Runs on the composer's segments BEFORE anything reaches the
 * visitor. Stage 1: tags, digits, raw product names, card coherence, language, obligations.
 * Stage 1.5: lexicon scan — colour/material words in free text must be claimable from the bundle.
 * Fail → one repair round → deterministic template.
 */

export interface Segment { text: string; claims: string[] }
export interface Verdict { ok: boolean; violations: string[] }

const NEG: Record<Lang, RegExp> = {
  es: /\b(no|ni|ningun[oa]?|nada|sin)\b/i,
  it: /\b(non|nessun[oa]?|niente|senza)\b/i,
  en: /\b(no|not|none|without)\b|n't\b/i,
};
// The line palette is only ever mentioned with a "confirm it on its page" caveat.
const CONFIRM: Record<Lang, RegExp> = {
  es: /confirm|verific|revis|consult/i,
  it: /conferm|verific|controll/i,
  en: /confirm|check|verif/i,
};
// A line-palette answer must not present the options as a sure order.
const SURE_ORDER: Record<Lang, RegExp> = {
  es: /bajo pedido|se puede pedir|puedes pedir/i,
  it: /su ordinazione|si pu[òo] ordinare/i,
  en: /available (to|on) order|can (be )?order/i,
};
// Quantities spelled out to dodge V4 ("treinta y cuatro piezas"): fine only when it is a real group total.
const NUMBER_WORDS: Record<Lang, Record<string, number>> = {
  es: { cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50 },
  it: { quattro: 4, cinque: 5, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12, venti: 20, trenta: 30, quaranta: 40, cinquanta: 50 },
  en: { four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30, forty: 40, fifty: 50 },
};
// "its page" said in words: must be the {{link:ID}} tag instead, or the visitor gets no link.
const PAGE_WORDS: Record<Lang, RegExp> = {
  es: /\b(su|la) ficha\b/i,
  it: /\b(sua|la) scheda\b/i,
  en: /\b(its|the) (product )?page\b/i,
};
const COMBINE: Record<Lang, RegExp> = {
  es: /combin|armoniz|queda bien/i,
  it: /abbin|si sposa|armonizz|sta bene/i,
  en: /match|goes (well )?with|pair|combin|complement/i,
};

export class Verifier {
  private names: string[];
  constructor(private catalog: CanonicalCatalog, private lx: Lexicon, private profile: AssistantProfile = DEFAULT_PROFILE) {
    // Proper product names that are not ordinary words in es/it/en ("Leaf", "Hype", "Trenta", "Couple" are).
    const PROPER = ["balmoral", "melrose", "camden", "navigli", "isabelle", "vivienne", "astor", "madeira", "phoenix", "leeds",
      "diciotto", "arden", "astrid", "marlene", "halley", "rodin", "lumia", "lewitt", "barret", "windsor", "libeskind022", "libeskind", "sagoma"];
    const present = new Set(catalog.models.flatMap((m) => normalizeText(m.name).split(" ")));
    this.names = PROPER.filter((n) => present.has(n));
  }

  verify(segments: Segment[], bundle: Bundle, lang: Lang): Verdict {
    const v: string[] = [];
    const cards = allCards(bundle);
    const cardIds = new Set(cards.map((c) => c.exhibit_id));
    const onOrder = new Set(cards.filter((c) => c.availability === "on_order").map((c) => c.exhibit_id));
    const onLine = new Set(cards.filter((c) => c.availability === "line").map((c) => c.exhibit_id));
    const full = segments.map((s) => s.text).join(" ");

    // V1 tags resolvable and inside the bundle
    for (const [, kind, arg] of full.matchAll(/\{\{(\w+):([^}]+)\}\}/g)) {
      const ok =
        (["p", "z", "shown", "link"].includes(kind) && cardIds.has(arg)) ||
        (kind === "p" && arg === bundle.source) ||
        (kind === "v" && (onOrder.has(arg) || onLine.has(arg))) ||
        (kind === "line" && onLine.has(arg)) ||
        (kind === "c" && this.lx.concepts.has(arg)) ||
        (kind === "vals" && bundle.available_values.some((a) => a.constraint === arg)) ||
        (kind === "n" && bundle.groups.some((g) => g.id === arg)) ||
        (kind === "f" && !!bundle.details?.some((d) => d.field === arg && d.status === "known"));
      if (!ok && kind === "v" && cardIds.has(arg)) v.push(`V1 {{v:${arg}}} no existe: {{p:${arg}}} ya está ${this.profile.prompt.in_venue} tal como lo pidió; no nombres opciones bajo pedido de esa pieza`);
      else if (!ok && kind === "n") v.push(`V1 {{n:${arg}}} no existe: los grupos son ${bundle.groups.map((g) => `{{n:${g.id}}} (${g.total})`).join(", ") || "ninguno"}`);
      else if (!ok) v.push(`V1 etiqueta inválida {{${kind}:${arg}}}`);
    }
    const plain = full.replace(/\{\{[^}]+\}\}/g, " ");
    // V4 no digits outside tags (measures, prices, coordinates can't be invented); zone numbers are checked by V8
    const spoken = this.profile.zones?.spoken;
    if (/\d/.test(spoken ? plain.replace(new RegExp(`\\b${spoken}\\s*0?\\d+`, "gi"), " ") : plain)) v.push("V4 hay números fuera de etiquetas: usa {{f:…}} o {{n:…}}");
    const nTags = bundle.groups.map((g) => `{{n:${g.id}}} (${g.total})`).join(", ");
    const totals = new Set(bundle.groups.map((g) => g.total));
    const spelled = normalizeText(plain).split(/\s+/).map((w) => NUMBER_WORDS[lang][w]).filter((n): n is number => n !== undefined);
    if (spelled.some((n) => !totals.has(n) || n >= 20)) v.push(`V4 no escribas cantidades con letras: para cuántas hay usa ${nTags || "{{n:gN}}"}`);
    // V4c at most a handful of pieces by name: the rest are in the cards
    const named = new Set([...full.matchAll(/\{\{p:([^}]+)\}\}/g)].map((m) => m[1]));
    if (named.size > 6) v.push(`V4 nombras ${named.size} piezas: nombra como mucho 4 (más las que pidan las obligaciones); el resto ya está en las tarjetas`);
    // V4b "its page" only as a real link
    if (PAGE_WORDS[lang].test(plain) && !full.includes("{{link:")) v.push("V4 mencionas la ficha sin enlace: usa {{link:ID}}");
    // V5 no raw product names outside tags
    const normPlain = ` ${normalizeText(plain)} `;
    for (const n of this.names) if (normPlain.includes(` ${n} `)) v.push(`V5 nombre de producto sin etiqueta: "${n}" → usa {{p:ID}}`);
    // V6 is structural: products can only be referenced by {{p:ID}} of bundle cards (checked in V1).
    // V7 language
    if (plain.split(/\s+/).filter(Boolean).length >= 6) {
      const detected = detectLang(plain, lang);
      if (detected !== lang) v.push(`V7 idioma incorrecto: se esperaba ${lang}`);
    }
    // V3 lexicon scan: colours/materials named in free text must be backed by the bundle
    const allowed = this.claimable(bundle);
    for (const hit of this.lx.match(plain, ["color", "material"])) {
      if (!allowed.has(hit.concept) && ![...allowed].some((a) => this.lx.isA(hit.concept, a) || this.lx.isA(a, hit.concept))) {
        v.push(`V3 atributo sin respaldo en los datos: "${hit.surface}" (${hit.concept}) → usa {{c:…}} solo con lo pedido o lo que muestran las tarjetas`);
      }
    }
    // V8 zones written by hand must be zones of the bundle's pieces
    if (spoken && this.profile.zones) {
      const zonePattern = new RegExp(this.profile.zones.pattern, "i");
      const zones = new Set(cards.map((c) => zonePattern.exec(this.catalog.exhibits.find((e) => e.id === c.exhibit_id)?.zone ?? "")?.[1]).filter(Boolean));
      for (const [, n] of plain.matchAll(new RegExp(`\\b${spoken}\\s*0?(\\d+)`, "gi"))) if (!zones.has(n)) v.push(`V8 zona "${spoken.charAt(0).toUpperCase() + spoken.slice(1)} ${n}" no corresponde a ninguna tarjeta → usa {{z:ID}}`);
    }
    // V9 obligations — structural, over the whole answer (claims are only a tracing aid)
    const has = (tag: string) => full.includes(tag);
    for (const ob of bundle.obligations) {
      const [kind, a] = ob.split(":");
      switch (kind) {
        case "abs": if (!NEG[lang].test(plain)) v.push(`V9 ${ob}: di explícitamente que NO hay exactamente lo pedido`); break;
        case "ord": if (!has(`{{p:${a}}}`) || !has(`{{v:${a}}}`) || !has(`{{link:${a}}}`)) v.push(`V9 ${ob}: di que {{p:${a}}} no está así ${this.profile.prompt.in_venue} pero sí disponible bajo pedido en {{v:${a}}}, y enlaza {{link:${a}}}`); break;
        case "lin":
          if (!has(`{{p:${a}}}`) || !has(`{{v:${a}}}`) || !has(`{{line:${a}}}`) || !has(`{{link:${a}}}`) || !CONFIRM[lang].test(plain))
            v.push(`V9 ${ob}: di que {{line:${a}}} maneja {{v:${a}}} para {{p:${a}}}, CON el aviso de confirmar en {{link:${a}}} si aplica a ese modelo`);
          if (!bundle.obligations.some((o) => o.startsWith("ord:")) && SURE_ORDER[lang].test(plain))
            v.push(`V9 ${ob}: no digas que está disponible bajo pedido; es de la línea y hay que confirmarlo en {{link:${a}}}`);
          if (/(l[ií]nea|linea|line)\s*\{\{line:/i.test(full)) v.push(`V9 ${ob}: {{line:${a}}} ya dice "la línea…": no escribas "línea" antes de la etiqueta`);
          break;
        case "grp": case "off": {
          const g = bundle.groups.find((x) => x.id === a);
          if (!g || !g.cards.some((c) => has(`{{p:${c.exhibit_id}}}`))) v.push(`V9 ${ob}: menciona al menos una pieza del grupo ${a} con {{p:ID}}`);
          // The offer is the LAST question and comes after the offered piece, so a "yes" points at it
          // (a short closing sentence after the question is fine).
          const at = Math.min(...(g?.cards ?? []).map((c) => full.indexOf(`{{p:${c.exhibit_id}}}`)).filter((i) => i >= 0));
          if (kind === "off" && !(full.lastIndexOf("?") > at)) v.push(`V9 ${ob}: termina ofreciendo el grupo ${a} con una pregunta`);
          break;
        }
        case "harm": if (!COMBINE[lang].test(plain)) v.push(`V9 ${ob}: di que el color alternativo combina con el pedido`); break;
        case "vals": if (!has(`{{vals:${a}}}`)) v.push(`V9 ${ob}: nombra los valores que sí existen con {{vals:${a}}}`); break;
        case "unk": if (!has(`{{p:${a}}}`) || !(NEG[lang].test(plain) || has(`{{link:${a}}}`))) v.push(`V9 ${ob}: di que ese dato de {{p:${a}}} no está confirmado y ofrece {{link:${a}}}`); break;
        case "fact": if (!has(`{{f:${a}}}`)) v.push(`V9 ${ob}: da el dato con {{f:${a}}} (sí lo tenemos)`); break;
        case "price": if (!has(`{{link:${a}}}`)) v.push(`V9 ${ob}: di que no tienes precios y ofrece {{link:${a}}} para una cita con un asesor`); break;
        case "lnk": if (!has(`{{link:${a}}}`)) v.push(`V9 ${ob}: incluye {{link:${a}}}`); break;
        case "inf": if (!has(`{{c:${ob.slice(4)}}}`) && !this.lx.match(plain, ["mood", "style"]).length) v.push(`V9 ${ob}: di cómo interpretas el deseo ("entiendo acogedor como…")`); break;
        case "nav": if (!full.trim().endsWith("?")) v.push("V9 nav:ask: pregunta a cuál quiere ir"); break;
      }
    }
    return { ok: v.length === 0, violations: [...new Set(v)] };
  }

  /** Concepts the text may name: what was asked, relaxation targets, and what the cards actually have. */
  private claimable(bundle: Bundle): Set<ConceptId> {
    const out = new Set<ConceptId>();
    for (const c of bundle.constraints) if (c.value) out.add(c.value);
    for (const g of bundle.groups) for (const op of g.relaxation) if (op.to) out.add(op.to);
    for (const a of bundle.available_values) a.values.forEach((x) => out.add(x));
    for (const card of allCards(bundle)) {
      const e = this.catalog.exhibits.find((x) => x.id === card.exhibit_id);
      if (e?.configuration.status === "known") for (const comp of e.configuration.value) { comp.color_family.forEach((f) => out.add(f)); if (comp.material) out.add(comp.material); }
      const m = this.catalog.models.find((x) => x.id === card.model_id);
      if (m?.materials.status === "known") m.materials.value.forEach((x) => out.add(x));
      for (const v of card.variants ?? []) {
        const g = m?.option_groups.find((x) => x.id === v.group_id);
        if (g?.material) out.add(g.material);
        for (const o of g?.options ?? []) if (v.option_ids.includes(o.id)) { o.color_family.forEach((f) => out.add(f)); if (o.material) out.add(o.material); }
      }
    }
    return out;
  }
}
