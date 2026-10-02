import type { CanonicalCatalog, Exhibit, Lang, Model, Viewpoint } from "../catalog/types.js";
import type { Lexicon } from "../ontology/lexicon.js";
import { DEFAULT_PROFILE, withOverrides, zoneLabel, type AssistantProfile } from "./profile.js";
import type { ActiveConstraint, Bundle, CardGroup, CardRef, MatchMark } from "../engine/types.js";

/**
 * Everything the visitor reads that is a DATUM (product name, zone, official options, link,
 * colour label, count) is rendered here from the catalog, never typed by the LLM:
 * the LLM writes tags ({{p:FEB-048}}, {{v:FEB-048}}, {{link:FEB-048}} …) and code fills them.
 */

const DEFAULT_LABELS = {
  link: { es: "su ficha", it: "la sua scheda", en: "its product page" },
  and_more: { es: "y más", it: "e altro", en: "and more" },
  on_order: { es: "Bajo pedido", it: "Su ordinazione", en: "On order" },
  in_showroom: { es: "En showroom", it: "In showroom", en: "In showroom" },
  in_line: { es: "En la línea (confirmar)", it: "Nella linea (da confermare)", en: "In the line (to confirm)" },
  line_title: { es: "De la línea, a confirmar en su ficha", it: "Della linea, da confermare sulla scheda", en: "From the product line, to confirm on its page" },
  combines: { es: "combina con", it: "si abbina a", en: "goes with" },
  similar: { es: "parecido a", it: "simile a", en: "close to" },
  not: { es: "No", it: "Non", en: "Not" },
  unknown: { es: "sin confirmar", it: "da confermare", en: "not confirmed" },
  exact: { es: "En el showroom", it: "In showroom", en: "In the showroom" },
  orderable: { es: "Disponible bajo pedido", it: "Disponibile su ordinazione", en: "Available on order" },
  unconfirmed: { es: "Sin confirmar", it: "Da confermare", en: "Not confirmed" },
  check_page: { es: "Consulta su ficha", it: "Vedi la scheda", en: "See its page" },
  alternative: { es: "Alternativa", it: "Alternativa", en: "Alternative" },
  but_not: { es: "pero no", it: "ma non", en: "but not" },
  list: { es: "Resultados", it: "Risultati", en: "Results" },
  alternatives: { es: "Alternativas", it: "Alternative", en: "Alternatives" },
  recommend: { es: "Te puede gustar", it: "Potrebbe piacerti", en: "You may like" },
  locate: { es: "Dónde está", it: "Dove si trova", en: "Where it is" },
  cat_sub: { es: "otra categoría", it: "altra categoria", en: "other category" },
  instead: { es: "en vez de", it: "invece di", en: "instead of" },
  same_model: { es: "mismo modelo", it: "stesso modello", en: "same model" },
  same_color: { es: "mismo color", it: "stesso colore", en: "same colour" },
  same_material: { es: "mismo material", it: "stesso materiale", en: "same material" },
  same_shape: { es: "misma forma", it: "stessa forma", en: "same shape" },
  same_style: { es: "mismo estilo", it: "stesso stile", en: "same style" },
} as const;

export interface UiCard {
  product_id: string;
  name: string;
  description: string;
  image_url: string;
  section: string;
  detail_url: string | null;
  navTarget: { media_name: string; yaw: number; pitch: number; fov: number; hotspot_name: string | null };
  alternativesAvailable: boolean;
  // v2 additions (the v1 widget ignores unknown fields)
  group_id: string;
  group_title: string;
  availability: "exhibited" | "on_order" | "line" | "unknown";
  reasons: string[];
  variants_text: string | null;
  shown_as: string | null;
  official_url: string | null;
  short_name: string;
  teaser: string;
}

const PAGE_SAYS: Record<Lang, string> = { es: "en la ficha", it: "nella scheda", en: "on the page" };

export class Renderer {
  private exhibits: Map<string, Exhibit>;
  private models: Map<string, Model>;
  private viewpoints: Map<string, Viewpoint>;

  private T: Record<keyof typeof DEFAULT_LABELS, Record<Lang, string>>;

  constructor(private catalog: CanonicalCatalog, private lx: Lexicon, readonly profile: AssistantProfile = DEFAULT_PROFILE) {
    this.T = withOverrides(DEFAULT_LABELS, profile.labels);
    this.exhibits = new Map(catalog.exhibits.map((e) => [e.id, e]));
    this.models = new Map(catalog.models.map((m) => [m.id, m]));
    this.viewpoints = new Map(catalog.viewpoints.map((v) => [v.exhibit_id, v]));
  }

  exhibit(id: string) { return this.exhibits.get(id); }
  model(id: string) { return this.models.get(id); }

  displayName(exhibitId: string): string {
    const e = this.exhibits.get(exhibitId);
    const m = e ? this.models.get(e.model_id) : undefined;
    return m && !m.id.startsWith("orphan") ? m.name : e?.name ?? exhibitId;
  }

  zoneLabel(zone: string): string {
    return zoneLabel(zone, this.profile.zones);
  }

  variantsText(card: CardRef, lang: Lang, max = 4): string {
    const parts = (card.variants ?? []).flatMap((v) => v.option_names.map((n) => `${titleCase(v.group_name)} ${n}`));
    const shown = parts.slice(0, max).join(", ");
    return parts.length > max ? `${shown} ${this.T.and_more[lang]}` : shown;
  }

  /** "la línea Dormitorio de Febal": the line whose palette gave the card its variants. */
  lineName(card: CardRef, lang: Lang): string | null {
    const m = this.models.get(card.model_id);
    const line = (card.variants ?? []).map((v) => m?.option_groups.find((g) => g.id === v.group_id)?.line).find(Boolean);
    return line ? this.profile.line_names?.[line]?.[lang] ?? null : null;
  }

  concept(id: string, lang: Lang): string {
    return this.lx.label(id, lang);
  }

  /**
   * Pieces of one answer that share a name: they get what tells them apart after the name, or the
   * visitor reads "Madeira y Madeira". Another kind of piece → the kind; same kind elsewhere → the zone.
   */
  homonyms(ids: string[]): Map<string, "kind" | "zone"> {
    const byName = new Map<string, string[]>();
    for (const id of new Set(ids)) {
      const key = this.displayName(id).toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), id]);
    }
    const out = new Map<string, "kind" | "zone">();
    for (const group of [...byName.values()].filter((g) => g.length > 1)) {
      const kinds = new Set(group.map((id) => this.exhibits.get(id)?.category));
      const zones = new Set(group.map((id) => this.exhibits.get(id)?.zone));
      for (const id of group) if (kinds.size > 1 || zones.size > 1) out.set(id, kinds.size > 1 ? "kind" : "zone");
    }
    return out;
  }

  /** Replace every tag; unknown tags are left visible (the verifier rejects them before this point). */
  renderTags(text: string, bundle: Bundle, lang: Lang, homonyms: Map<string, "kind" | "zone"> = new Map()): string {
    const cards = allCards(bundle);
    return text.replace(/\{\{(\w+):([^}]+)\}\}/g, (whole, kind: string, arg: string, at: number) => {
      const card = cards.find((c) => c.exhibit_id === arg);
      switch (kind) {
        case "p": {
          if (!card && arg !== bundle.source) return whole;
          const name = `**${this.displayName(arg)}**`;
          const e = this.exhibits.get(arg)!;
          if (homonyms.get(arg) === "zone") return text.includes(`{{z:${arg}}}`) ? name : `${name} (${this.zoneLabel(e.zone)})`;
          if (homonyms.get(arg) !== "kind") return name;
          const kindLabel = this.concept(e.category, lang);
          // "la cocina {{p:X}}" already says which one.
          return text.slice(Math.max(0, at - kindLabel.length - 1), at).trim().toLowerCase() === kindLabel.toLowerCase() ? name : `${name} (${kindLabel})`;
        }
        // Three or more pieces named with their options: two each in the text (the cards list more).
        case "v": return card ? this.variantsText(card, lang, bundle.obligations.filter((o) => /^(ord|lin):/.test(o)).length >= 3 ? 2 : 4) : whole;
        case "line": return card ? this.lineName(card, lang) ?? whole : whole;
        case "z": { const e = this.exhibits.get(arg); return e ? this.zoneLabel(e.zone) : whole; }
        case "shown": return card?.shown_as ? localizeObserved(card.shown_as, lang) : (this.exhibits.get(arg) ? "—" : whole);
        case "link": {
          const e = this.exhibits.get(arg); const url = e ? this.models.get(e.model_id)?.official_url : null;
          return url ? `[${this.T.link[lang]}](${url})` : whole;
        }
        case "c": return this.lx.concepts.has(arg) ? this.concept(arg, lang) : whole;
        case "vals": {
          const av = bundle.available_values.find((a) => a.constraint === arg);
          return av ? av.values.map((v) => this.concept(v, lang)).join(", ") : whole;
        }
        case "n": { const g = bundle.groups.find((x) => x.id === arg); return g ? String(g.total) : whole; }
        case "f": {
          const d = bundle.details?.find((x) => x.field === arg && x.status === "known");
          if (!d) return whole;
          // Said in the visitor's language, with the page's own words after it.
          if (d.concepts?.length && lang !== "it") return `${d.concepts.map((c) => this.concept(c, lang)).join(", ")} (${PAGE_SAYS[lang]}: «${d.text}»)`;
          if (d.field === "dimensions" && d.text && lang !== "it") return translateDims(d.text, lang);
          return d.text ?? whole;
        }
        default: return whole;
      }
    });
  }

  /**
   * forVisitor: the card header the visitor sees keeps only what matches ("café ✓", "beige (combina con
   * azul)"); what the piece is NOT ("cama (en vez de mesita de noche)", "no de ángulo") stays for the
   * composer, which must know it, but is never shown as a label.
   */
  groupTitle(g: CardGroup, bundle: Bundle, lang: Lang, forVisitor = false): string {
    const c = (id: string) => bundle.constraints.find((x) => x.id === id);
    switch (g.role) {
      case "exact_exhibited": return this.T.exact[lang];
      case "exact_on_order": return this.T.orderable[lang];
      case "line_on_order": return this.T.line_title[lang];
      case "unknown": return forVisitor ? this.T.check_page[lang] : this.T.unconfirmed[lang];
      case "list": return this.T.list[lang];
      case "alternatives": return this.T.alternatives[lang];
      case "recommend": return this.T.recommend[lang];
      case "locate": return this.T.locate[lang];
      case "alt_keep_frame":
      case "alt_keep_new": {
        const touched = new Set(g.relaxation.map((op) => op.constraint));
        const kept = bundle.constraints.filter((x) => x.role === "new" && x.facet !== "category" && x.strength === "must" && !touched.has(x.id))
          .map((x) => `${this.constraintLabel(x, lang)} ✓`);
        // Several substitutes for one request share one header: "efecto mármol · gres (parecido a mármol)".
        const byTarget = new Map<string, { to: string[]; rel: string; orig: ActiveConstraint }>();
        const parts = g.relaxation.map((op) => {
          const orig = c(op.constraint);
          if (!orig) return "";
          if (op.kind === "drop") return orig.facet === "model" || forVisitor ? "" : `${this.T.not[lang].toLowerCase()} ${this.constraintLabel(orig, lang)}`;
          if (orig.facet === "category") return forVisitor ? "" : `${this.concept(op.to!, lang)} (${this.T.instead[lang]} ${this.constraintLabel(orig, lang)})`;
          const rel = op.via === "harmonizes" ? this.T.combines[lang] : this.T.similar[lang];
          const key = `${op.constraint}|${rel}`;
          const seen = byTarget.get(key);
          if (seen) { seen.to.push(this.concept(op.to!, lang)); return ""; }
          byTarget.set(key, { to: [this.concept(op.to!, lang)], rel, orig });
          return key;
        }).filter(Boolean).map((p) => {
          const t = byTarget.get(p);
          return t ? `${t.to.join(" · ")} (${t.rel} ${this.constraintLabel(t.orig, lang)})` : p;
        });
        const title = [...kept, ...parts].join(" · ");
        if (title || !forVisitor) return title;
        // Nothing positive to say: where the pieces are.
        return g.cards.every((x) => x.availability === "on_order") ? this.T.orderable[lang]
          : g.cards.every((x) => x.availability === "exhibited") ? this.T.exact[lang] : this.T.alternative[lang];
      }
      default: return "";
    }
  }

  obligationInstruction(ob: string, bundle: Bundle, lang: Lang): string {
    const [kind, a] = ob.split(":");
    const req = bundle.constraints.filter((c) => c.strength === "must").map((c) => this.constraintLabel(c, lang)).join(" + ");
    const g = bundle.groups.find((x) => x.id === a);
    const gp = g ? g.cards.slice(0, 3).map((c) => `{{p:${c.exhibit_id}}}`).join(", ") : "";
    switch (kind) {
      case "abs": return `Di claramente que NO hay ${this.profile.prompt.in_venue} exactamente: ${req}.`;
      case "ord": return `Di que {{p:${a}}} ${this.profile.prompt.in_venue} está en {{shown:${a}}} (no como lo pidió), PERO SÍ está disponible bajo pedido en {{v:${a}}}; incluye {{link:${a}}}.`;
      case "lin": return `Di que {{p:${a}}} (aquí en {{shown:${a}}}) no lo tienes confirmado así para ese modelo, pero {{line:${a}}} maneja {{v:${a}}}; pide que CONFIRME en {{link:${a}}} si aplica a ese modelo. Nunca digas que está disponible sin ese aviso.`;
      case "grp": {
        // What each of them is made of when it stands in for the request ("Madeira: top de gres").
        const subs = g ? g.relaxation.flatMap((op) => (op.kind === "substitute" && op.to ? [op.to] : [])) : [];
        const made = (g?.cards ?? []).slice(0, 4).map((c) => {
          const what = this.substituteView(c, subs, lang);
          return what ? `{{p:${c.exhibit_id}}} → ${what}` : "";
        }).filter(Boolean);
        return `Presenta como alternativa: ${gp} (${g ? this.groupTitle(g, bundle, lang) : ""}).` +
          (made.length ? ` Di de qué es cada una: ${made.join("; ")}. Aclara que no es el material pedido tal cual.` : "");
      }
      case "off": return `Al final ofrece como pregunta: ${gp} (${g ? this.groupTitle(g, bundle, lang) : ""}). La respuesta termina en "?".`;
      case "harm": { const [x, y] = ob.slice(5).split(">"); return `Di que {{c:${y}}} combina con {{c:${x}}}.`; }
      case "vals": return `Di que no existe ese valor y nombra los que sí hay con {{vals:${a}}}.`;
      case "unk": return `Di que de {{p:${a}}} ese dato no está confirmado y ofrece {{link:${a}}}.`;
      case "price": return `No tenemos precios (dependen de medidas y acabados): dilo claramente, SIN dar cifras, y ofrece {{link:${a}}} para reservar una cita con un asesor.`;
      case "lnk": return `Incluye {{link:${a}}} para ver la ficha oficial.`;
      case "fact": return `Da el dato con {{f:${a}}}: SÍ lo tenemos, no digas que falta.`;
      case "inf": return `Explica cómo interpretas el deseo del visitante ({{c:${ob.slice(4)}}}) antes de proponer.`;
      case "nav": return "Pregunta a cuál de las zonas quiere ir.";
      case "sim": return `Di en qué se parece a {{p:${bundle.source}}} cada pieza que nombres, con su "se_parece_en" (p. ej. "{{p:X}} también es {{c:…}}, en {{c:…}}"). Nombra primero las más parecidas.`;
      case "ans": {
        // "¿La madia es de mármol?": yes/no decided by the engine from the piece in the showroom.
        const [, id, t] = ob.split(":");
        const c = bundle.constraints.find((x) => x.id === id);
        const x = bundle.groups[0]?.cards[0]?.exhibit_id;
        if (!c || !x) return "";
        const what = `{{c:${c.value}}}`;
        if (t === "yes") return `Responde primero que SÍ: {{p:${x}}} es de/en ${what}; di qué parte, según como_se_ve u otras_partes.`;
        if (t === "no") return `Responde primero que NO: {{p:${x}}} no es de/en ${what}. Luego di cómo es ${this.profile.prompt.in_venue}: {{shown:${x}}} y sus otras_partes con su material (si una se parece a lo pedido, como gres con aspecto de mármol, dilo y aclara que no es lo mismo).`;
        return `Di que no tienes confirmado si {{p:${x}}} es de/en ${what}, di cómo se ve ({{shown:${x}}}) y ofrece {{link:${x}}}.`;
      }
      default: return ob;
    }
  }

  constraintLabel(c: ActiveConstraint, lang: Lang): string {
    if (c.facet === "model") return this.models.get(c.value ?? "")?.name ?? c.value ?? "";
    if (c.op === "harmonizes_with") return `${this.T.combines[lang]} ${this.displayName(c.ref ?? "")}`;
    return this.concept(c.value ?? "", lang);
  }

  reasons(card: CardRef, bundle: Bundle, lang: Lang): string[] {
    // Alternatives: what the card shares with the piece it is an alternative to.
    if (bundle.mode === "alternatives") {
      const SAME = { model: this.T.same_model, color: this.T.same_color, material: this.T.same_material, shape: this.T.same_shape, style: this.T.same_style } as const;
      return (Object.keys(SAME) as (keyof typeof SAME)[]).filter((k) => card.match[k] === "yes").map((k) => SAME[k][lang]);
    }
    const out: string[] = [];
    for (const c of bundle.constraints) {
      // The kind of piece and the model itself ("Melrose ✓" on Melrose's card) say nothing new.
      if (c.facet === "category" || c.facet === "model" || c.strength === "prefer") continue;
      const m: MatchMark | undefined = card.match[c.id];
      if (!m) continue;
      const label = this.constraintLabel(c, lang);
      if (m === "yes") out.push(`${c.op === "not" ? `${this.T.not[lang]} ${label}` : label} ✓`);
      else if (m === "no" || m === "drop") out.push(`${this.T.not[lang]} ${label}`);
      else if (m === "unknown") out.push(`${label}: ${this.T.unknown[lang]}`);
      else if (m.startsWith("sub:")) out.push(this.concept(m.slice(4), lang));
    }
    if (card.availability === "on_order" || card.availability === "line") {
      const v = this.variantsText(card, lang, 3);
      if (v) out.push(`${card.availability === "line" ? this.T.in_line[lang] : this.T.on_order[lang]}: ${v}`);
      if (card.shown_as) out.push(`${this.T.in_showroom[lang]}: ${localizeObserved(card.shown_as, lang)}`);
    }
    return out;
  }

  uiCards(bundle: Bundle, lang: Lang): UiCard[] {
    const out: UiCard[] = [];
    const seen = new Set<string>();
    for (const g of bundle.groups) {
      const title = this.groupTitle(g, bundle, lang, true);
      for (const card of g.cards) {
        if (seen.has(card.exhibit_id)) continue;
        seen.add(card.exhibit_id);
        const e = this.exhibits.get(card.exhibit_id)!;
        const m = this.models.get(e.model_id);
        const vp = this.viewpoints.get(e.id)!;
        // The catalog's description is the Italian page text: the card says what it is and how it looks here.
        const kindLabel = this.concept(e.category, lang);
        const teaser = `${kindLabel.charAt(0).toUpperCase()}${kindLabel.slice(1)} · ${card.shown_as ? localizeObserved(card.shown_as, lang) : this.zoneLabel(e.zone)}`;
        out.push({
          product_id: e.id, name: e.name, description: teaser, teaser, image_url: e.image_url, section: this.zoneLabel(e.zone),
          detail_url: m?.official_url ?? null,
          navTarget: { media_name: vp.media_name, yaw: vp.yaw, pitch: vp.pitch, fov: vp.fov, hotspot_name: vp.hotspot_name },
          alternativesAvailable: g.role !== "alternatives",
          group_id: g.id, group_title: title, availability: card.availability,
          reasons: this.reasons(card, bundle, lang),
          variants_text: card.availability === "on_order" || card.availability === "line" ? this.variantsText(card, lang) : null,
          shown_as: card.shown_as ?? null, official_url: m?.official_url ?? null, short_name: this.displayName(e.id),
        });
      }
    }
    return out;
  }

  /**
   * The part of a showroom piece that carries the substitute material ("top: antracite (gres)" for
   * "marble"), so the composer says what it is instead of just "marble effect".
   */
  private substituteView(card: CardRef, subs: string[], lang: Lang): string | null {
    const e = this.exhibits.get(card.exhibit_id);
    if (!subs.length || e?.configuration.status !== "known") return null;
    const parts = e.configuration.value.filter((p) => p.material && subs.some((s) => this.lx.isA(p.material!, s)));
    // The dominant surface's colour is already {{shown}}: only its material; a secondary part by its finish.
    return parts.length ? parts.map((p) => (p.dominant || !p.observed_color
      ? this.concept(p.material!, lang)
      : `${localizeObserved(p.observed_color, lang)} (${this.concept(p.material!, lang)})`)).join("; ") : null;
  }

  /** Secondary parts with a finish the client named ("top: travertino (efecto mármol)"), for the composer. */
  private partsView(exhibitId: string, lang: Lang): string | null {
    const e = this.exhibits.get(exhibitId);
    const parts = e?.configuration.status === "known" ? e.configuration.value.filter((p) => !p.dominant && p.observed_color && p.material) : [];
    return parts.length ? parts.map((p) => `${p.role}: ${localizeObserved(p.observed_color!, lang)} (${this.concept(p.material!, lang)})`).join("; ") : null;
  }

  /** What an alternative shares with the piece it replaces, by kind ("mismo tipo: sofá", "forma: {{c:shape.corner}} (= de ángulo)"). */
  private sharedView(card: CardRef, lang: Lang): Record<string, string> {
    const out: Record<string, string> = {};
    for (const x of card.shared ?? []) {
      const facet = this.lx.facetOf(x);
      const key = facet === "category" ? "mismo_tipo" : facet === "shape" ? "forma" : facet === "color" ? "color" : facet === "material" ? "material" : facet ?? "otro";
      out[key] = `{{c:${x}}} (= ${this.concept(x, lang)})`;
    }
    return out;
  }

  /** Compact, tag-oriented view of the bundle for the composer LLM. No coordinates, no URLs. */
  composerView(bundle: Bundle, lang: Lang): string {
    const view = {
      idioma: lang,
      resultado: bundle.outcome,
      ...(bundle.source ? { [bundle.mode === "recommend" ? "combina_con" : "alternativas_a"]: { pieza: `{{p:${bundle.source}}}`, nombre: this.displayName(bundle.source) } } : {}),
      pedido: bundle.constraints.map((c) => ({ id: c.id, que: `${c.op === "not" ? "NO " : ""}${this.constraintLabel(c, lang)}`, tipo: c.facet, nuevo: c.role === "new" })),
      grupos: bundle.groups.map((g) => ({
        id: g.id, tipo: g.role, titulo: this.groupTitle(g, bundle, lang), total: g.total,
        tarjetas: g.cards.map((c) => ({
          pieza: `{{p:${c.exhibit_id}}}`, nombre: this.displayName(c.exhibit_id),
          ...(allCards(bundle).some((o) => o.exhibit_id !== c.exhibit_id && this.displayName(o.exhibit_id) === this.displayName(c.exhibit_id)) ? { mismo_nombre_que_otra: true } : {}),
          categoria: this.concept(this.exhibits.get(c.exhibit_id)!.category, lang),
          disponibilidad: c.availability, zona: `{{z:${c.exhibit_id}}}`,
          // The value next to the tag, so the composer knows what it says (it still writes the tag).
          como_se_ve: c.shown_as ? `{{shown:${c.exhibit_id}}} (= ${localizeObserved(c.shown_as, lang)})` : null,
          ...(this.partsView(c.exhibit_id, lang) ? { otras_partes: this.partsView(c.exhibit_id, lang) } : {}),
          ...(this.substituteView(c, g.relaxation.flatMap((op) => (op.kind === "substitute" && op.to ? [op.to] : [])), lang)
            ? { acabado_parecido: this.substituteView(c, g.relaxation.flatMap((op) => (op.kind === "substitute" && op.to ? [op.to] : [])), lang) } : {}),
          bajo_pedido: c.availability === "on_order" ? `{{v:${c.exhibit_id}}}` : null,
          de_la_linea: c.availability === "line" ? { linea: `{{line:${c.exhibit_id}}}`, opciones: `{{v:${c.exhibit_id}}}`, aviso: "confirmar en la ficha si aplica a este modelo" } : null,
          ficha: this.models.get(c.model_id)?.official_url ? `{{link:${c.exhibit_id}}}` : null,
          cumple: this.reasons(c, bundle, lang),
          ...(bundle.mode === "alternatives" ? { se_parece_en: this.sharedView(c, lang) } : {}),
        })),
      })),
      valores_disponibles: bundle.available_values.map((a) => ({ tag: `{{vals:${a.constraint}}}`, valores: a.values.map((v) => this.concept(v, lang)) })),
      detalles: bundle.details?.map((d) => ({ campo: d.field, estado: d.status, tag: d.status === "known" ? `{{f:${d.field}}}` : null, texto: d.text ?? null })) ?? [],
      obligaciones: bundle.obligations.map((ob) => ({ id: ob, instruccion: this.obligationInstruction(ob, bundle, lang) })),
    };
    return JSON.stringify(view);
  }
}


export function allCards(b: Bundle): CardRef[] {
  return b.groups.flatMap((g) => g.cards);
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase());
}

/**
 * Measures come from the Italian page ("rotondo fisso: D 110 H 75 (4 posti)"): the numbers stay, the
 * words are said in the visitor's language. Longest phrases first.
 */
const DIMS: [RegExp, { es: string; en: string }][] = ([
  ["rotondo fisso", "redonda fija", "fixed round"], ["rotondo allungabile", "redonda extensible", "extendable round"],
  ["ovale fisso", "ovalada fija", "fixed oval"], ["ingombro totale", "medidas totales", "overall size"],
  ["mensole spessore", "grosor de los estantes", "shelf thickness"], ["cassa standard", "módulo estándar", "standard cabinet"],
  ["cassa over", "módulo alto", "tall cabinet"], ["basamento h", "altura de la base", "base height"],
  ["(\\d+) cassetti", "de $1 cajones", "with $1 drawers"], ["(\\d+) posti", "$1 plazas", "$1 seats"],
  ["materasso", "colchón", "mattress"], ["ingombro", "medidas", "overall size"], ["comodino", "mesita de noche", "nightstand"],
  ["comò", "cómoda", "chest of drawers"], ["settimino", "semanario", "tall chest"], ["testata", "cabecero", "headboard"],
  ["sommier", "somier", "bed base"], ["altezze", "alturas", "heights"], ["fisso", "fija", "fixed"], ["allungabile", "extensible", "extendable"],
  ["frontale", "frente", "front"], ["ante", "puertas", "doors"], ["zoccolo", "zócalo", "plinth"], ["lunghezza", "largo", "length"],
  ["profondità", "fondo", "depth"], ["profondita", "fondo", "depth"], ["o", "o", "or"],
] as const).map(([it, es, en]) => [new RegExp(`(?<![\\p{L}])${it}(?![\\p{L}])`, "giu"), { es, en }]);
export function translateDims(text: string, lang: Lang): string {
  if (lang === "it") return text;
  return DIMS.reduce((t, [re, tr]) => t.replace(re, tr[lang]), text);
}

/** Observations were written in Italian ("grigio chiaro", "senape/ocra"): translate colour words word by word. */
const OBS: Record<string, { es: string; en: string }> = {
  bianco: { es: "blanco", en: "white" }, bianca: { es: "blanca", en: "white" }, nero: { es: "negro", en: "black" }, nera: { es: "negra", en: "black" },
  grigio: { es: "gris", en: "grey" }, chiaro: { es: "claro", en: "light" }, scuro: { es: "oscuro", en: "dark" }, verde: { es: "verde", en: "green" },
  oliva: { es: "oliva", en: "olive" }, bosco: { es: "bosque", en: "forest" }, senape: { es: "mostaza", en: "mustard" }, ocra: { es: "ocre", en: "ochre" },
  tortora: { es: "topo", en: "taupe" }, beige: { es: "beige", en: "beige" }, crema: { es: "crema", en: "cream" }, panna: { es: "crema", en: "cream" },
  avorio: { es: "marfil", en: "ivory" }, sabbia: { es: "arena", en: "sand" }, antracite: { es: "antracita", en: "anthracite" }, marrone: { es: "café", en: "brown" },
  noce: { es: "nogal", en: "walnut" }, rovere: { es: "roble", en: "oak" }, biondo: { es: "claro", en: "light" }, naturale: { es: "natural", en: "natural" },
  legno: { es: "madera", en: "wood" }, marmo: { es: "mármol", en: "marble" }, venato: { es: "veteado", en: "veined" }, oro: { es: "oro", en: "gold" },
  bronzo: { es: "bronce", en: "bronze" }, champagne: { es: "champán", en: "champagne" }, metallizzato: { es: "metalizado", en: "metallic" },
  blu: { es: "azul", en: "blue" }, azzurro: { es: "azul claro", en: "light blue" }, rosso: { es: "rojo", en: "red" }, rosa: { es: "rosa", en: "pink" },
  giallo: { es: "amarillo", en: "yellow" }, cognac: { es: "coñac", en: "cognac" }, carbon: { es: "carbón", en: "carbon" }, grey: { es: "gris", en: "grey" },
  caldo: { es: "cálido", en: "warm" }, talpa: { es: "topo", en: "taupe" }, perla: { es: "perla", en: "pearl" }, salvia: { es: "salvia", en: "sage" },
  ghiaccio: { es: "hielo", en: "ice" }, miele: { es: "miel", en: "honey" }, carbone: { es: "carbón", en: "charcoal" }, fumé: { es: "ahumado", en: "smoked" },
  vetro: { es: "vidrio", en: "glass" }, nocciola: { es: "avellana", en: "hazelnut" }, materico: { es: "texturizado", en: "textured" },
  verdastro: { es: "verdoso", en: "greenish" }, lucido: { es: "brillante", en: "glossy" }, alluminio: { es: "aluminio", en: "aluminium" },
  acciaio: { es: "acero", en: "steel" }, travertino: { es: "travertino", en: "travertine" },
  opaco: { es: "mate", en: "matt" }, ottone: { es: "latón", en: "brass" }, caffè: { es: "café", en: "coffee" },
  e: { es: "y", en: "and" },
};
export function localizeObserved(text: string, lang: Lang): string {
  if (lang === "it") return text;
  // «…» is the official finish name ("sabbia «Earth Dune R215»"): quoted as is, never translated.
  return text.split(/(\s*«[^»]*»)/).map((seg) => (seg.includes("«") ? seg : localizeWords(seg, lang))).join("");
}
function localizeWords(text: string, lang: "es" | "en"): string {
  const tr = (w: string) => OBS[w.toLowerCase()]?.[lang] ?? w;
  if (lang === "es") return text.split(/(\s+|\/|,)/).map(tr).join("");
  // English puts the modifiers first: "grigio caldo chiaro" → "light warm grey".
  return text.split(/\s*([,/])\s*/).map((p) => (p === "," || p === "/" ? p : p.split(/\s+/).filter(Boolean).map(tr).reverse().join(" "))).join("").replace(/,/g, ", ");
}
