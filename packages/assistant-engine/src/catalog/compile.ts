import type {
  Attr, CanonicalCatalog, ComponentRole, ConceptId, ConfiguredComponent, Dimension, Exhibit, Fact, Model, Option,
  OptionGroup, OptionScope, Viewpoint,
} from "./types.js";
import { Lexicon, normalizeText } from "../ontology/lexicon.js";
import { proposeColor, proposeLineMaterial } from "../ontology/furniture-naming.js";

/**
 * Compiles the raw, sourced product facts (tour-project/<tour>/product-facts) plus the
 * tour binding (camera/zone/image per piece) into the canonical catalog.
 *
 * mode "strict": only facts reviewed as validated are "known" (what error-0 is measured on);
 * mode "dev":    pending facts are used as known too (development/tests before review).
 */

// ---- raw input shapes (only the fields used here) ----------------------------------
export interface RawOption { label: string | null; code: string | null; swatch_url: string | null; swatch_hex: string | null }
export interface RawCollection { name: string | null; options: RawOption[] }
export interface RawModel {
  model_key: string; url: string; heading?: string | null; page_title?: string | null; scraped_at: string;
  finish_groups: { group: string | null; tier: number | null; collections: RawCollection[] }[];
  catalog_refs: { product_id: string; name: string; category: string; section: string }[];
  meta_description?: string | null;
}
type Bin = { confirmado: "SI" | "NO"; valor: unknown; evidencia: string };
export interface RawModelAttributes {
  model_key: string; url: string; leido: string;
  forma?: Bin; materiales?: Bin; estilo?: Bin; medidas?: Bin; lista_acabados?: Bin;
  /** confirmado "NO" = the page text contradicts the line palette (Arden: wood only) -> never mention it. */
  paleta_de_linea?: Bin;
  opciones_en_texto?: string[]; notas?: string[];
}
export interface RawPiece {
  product_id: string; name: string; category: string; description: string; colors: string[]; materials: string[];
  section: string; media_name: string; yaw: number; pitch: number; fov: number; hotspot_name: string | null;
  image_url: string; detail_url: string | null; active: boolean; shape?: string | null; finish?: string[];
}
export interface RawObservation { name: string; colors: string[]; materials: string[]; finish?: string[]; shape?: string; note?: string }
export interface RawReview {
  validated_fact_ids: string[]; rejected_fact_ids: string[]; reviewer?: string; at?: string;
  /** Generic-palette groups the client confirmed as real options of that model (sheet "Paletas por confirmar"). */
  promoted_palette_groups?: string[];
  /** Palette groups the client said do NOT apply to that model: never mentioned. */
  excluded_palette_groups?: string[];
}

export interface CompileInput {
  tour_id: string;
  data_version: string;
  mode: "strict" | "dev";
  models: RawModel[];
  attributes: RawModelAttributes[];
  pieces: RawPiece[];
  /** Tour observations per piece (captures). Legacy 'catalog v1' values are used only when absent. */
  observations: Record<string, RawObservation>;
  /** Pieces whose legacy catalog values are known to be test data and must be ignored. */
  ignore_legacy_values: string[];
  review?: RawReview;
  lexicon: Lexicon;
}

const NAME_OVERRIDES: Record<string, string> = {
  arden: "Arden", astrid: "Astrid", couple: "Couple", "febal-notte-gruppo-como-e-comodino-marlene": "Marlene",
  "tipologia-mobili-di-servizi-mobili-di-servizi-laundry": "Laundry", "tipologia-momenti-cameretta": "Momenti (camerette)",
};

const CATEGORY_MAP: Record<string, ConceptId> = {
  divani: "category.sofa", poltrone: "category.armchair", pouf: "category.pouf", sedie: "category.chair",
  sgabelli: "category.stool", tavoli: "category.table", tavolini: "category.coffee_table", madie: "category.sideboard",
  librerie: "category.bookcase", "sistemi modulari": "category.modular_system", cucine: "category.kitchen",
  armadi: "category.wardrobe", cassettiere: "category.drawer_unit", "camera da letto": "category.bed",
  boiserie: "category.boiserie", altro: "category.mirror",
};

function pieceCategory(p: RawPiece): ConceptId {
  const n = normalizeText(p.name);
  if (n.startsWith("cabina armadio")) return "category.walk_in_closet";
  if (n.startsWith("gruppo notte")) return "category.night_group";
  if (n.startsWith("specchio")) return "category.mirror";
  return CATEGORY_MAP[p.category] ?? "category.modular_system";
}

const slug = (s: string) => normalizeText(s).replace(/\s+/g, "-") || "x";

function roleFor(groupTitle: string | null, collection: string, category: ConceptId): ComponentRole[] {
  const g = normalizeText(groupTitle ?? ""), c = normalizeText(collection);
  if (/piedi|struttura|metallo$/.test(c) || g.startsWith("struttura")) return ["base", "legs"];
  if (g.startsWith("piano") || g === "top") return ["top"];
  if (/interne|interno|cassa interna/.test(g + " " + c)) return ["interior"];
  if (/frontali|anta/.test(g) || /vetro onda|^vetri?$|frontal/.test(c)) return ["front", "doors"];
  if (/telaio/.test(c)) return ["frame"];
  if (/fianchi|cassa|schien/.test(g)) return ["carcass"];
  if (["category.sofa", "category.armchair", "category.pouf", "category.chair", "category.stool"].includes(category)) return ["upholstery"];
  if (["category.table", "category.coffee_table"].includes(category)) return ["top"];
  if (["category.wardrobe", "category.walk_in_closet", "category.kitchen"].includes(category)) return ["doors", "front"];
  return ["whole"];
}

function dominantRole(category: ConceptId): ComponentRole {
  if (["category.sofa", "category.armchair", "category.pouf", "category.chair", "category.stool"].includes(category)) return "upholstery";
  if (["category.table", "category.coffee_table"].includes(category)) return "top";
  if (["category.wardrobe", "category.walk_in_closet", "category.kitchen", "category.sideboard"].includes(category)) return "front";
  return "whole";
}

const PARENTHESIS = /\([^)]*\)/g;

/** The most specific concept of a list (drops any concept that is an ancestor of another). */
function mostSpecific(lx: Lexicon, ids: ConceptId[]): ConceptId | null {
  return ids.find((id) => !ids.some((o) => o !== id && lx.isA(o, id))) ?? null;
}

export function compileCatalog(input: CompileInput): { catalog: CanonicalCatalog; report: GateReport } {
  const { lexicon: lx } = input;
  const facts: Fact[] = [];
  const validated = new Set(input.review?.validated_fact_ids ?? []);
  const rejected = new Set(input.review?.rejected_fact_ids ?? []);
  const promoted = new Set(input.review?.promoted_palette_groups ?? []);
  const excluded = new Set(input.review?.excluded_palette_groups ?? []);
  const now = new Date().toISOString();

  const addFact = (f: Omit<Fact, "review">): Fact => {
    const status = rejected.has(f.id) ? "rejected" : validated.has(f.id) ? "validated" : "pending";
    const fact: Fact = { ...f, review: { status, by: input.review?.reviewer, at: input.review?.at } };
    facts.push(fact);
    return fact;
  };
  const usable = (f: Fact) => f.review.status === "validated" || (input.mode === "dev" && f.review.status === "pending");
  function attr<T>(value: T | null, fact: Fact | null, reason: "not_captured" | "not_published" = "not_published"): Attr<T> {
    if (value === null || !fact) return { status: "unknown", reason };
    if (!usable(fact)) return { status: "unknown", reason: "pending_review" };
    return { status: "known", value, facts: [fact.id] };
  }
  const concepts = (text: string, facet: "shape" | "style" | "material" | "color") =>
    [...new Set(lx.match(text.replace(PARENTHESIS, " "), [facet]).map((m) => m.concept))];

  // ---------------------------------------------------------------- models
  const attrsByKey = new Map(input.attributes.map((a) => [a.model_key, a]));
  const piecesById = new Map(input.pieces.map((p) => [p.product_id, p]));
  const models: Model[] = [];
  const modelOfPiece = new Map<string, string>();

  for (const rm of input.models) {
    const a = attrsByKey.get(rm.model_key);
    const refs = rm.catalog_refs.map((r) => piecesById.get(r.product_id)).filter((p): p is RawPiece => !!p);
    for (const r of rm.catalog_refs) modelOfPiece.set(r.product_id, rm.model_key);
    const cats = refs.map(pieceCategory);
    const category = cats.includes("category.kitchen") ? "category.kitchen"
      : [...cats].sort((x, y) => cats.filter((c) => c === y).length - cats.filter((c) => c === x).length)[0] ?? "category.modular_system";
    const src = (evidence: string) => ({ kind: "official_page" as const, url: rm.url, captured_at: a?.leido ?? rm.scraped_at, evidence });

    const shapeFact = a?.forma?.confirmado === "SI" ? addFact({ id: `F-${rm.model_key}-shape`, subject: rm.model_key, claim: `Forma: ${String(a.forma.valor)}`, source: src(a.forma.evidencia) }) : null;
    const shapeIds = a?.forma?.confirmado === "SI" ? concepts(String(a.forma.valor), "shape") : [];
    const styleFact = a?.estilo?.confirmado === "SI" ? addFact({ id: `F-${rm.model_key}-style`, subject: rm.model_key, claim: `Estilo: ${String(a.estilo.valor)}`, source: src(a.estilo.evidencia) }) : null;
    const styleIds = a?.estilo?.confirmado === "SI" ? concepts(String(a.estilo.valor), "style") : [];
    const matTexts = a?.materiales?.confirmado === "SI" ? (a.materiales.valor as string[]) : [];
    const matFact = matTexts.length ? addFact({ id: `F-${rm.model_key}-materials`, subject: rm.model_key, claim: `Materiales: ${matTexts.join("; ")}`, source: src(a!.materiales!.evidencia) }) : null;
    const matIds = [...new Set(matTexts.flatMap((t) => concepts(t, "material")))];
    let dims: Dimension[] | null = null;
    if (a?.medidas?.confirmado === "SI" && a.medidas.valor && typeof a.medidas.valor === "object") {
      dims = Object.entries(a.medidas.valor as Record<string, unknown>).map(([label, v]) => ({
        label: label.replace(/_/g, " "), text: Array.isArray(v) ? v.join(" · ") : String(v),
      }));
    }
    const dimFact = dims ? addFact({ id: `F-${rm.model_key}-dims`, subject: rm.model_key, claim: "Medidas publicadas", source: src(a!.medidas!.evidencia) }) : null;

    // Option lists: scope decided by the manual reading ("específica" vs "paleta genérica").
    const listVerdict = a?.lista_acabados;
    const scope: OptionScope | null = listVerdict?.confirmado === "SI" ? "model"
      : /GEN[ÉE]RICA/i.test(String(listVerdict?.valor ?? "")) ? "generic_palette" : null;
    // A line palette is mentionable with a caveat unless the page text contradicts it.
    const listText = String(listVerdict?.valor ?? "");
    const line = /ARMADI/i.test(listText) ? "armadi" : /NOTTE/i.test(listText) ? "notte" : null;
    const lineBlocked = a?.paleta_de_linea?.confirmado === "NO";
    const groups: OptionGroup[] = [];
    const seenOpt = new Set<string>();
    for (const g of rm.finish_groups) {
      for (const col of g.collections) {
        const colName = col.name ?? g.group ?? "—";
        const gid = `${rm.model_key}/${slug(g.group ?? "")}/${slug(colName)}`;
        const listFact = addFact({ id: `F-${gid}`, subject: gid, claim: `Lista '${colName}' en la ficha (${g.group ?? "sin grupo"})`, source: src(`${g.group ?? ""} › ${colName}: ${col.options.length} muestras`) });
        const mat = proposeLineMaterial(lx, colName);
        const options: Option[] = [];
        for (const o of col.options) {
          const name = o.label ?? o.code ?? "—";
          let oid = `${gid}/${slug(name)}`;
          while (seenOpt.has(oid)) oid += "~";
          seenOpt.add(oid);
          const cp = proposeColor(name, o.swatch_hex);
          options.push({ id: oid, official_name: name, code: o.code, color_family: cp.families, tone: cp.tone ?? undefined, swatch: { url: o.swatch_url, hex: o.swatch_hex }, fact: listFact.id });
        }
        groups.push({
          id: gid, name: colName, group_title: g.group, applies_to: roleFor(g.group, colName, category),
          material: mat.material, price_band: g.tier ? `CAT. ${g.tier}` : null,
          scope: scope === "model" || promoted.has(gid) ? "model"
            : scope === "generic_palette" && line && !lineBlocked && !excluded.has(gid) ? "line" : "generic_palette",
          line: scope === "model" ? null : line, options, fact: listFact.id,
        });
      }
    }
    // Options stated in the page text ("Impiallacciato Eccimeri: Rovere Dark, Rovere, Noce").
    for (const [i, line] of (a?.opciones_en_texto ?? []).entries()) {
      const m = /^([^:]+):\s*(.+)$/.exec(line);
      if (!m) continue;
      const gname = m[1].trim();
      const names = m[2].split(/,|\bo\b|\be\b|;/).map((s) => s.replace(PARENTHESIS, "").trim()).filter((s) => s.length > 1 && s.length < 40);
      const gid = `${rm.model_key}/text-${i}`;
      const tFact = addFact({ id: `F-${gid}`, subject: gid, claim: `Opciones en el texto: ${line}`, source: src(line) });
      groups.push({
        id: gid, name: gname, group_title: "texto de la ficha", applies_to: roleFor(null, gname, category),
        material: proposeLineMaterial(lx, gname).material, price_band: null, scope: "text",
        options: names.map((n) => {
          const cp = proposeColor(n, null);
          const mat = mostSpecific(lx, concepts(n, "material"));
          return { id: `${gid}/${slug(n)}`, official_name: n, code: null, color_family: cp.families, material: mat ?? undefined, tone: cp.tone ?? undefined, swatch: { url: null, hex: null }, fact: tFact.id };
        }),
        fact: tFact.id,
      });
    }
    const assertable = groups.filter((g) => (g.scope === "model" || g.scope === "text") && g.options.length > 0);

    models.push({
      id: rm.model_key,
      name: NAME_OVERRIDES[rm.model_key] ?? rm.heading ?? rm.model_key,
      category,
      official_url: rm.url || null,
      shapes: attr(shapeIds.length ? shapeIds : null, shapeFact),
      shape_text: a?.forma?.confirmado === "SI" ? String(a.forma.valor) : null,
      styles: attr(styleIds.length ? styleIds : null, styleFact),
      style_text: a?.estilo?.confirmado === "SI" ? String(a.estilo.valor) : null,
      materials: attr(matIds.length ? matIds : null, matFact),
      materials_text: matTexts,
      dimensions: attr(dims, dimFact),
      option_groups: groups,
      options_complete: scope === "model" && assertable.length > 0,
      description_it: rm.meta_description ?? null,
      notes: a?.notas ?? [],
    });
  }

  // ---------------------------------------------------------------- exhibits
  const exhibits: Exhibit[] = [];
  const viewpoints: Viewpoint[] = [];
  const active = input.pieces.filter((p) => p.active);
  for (const p of active) {
    const category = pieceCategory(p);
    const modelId = modelOfPiece.get(p.product_id) ?? `orphan-${p.product_id}`;
    const obs = input.observations[p.product_id];
    const legacyOk = !input.ignore_legacy_values.includes(p.product_id);
    const colorsText = obs ? obs.colors : legacyOk ? p.colors : [];
    const matsText = obs ? obs.materials : legacyOk ? p.materials : [];
    // A captured piece is described only by what the capture shows: the v1 shape was often the
    // model's range ("rotondo o ovale, fisso o allungabile") or belonged to another piece.
    const shapeText = obs ? obs.shape ?? "" : legacyOk ? p.shape ?? "" : "";
    const kind = obs ? "tour_capture" as const : "catalog_v1" as const;
    const evidence = obs ? `captura ${p.product_id}: ${obs.colors.join(", ")} / ${obs.materials.join(", ")}` : `catálogo v1 (CASA 01 manual): ${p.colors.join(", ")} / ${p.materials.join(", ")}`;

    let configuration: Attr<ConfiguredComponent[]> = { status: "unknown", reason: "not_captured" };
    if (colorsText.length || matsText.length) {
      const f = addFact({ id: `F-${p.product_id}-conf`, subject: p.product_id, claim: `Se ve: ${colorsText.join(", ")} · ${matsText.join(", ")}`, source: { kind, captured_at: now.slice(0, 10), evidence } });
      const colorIds = [...new Set(colorsText.flatMap((t) => [
        ...concepts(t, "color"),
        ...t.split(/[\/,;]| e | y | and /).flatMap((part) => proposeColor(part, null).families),
      ]))];
      // The first observed material is the dominant surface; refine it to its most specific concept.
      const firstMats = concepts(matsText[0] ?? "", "material");
      const dominantMat = mostSpecific(lx, firstMats);
      const otherMats = [...new Set(matsText.slice(1).flatMap((t) => concepts(t, "material")))].filter((m) => !firstMats.includes(m));
      const comp: ConfiguredComponent = { role: dominantRole(category), dominant: true, material: dominantMat, color_family: colorIds, observed_color: colorsText.join(", ") || null };
      const extra: ConfiguredComponent[] = otherMats.map((m) => ({ role: "whole", dominant: false, material: m, color_family: [], observed_color: null }));
      configuration = attr([comp, ...extra], f, "not_captured");
    }
    let shapeAs: Attr<ConceptId[]> = { status: "unknown", reason: "not_captured" };
    const shapeIds = shapeText ? concepts(shapeText, "shape") : [];
    if (shapeIds.length) {
      const f = addFact({ id: `F-${p.product_id}-shape`, subject: p.product_id, claim: `Forma expuesta: ${shapeText}`, source: { kind, captured_at: now.slice(0, 10), evidence: shapeText } });
      shapeAs = attr(shapeIds, f, "not_captured");
    }
    const model = models.find((m) => m.id === modelId);
    exhibits.push({
      id: p.product_id, model_id: modelId, name: p.name.replace(/\.$/, ""), category, zone: p.section,
      configuration, shape_as_shown: shapeAs, styles: model?.styles ?? { status: "unknown", reason: "not_published" },
      co_exhibited_with: active.filter((q) => q.product_id !== p.product_id && q.media_name === p.media_name).map((q) => q.product_id),
      image_url: p.image_url, description: p.description,
    });
    viewpoints.push({ exhibit_id: p.product_id, media_name: p.media_name, yaw: p.yaw, pitch: p.pitch, fov: p.fov, hotspot_name: p.hotspot_name });
  }

  const catalog: CanonicalCatalog = {
    tour_id: input.tour_id, data_version: input.data_version, built_at: now, mode: input.mode,
    models, exhibits, viewpoints, facts,
  };
  return { catalog, report: gateReport(catalog) };
}

// ---------------------------------------------------------------- gates
export interface GateReport {
  mode: "strict" | "dev";
  exhibits: number;
  models: number;
  gates: { id: string; label: string; pass: number; total: number; ok: boolean; missing?: string[] }[];
}

export function gateReport(cat: CanonicalCatalog): GateReport {
  const ex = cat.exhibits;
  const g = (id: string, label: string, list: { id: string; ok: boolean }[]) => {
    const pass = list.filter((x) => x.ok).length;
    return { id, label, pass, total: list.length, ok: pass === list.length, missing: list.filter((x) => !x.ok).map((x) => x.id).slice(0, 40) };
  };
  const dominant = (e: Exhibit) => e.configuration.status === "known" ? e.configuration.value.find((c) => c.dominant) : undefined;
  return {
    mode: cat.mode, exhibits: ex.length, models: cat.models.length,
    gates: [
      g("G1", "Pieza con modelo y ficha oficial", ex.map((e) => ({ id: e.id, ok: !!cat.models.find((m) => m.id === e.model_id)?.official_url }))),
      g("G2", "Pieza con color del componente dominante", ex.map((e) => ({ id: e.id, ok: (dominant(e)?.color_family.length ?? 0) > 0 }))),
      g("G3", "Pieza con material del componente dominante", ex.map((e) => ({ id: e.id, ok: !!dominant(e)?.material }))),
      g("G4", "Modelo con forma conocida", cat.models.map((m) => ({ id: m.id, ok: m.shapes.status === "known" }))),
      g("G5", "Opción oficial con familia de color", cat.models.flatMap((m) => m.option_groups.flatMap((gr) => gr.options.map((o) => ({ id: o.id, ok: o.color_family.length > 0 }))))),
      g("G6", "Colección con material", cat.models.flatMap((m) => m.option_groups.map((gr) => ({ id: gr.id, ok: !!gr.material || gr.options.every((o) => !!o.material) })))),
      g("G7", "Hechos validados por Andrea", cat.facts.map((f) => ({ id: f.id, ok: f.review.status === "validated" }))),
    ],
  };
}
