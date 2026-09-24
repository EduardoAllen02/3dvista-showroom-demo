import type { CanonicalCatalog, ConceptId, Lang } from "../catalog/types.js";
import type { Lexicon } from "../ontology/lexicon.js";
import { normalizeText } from "../ontology/lexicon.js";
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
const COMBINE: Record<Lang, RegExp> = {
  es: /combin|armoniz|queda bien/i,
  it: /abbin|si sposa|armonizz|sta bene/i,
  en: /match|goes (well )?with|pair|combin|complement/i,
};

export class Verifier {
  private names: string[];
  constructor(private catalog: CanonicalCatalog, private lx: Lexicon) {
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
    const full = segments.map((s) => s.text).join(" ");

    // V1 tags resolvable and inside the bundle
    for (const [, kind, arg] of full.matchAll(/\{\{(\w+):([^}]+)\}\}/g)) {
      const ok =
        (["p", "z", "shown", "link"].includes(kind) && cardIds.has(arg)) ||
        (kind === "v" && onOrder.has(arg)) ||
        (kind === "c" && this.lx.concepts.has(arg)) ||
        (kind === "vals" && bundle.available_values.some((a) => a.constraint === arg)) ||
        (kind === "n" && bundle.groups.some((g) => g.id === arg)) ||
        (kind === "f" && !!bundle.details?.some((d) => d.field === arg && d.status === "known"));
      if (!ok) v.push(`V1 etiqueta inválida {{${kind}:${arg}}}`);
    }
    const plain = full.replace(/\{\{[^}]+\}\}/g, " ");
    // V4 no digits outside tags (measures, prices, coordinates can't be invented); zone numbers are checked by V8
    if (/\d/.test(plain.replace(/casa\s*0?\d+/gi, " "))) v.push("V4 hay números fuera de etiquetas: usa {{f:…}} o {{n:…}}");
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
    const zones = new Set(cards.map((c) => this.catalog.exhibits.find((e) => e.id === c.exhibit_id)?.zone.match(/CASA\s*0?(\d+)/i)?.[1]).filter(Boolean));
    for (const [, n] of plain.matchAll(/casa\s*0?(\d+)/gi)) if (!zones.has(n)) v.push(`V8 zona "Casa ${n}" no corresponde a ninguna tarjeta → usa {{z:ID}}`);
    // V9 obligations — structural, over the whole answer (claims are only a tracing aid)
    const has = (tag: string) => full.includes(tag);
    for (const ob of bundle.obligations) {
      const [kind, a] = ob.split(":");
      switch (kind) {
        case "abs": if (!NEG[lang].test(plain)) v.push(`V9 ${ob}: di explícitamente que NO hay exactamente lo pedido`); break;
        case "ord": if (!has(`{{p:${a}}}`) || !has(`{{v:${a}}}`) || !has(`{{link:${a}}}`)) v.push(`V9 ${ob}: di que {{p:${a}}} no está así en el showroom pero sí disponible bajo pedido en {{v:${a}}}, y enlaza {{link:${a}}}`); break;
        case "grp": case "off": {
          const g = bundle.groups.find((x) => x.id === a);
          if (!g || !g.cards.some((c) => has(`{{p:${c.exhibit_id}}}`))) v.push(`V9 ${ob}: menciona al menos una pieza del grupo ${a} con {{p:ID}}`);
          if (kind === "off" && !full.trim().endsWith("?")) v.push(`V9 ${ob}: termina ofreciendo el grupo ${a} con una pregunta`);
          break;
        }
        case "harm": if (!COMBINE[lang].test(plain)) v.push(`V9 ${ob}: di que el color alternativo combina con el pedido`); break;
        case "vals": if (!has(`{{vals:${a}}}`)) v.push(`V9 ${ob}: nombra los valores que sí existen con {{vals:${a}}}`); break;
        case "unk": if (!has(`{{p:${a}}}`) || !(NEG[lang].test(plain) || has(`{{link:${a}}}`))) v.push(`V9 ${ob}: di que ese dato de {{p:${a}}} no está confirmado y ofrece {{link:${a}}}`); break;
        case "fact": if (!has(`{{f:${a}}}`)) v.push(`V9 ${ob}: da el dato con {{f:${a}}} (sí lo tenemos)`); break;
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
