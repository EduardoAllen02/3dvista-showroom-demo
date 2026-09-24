import type { Lang } from "../catalog/types.js";
import type { Bundle, CardGroup } from "../engine/types.js";
import type { Segment } from "./verifier.js";
import type { Renderer } from "./render.js";

/**
 * Deterministic answers (tags + claims) for every outcome and language. Sober but correct by
 * construction: used when the composer fails verification twice, when no LLM is reachable
 * (degraded mode), and for fixed intents (out of scope, greeting…).
 */

type L = Record<Lang, string>;
const S = {
  exact: { es: "Sí, en el showroom tenemos", it: "Sì, in showroom abbiamo", en: "Yes, in the showroom we have" } as L,
  in: { es: "en", it: "in", en: "in" } as L,
  noShowroom: { es: "En el showroom no lo tenemos así", it: "In showroom non l'abbiamo così", en: "We don't have it like that in the showroom" } as L,
  butOrder: { es: "pero sí está disponible bajo pedido", it: "ma è disponibile su ordinazione", en: "but it is available to order" } as L,
  shownAs: { es: "en el showroom está en", it: "in showroom è in", en: "in the showroom it is in" } as L,
  seeIt: { es: "mira", it: "vedi", en: "see" } as L,
  noExact: { es: "No tengo exactamente lo que buscas.", it: "Non ho esattamente ciò che cerchi.", en: "I don't have exactly what you are looking for." } as L,
  closest: { es: "Lo más cercano que sí tenemos:", it: "La cosa più vicina che abbiamo:", en: "The closest we do have:" } as L,
  combines: { es: "que combina con lo que pediste", it: "che si abbina a quello che hai chiesto", en: "which goes with what you asked for" } as L,
  offer: { es: "Si quieres, también te muestro", it: "Se vuoi, ti mostro anche", en: "If you like, I can also show you" } as L,
  offerQ: { es: "¿Te interesa?", it: "Ti interessa?", en: "Interested?" } as L,
  values: { es: "Lo que sí tenemos es:", it: "Quello che abbiamo è:", en: "What we do have is:" } as L,
  unknown: { es: "De estas piezas no tengo confirmado ese dato:", it: "Di questi pezzi non ho confermato questo dato:", en: "For these pieces that detail is not confirmed:" } as L,
  checkPage: { es: "revisa", it: "verifica", en: "check" } as L,
  list: { es: "Estas son las piezas que tenemos:", it: "Ecco i pezzi che abbiamo:", en: "These are the pieces we have:" } as L,
  count: { es: "En total:", it: "In totale:", en: "In total:" } as L,
  emptyList: { es: "No tengo piezas de ese tipo en el showroom.", it: "Non ho pezzi di quel tipo in showroom.", en: "I don't have pieces of that kind in the showroom." } as L,
  alternatives: { es: "Otras opciones parecidas:", it: "Altre opzioni simili:", en: "Other similar options:" } as L,
  recommend: { es: "Te recomiendo mirar:", it: "Ti consiglio di guardare:", en: "I'd suggest looking at:" } as L,
  locate: { es: "Lo encuentras en", it: "Lo trovi in", en: "You'll find it in" } as L,
  locateMany: { es: "Está en varias zonas. ¿A cuál te llevo?", it: "È in più zone. Dove ti porto?", en: "It's in several areas. Which one should I take you to?" } as L,
  detailKnown: { es: "Según su ficha:", it: "Secondo la scheda:", en: "According to its page:" } as L,
  detailUnknown: { es: "No tengo ese dato confirmado;", it: "Non ho questo dato confermato;", en: "I don't have that detail confirmed;" } as L,
  notFound: { es: "No encontré esa pieza. ¿Me dices cuál es?", it: "Non ho trovato quel pezzo. Mi dici quale?", en: "I couldn't find that piece. Which one do you mean?" } as L,
  out_of_scope: { es: "Solo puedo ayudarte con los muebles de este showroom. ¿Te muestro sofás, cocinas o armarios?", it: "Posso aiutarti solo con gli arredi di questo showroom. Ti mostro divani, cucine o armadi?", en: "I can only help with the furniture in this showroom. Shall I show you sofas, kitchens or wardrobes?" } as L,
  smalltalk: { es: "Te ayudo con gusto a encontrar muebles del showroom. ¿Qué estás buscando?", it: "Ti aiuto volentieri a trovare arredi dello showroom. Cosa stai cercando?", en: "Happy to help you find furniture in the showroom. What are you looking for?" } as L,
  greeting: { es: "¡Hola! ¿Qué te gustaría ver hoy?", it: "Ciao! Cosa ti piacerebbe vedere oggi?", en: "Hi! What would you like to see today?" } as L,
  decline: { es: "De acuerdo. ¿Busco otra cosa?", it: "D'accordo. Cerco altro?", en: "All right. Shall I look for something else?" } as L,
  clarifyWhich: { es: "¿De cuál me hablas?", it: "Di quale parli?", en: "Which one do you mean?" } as L,
  clarifyEmpty: { es: "¿Qué tipo de mueble buscas? Por ejemplo sofás, mesas, cocinas o armarios.", it: "Che tipo di arredo cerchi? Per esempio divani, tavoli, cucine o armadi.", en: "What kind of furniture are you after? For example sofas, tables, kitchens or wardrobes." } as L,
  navigating: { es: "Te llevo a", it: "Ti porto a", en: "Taking you to" } as L,
};

const ps = (g: CardGroup, max = 4) => g.cards.slice(0, max).map((c) => `{{p:${c.exhibit_id}}}`).join(", ");

export function templateAnswer(bundle: Bundle, lang: Lang, r: Renderer): Segment[] {
  const seg: Segment[] = [];
  const by = (role: string) => bundle.groups.filter((g) => g.role === role);
  const obl = (prefix: string) => bundle.obligations.filter((o) => o.startsWith(prefix));
  switch (bundle.mode) {
    case "list": {
      const g = bundle.groups[0];
      if (!g) return [{ text: S.emptyList[lang], claims: [] }];
      seg.push({ text: `${S.list[lang]} ${ps(g, 12)}. ${S.count[lang]} {{n:${g.id}}}.`, claims: obl("count:") });
      break;
    }
    case "alternatives": {
      const g = bundle.groups[0];
      seg.push({ text: g ? `${S.alternatives[lang]} ${ps(g)}.` : S.notFound[lang], claims: [] });
      break;
    }
    case "recommend": {
      const g = bundle.groups[0];
      seg.push({ text: g ? `${S.recommend[lang]} ${ps(g)}.` : S.notFound[lang], claims: [] });
      break;
    }
    case "locate": {
      const g = bundle.groups[0];
      if (!g) return [{ text: S.notFound[lang], claims: [] }];
      if (g.cards.length === 1) seg.push({ text: `${S.locate[lang]} {{z:${g.cards[0].exhibit_id}}}: {{p:${g.cards[0].exhibit_id}}}.`, claims: [] });
      else seg.push({ text: `${g.cards.map((c) => `{{p:${c.exhibit_id}}} ({{z:${c.exhibit_id}}}, {{shown:${c.exhibit_id}}})`).join("; ")}. ${S.locateMany[lang]}`, claims: ["nav:ask"] });
      break;
    }
    case "detail": {
      const id = bundle.groups[0]?.cards[0]?.exhibit_id;
      if (!id) return [{ text: S.notFound[lang], claims: [] }];
      const known = (bundle.details ?? []).filter((d) => d.status === "known");
      const unknown = (bundle.details ?? []).filter((d) => d.status === "unknown");
      if (known.length) seg.push({ text: `{{p:${id}}} — ${S.detailKnown[lang]} ${known.map((d) => `{{f:${d.field}}}`).join("; ")}.`, claims: [] });
      if (unknown.length) seg.push({ text: `{{p:${id}}}: ${S.detailUnknown[lang]} ${S.checkPage[lang]} {{link:${id}}}.`, claims: unknown.map((d) => `unk:${id}:${d.field}`) });
      break;
    }
    default: {
      for (const g of by("exact_exhibited")) seg.push({ text: `${S.exact[lang]} ${g.cards.slice(0, 4).map((c) => `{{p:${c.exhibit_id}}} (${S.in[lang]} {{z:${c.exhibit_id}}})`).join(", ")}.`, claims: [] });
      const absClaimed = obl("abs:");
      for (const g of by("exact_on_order")) {
        for (const [i, c] of g.cards.slice(0, 3).entries()) {
          const claims = [`ord:${c.exhibit_id}`, ...(i === 0 ? absClaimed : [])];
          seg.push({ text: `${S.noShowroom[lang]}: {{p:${c.exhibit_id}}} ${c.shown_as ? `${S.shownAs[lang]} {{shown:${c.exhibit_id}}}, ` : ""}${S.butOrder[lang]}: {{v:${c.exhibit_id}}}; ${S.seeIt[lang]} {{link:${c.exhibit_id}}}.`, claims });
        }
      }
      if (!by("exact_exhibited").length && !by("exact_on_order").length && absClaimed.length) seg.push({ text: S.noExact[lang], claims: absClaimed });
      for (const g of by("unknown")) seg.push({ text: `${S.unknown[lang]} ${g.cards.map((c) => `{{p:${c.exhibit_id}}} (${S.checkPage[lang]} {{link:${c.exhibit_id}}})`).join(", ")}.`, claims: g.cards.map((c) => `unk:${c.exhibit_id}`) });
      for (const a of bundle.available_values) seg.push({ text: `${S.values[lang]} {{vals:${a.constraint}}}.`, claims: [`vals:${a.constraint}`] });
      for (const g of by("alt_keep_frame")) {
        const harm = obl("harm:");
        seg.push({ text: `${S.closest[lang]} ${ps(g)}${harm.length ? `, ${S.combines[lang]}` : ""}.`, claims: [`grp:${g.id}`, ...harm] });
      }
      for (const g of by("alt_keep_new")) seg.push({ text: `${S.offer[lang]} ${ps(g, 3)}. ${S.offerQ[lang]}`, claims: [`off:${g.id}`] });
    }
  }
  // Any obligation still unclaimed is attached to the first segment only if it cannot be expressed otherwise.
  return seg.length ? seg : [{ text: S.noExact[lang], claims: bundle.obligations.filter((o) => o.startsWith("abs:")) }];
}

export function fixedAnswer(kind: keyof typeof S, lang: Lang): Segment[] {
  return [{ text: S[kind][lang], claims: [] }];
}

export function navigationAnswer(exhibitId: string, lang: Lang): Segment[] {
  return [{ text: `${S.navigating[lang]} {{p:${exhibitId}}} ({{z:${exhibitId}}}).`, claims: [] }];
}

export function clarifyAnswer(candidates: string[], lang: Lang, reason: "ambiguous_ref" | "no_focus" | "empty"): Segment[] {
  if (reason === "empty" || !candidates.length) return [{ text: S.clarifyEmpty[lang], claims: [] }];
  return [{ text: `${S.clarifyWhich[lang]} ${candidates.map((id) => `{{p:${id}}}`).join(", ")}`, claims: [] }];
}

/**
 * Deterministic completion of ADDITIVE obligations the composer forgot (a missing link, the list of
 * values that do exist, the on-order options of a piece it already named). Never rewrites what the
 * LLM said; appends before a closing question so the answer still ends with it.
 */
export function completeObligations(segments: Segment[], bundle: Bundle, lang: Lang, linksOnly = false): Segment[] | null {
  const full = segments.map((s) => s.text).join(" ");
  const has = (t: string) => full.includes(t);
  const extra: Segment[] = [];
  for (const ob of bundle.obligations) {
    const [kind, a] = ob.split(":");
    if (kind === "vals" && !linksOnly && !has(`{{vals:${a}}}`)) extra.push({ text: `${S.values[lang]} {{vals:${a}}}.`, claims: [ob] });
    if (kind === "ord" && has(`{{p:${a}}}`)) {
      if (!has(`{{v:${a}}}`)) { if (!linksOnly) extra.push({ text: `{{p:${a}}}: ${S.butOrder[lang]} {{v:${a}}}; ${S.seeIt[lang]} {{link:${a}}}.`, claims: [ob] }); }
      else if (!has(`{{link:${a}}}`)) extra.push({ text: `${cap(S.seeIt[lang])} {{link:${a}}}.`, claims: [ob] });
    }
    if (kind === "unk" && has(`{{p:${a}}}`) && !has(`{{link:${a}}}`)) extra.push({ text: `${cap(S.checkPage[lang])} {{link:${a}}}.`, claims: [ob] });
  }
  if (!extra.length) return null;
  const last = segments[segments.length - 1];
  if (last && last.text.trim().endsWith("?")) return [...segments.slice(0, -1), ...extra, last];
  return [...segments, ...extra];
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
