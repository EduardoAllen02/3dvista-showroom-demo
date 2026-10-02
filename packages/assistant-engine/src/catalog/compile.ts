import type {
  Attr, CanonicalCatalog, ComponentRole, ConceptId, ConfiguredComponent, Dimension, Exhibit, Fact, Model, Option,
  OptionGroup, OptionScope, Viewpoint,
} from "./types.js";
import { Lexicon, normalizeText } from "../ontology/lexicon.js";
import { proposeColor, proposeLineMaterial } from "../adapters/febal/naming.js";
import { MODEL_CATEGORY, NAME_OVERRIDES, febalRoleFromTitles, pieceCategory } from "../adapters/febal/source-map.js";
import type { DomainRules } from "../ontology/types.js";

/**
 * Compiles the raw, sourced product facts (tour-project/<tour>/product-facts) plus the
 * tour binding (camera/zone/image per piece) into the canonical catalog.
 *
 * mode "strict": a fact is "known" when it has a literal source (the official page or a tour
 *                 capture), was curated by hand in the database workbook, or was validated; the
 *                 review only corrects exceptions (rejected facts).
 *                 Legacy catalog-v1 values need an explicit validation.
 * mode "dev":    every pending fact is used as known (development/tests).
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
/**
 * Per model, which collections of its line palette apply, read from the page text
 * (product-facts/palette-decisions.json). aplica -> normal on-order option; aviso -> mentioned
 * with the "confirm on its page" caveat; no_aplica -> never mentioned. Unlisted collections take `default`.
 */
export type PaletteVerdict = "aplica" | "aviso" | "no_aplica";
export interface RawPaletteDecision {
  default: PaletteVerdict; aplica?: string[]; aviso?: string[]; no_aplica?: string[]; evidencia: string;
}

export interface ConceptOverrides {
  models?: Record<string, { shapes?: ConceptId[]; materials?: ConceptId[]; styles?: ConceptId[] }>;
  /** material: first = the dominant surface, rest = other parts. */
  pieces?: Record<string, {
    shape?: ConceptId[]; color?: ConceptId[]; material?: ConceptId[];
    /** Secondary parts the client named ("top" in travertino), with the finish as it is said. */
    parts?: { role: ComponentRole; material: ConceptId; observed: string }[];
  }>;
}

/** One part of a piece as the client's composition book lists it ("Rivestimento: Tessuto Earth Dune R215"). */
export interface OfficialFinishPart {
  parte: string;
  /** The finish, literally. */
  acabado: string;
  /** What answers say between «» (the finish's own name, untranslated). */
  nombre: string;
  material: ConceptId | null;
  /** Plain colour in Italian, localized by the renderer ("sabbia"). */
  color: string;
  familias: ConceptId[];
  rol: ComponentRole;
  principal: boolean;
}
export interface OfficialFinish { caja: string; pagina: number; nombre_libro: string; partes: OfficialFinishPart[]; nota?: string }
export interface OfficialDocument { documento: string; titulo: string; fecha_documento: string }
/** product-facts/book-compo-finishes.json: `_fuente` describes the document, every other key is a piece. */
export type OfficialFinishes = { _fuente: OfficialDocument } & Record<string, OfficialFinish | OfficialDocument>;

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
  palette_decisions?: Record<string, RawPaletteDecision>;
  /** Client edits from the database workbook: color families per official option name (lowercase). */
  color_overrides?: Record<string, ConceptId[]>;
  /** Client edits: material per collection name (uppercase); null = the collection has no material. */
  material_overrides?: Record<string, ConceptId | null>;
  /** Client edits to what the assistant understood (the "lo que entiende" columns of the database workbook). */
  concept_overrides?: ConceptOverrides;
  /** The finish of each part per the client's composition book: wins over the capture when present. */
  official_finishes?: OfficialFinishes;
  lexicon: Lexicon;
}


/** Words whose shape depends on the piece (the pack's shape_by_category: chaise → peninsula in a kitchen). */
function fitShapes(ids: ConceptId[], category: ConceptId, rules: DomainRules): ConceptId[] {
  const fit = (id: ConceptId) => rules.shape_by_category?.find((r) => r.from === id
    && (!r.in || r.in.includes(category)) && (!r.not_in || !r.not_in.includes(category)))?.to ?? id;
  return [...new Set(ids.map(fit))];
}

const slug = (s: string) => normalizeText(s).replace(/\s+/g, "-") || "x";

function roleFor(groupTitle: string | null, collection: string, category: ConceptId, rules: DomainRules): ComponentRole[] {
  return febalRoleFromTitles(groupTitle, collection) ?? rules.option_roles?.[category] ?? ["whole"];
}

function dominantRole(category: ConceptId, rules: DomainRules): ComponentRole {
  return rules.dominant_role?.[category] ?? "whole";
}

const PARENTHESIS = /\([^)]*\)/g;

/** The most specific concept of a list (drops any concept that is an ancestor of another). */
function mostSpecific(lx: Lexicon, ids: ConceptId[]): ConceptId | null {
  return ids.find((id) => !ids.some((o) => o !== id && lx.isA(o, id))) ?? null;
}

export function compileCatalog(input: CompileInput): { catalog: CanonicalCatalog; report: GateReport } {
  const { lexicon: lx } = input;
  const rules: DomainRules = lx.pack.domain ?? {};
  const facts: Fact[] = [];
  const validated = new Set(input.review?.validated_fact_ids ?? []);
  const rejected = new Set(input.review?.rejected_fact_ids ?? []);
  const promoted = new Set(input.review?.promoted_palette_groups ?? []);
  const excluded = new Set(input.review?.excluded_palette_groups ?? []);
  const now = new Date().toISOString();
  const colorOf = (name: string, proposed: ConceptId[]) => input.color_overrides?.[name.trim().toLowerCase()] ?? proposed;
  const materialOf = (collection: string, proposed: ConceptId | null) => {
    const k = collection.trim().toUpperCase();
    return input.material_overrides && k in input.material_overrides ? input.material_overrides[k] : proposed;
  };

  const addFact = (f: Omit<Fact, "review">): Fact => {
    const status = rejected.has(f.id) ? "rejected" : validated.has(f.id) ? "validated" : "pending";
    const fact: Fact = { ...f, review: { status, by: input.review?.reviewer, at: input.review?.at } };
    facts.push(fact);
    return fact;
  };
  const LITERAL = new Set(["official_page", "official_document", "tour_capture", "curated"]);
  const usable = (f: Fact) => f.review.status === "validated"
    || (f.review.status === "pending" && (input.mode === "dev" || LITERAL.has(f.source.kind)));
  function attr<T>(value: T | null, fact: Fact | null, reason: "not_captured" | "not_published" = "not_published"): Attr<T> {
    if (value === null || !fact) return { status: "unknown", reason };
    if (!usable(fact)) return { status: "unknown", reason: "pending_review" };
    return { status: "known", value, facts: [fact.id] };
  }
  /** A hand edit from the database workbook replaces what was derived from the text. */
  const curatedAttr = (subject: string, what: string, ids: ConceptId[] | undefined): Attr<ConceptId[]> | null => {
    if (!ids) return null;
    const f = addFact({ id: `F-${subject}-${what}-curated`, subject, claim: `${what}: ${ids.join(", ") || "(ninguno)"}`,
      source: { kind: "curated", captured_at: now.slice(0, 10), evidence: "editado en la base de datos en Excel" } });
    return attr(ids.length ? ids : null, f);
  };
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
    const mo = input.concept_overrides?.models?.[rm.model_key];
    const category = cats.includes("category.kitchen") ? "category.kitchen"
      : [...cats].sort((x, y) => cats.filter((c) => c === y).length - cats.filter((c) => c === x).length)[0] ?? MODEL_CATEGORY[rm.model_key] ?? "category.modular_system";
    const src = (evidence: string) => ({ kind: "official_page" as const, url: rm.url, captured_at: a?.leido ?? rm.scraped_at, evidence });

    const shapeFact = a?.forma?.confirmado === "SI" ? addFact({ id: `F-${rm.model_key}-shape`, subject: rm.model_key, claim: `Forma: ${String(a.forma.valor)}`, source: src(a.forma.evidencia) }) : null;
    const shapeIds = a?.forma?.confirmado === "SI" ? fitShapes(concepts(String(a.forma.valor), "shape"), category, rules) : [];
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
    const decision = input.palette_decisions?.[rm.model_key];
    const verdictOf = (colName: string): PaletteVerdict | null => {
      if (!decision) return null;
      const n = colName.trim().toUpperCase().replace(/\s+/g, " ");
      const has = (l?: string[]) => (l ?? []).some((c) => c.trim().toUpperCase().replace(/\s+/g, " ") === n);
      return has(decision.aplica) ? "aplica" : has(decision.aviso) ? "aviso" : has(decision.no_aplica) ? "no_aplica" : decision.default;
    };
    // Review first (promoted / excluded), then the page reading, then the line default.
    const paletteScope = (gid: string, colName: string): OptionScope => {
      if (promoted.has(gid)) return "model";
      if (excluded.has(gid) || !line) return "generic_palette";
      const v = verdictOf(colName);
      if (v === "aplica") return "model";
      if (v === "no_aplica") return "generic_palette";
      return v === "aviso" || !lineBlocked ? "line" : "generic_palette";
    };
    const groups: OptionGroup[] = [];
    const seenOpt = new Set<string>();
    for (const g of rm.finish_groups) {
      for (const col of g.collections) {
        const colName = col.name ?? g.group ?? "—";
        const gid = `${rm.model_key}/${slug(g.group ?? "")}/${slug(colName)}`;
        const listFact = addFact({ id: `F-${gid}`, subject: gid, claim: `Lista '${colName}' en la ficha (${g.group ?? "sin grupo"})`, source: src(`${g.group ?? ""} › ${colName}: ${col.options.length} muestras`) });
        const mat = proposeLineMaterial(lx, colName);
        const options: Option[] = [];
        const names = new Set<string>();
        for (const o of col.options) {
          // No label and no swatch ("missing-file.png") is not an option; the same name twice in a
          // collection is the same finish (two photos of one panel, a "(2)" copy on the site).
          if (!o.label && !o.code && (!o.swatch_url || o.swatch_url.includes("missing-file"))) continue;
          const name = o.label ?? o.code ?? "—";
          if (names.has(normalizeText(name))) continue;
          names.add(normalizeText(name));
          let oid = `${gid}/${slug(name)}`;
          while (seenOpt.has(oid)) oid += "~";
          seenOpt.add(oid);
          const cp = proposeColor(name, o.swatch_hex);
          options.push({ id: oid, official_name: name, code: o.code, color_family: colorOf(name, cp.families), tone: cp.tone ?? undefined, swatch: { url: o.swatch_url, hex: o.swatch_hex }, fact: listFact.id });
        }
        groups.push({
          id: gid, name: colName, group_title: g.group, applies_to: roleFor(g.group, colName, category, rules),
          material: materialOf(colName, mat.material), price_band: g.tier ? `CAT. ${g.tier}` : null,
          scope: scope === "model" ? "model" : scope === "generic_palette" ? paletteScope(gid, colName)
            : promoted.has(gid) ? "model" : "generic_palette",
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
      const groupMat = materialOf(gname, proposeLineMaterial(lx, gname).material);
      groups.push({
        id: gid, name: gname, group_title: "texto de la ficha", applies_to: roleFor(null, gname, category, rules),
        material: groupMat, price_band: null, scope: "text",
        options: names.map((n) => {
          const cp = proposeColor(n, null);
          // "Base metallo: Nero, Ottone scuro": when the list names its material, an option is a colour of it.
          const mat = groupMat ? null : mostSpecific(lx, concepts(n, "material"));
          return { id: `${gid}/${slug(n)}`, official_name: n, code: null, color_family: colorOf(n, cp.families), material: mat ?? undefined, tone: cp.tone ?? undefined, swatch: { url: null, hex: null }, fact: tFact.id };
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
      shapes: curatedAttr(rm.model_key, "shapes", mo?.shapes) ?? attr(shapeIds.length ? shapeIds : null, shapeFact),
      shape_text: a?.forma?.confirmado === "SI" ? String(a.forma.valor) : null,
      styles: curatedAttr(rm.model_key, "styles", mo?.styles) ?? attr(styleIds.length ? styleIds : null, styleFact),
      style_text: a?.estilo?.confirmado === "SI" ? String(a.estilo.valor) : null,
      materials: curatedAttr(rm.model_key, "materials", mo?.materials) ?? attr(matIds.length ? matIds : null, matFact),
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
    // What the capture shows wins over the old catalog label: FEB-021 "Sistema Origina" is "cucina a U".
    const shown = input.observations[p.product_id]?.shape ?? "";
    const category = /\bcucina\b/i.test(shown) ? "category.kitchen" : pieceCategory(p);
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

    const po = input.concept_overrides?.pieces?.[p.product_id];
    const book = p.product_id.startsWith("_") ? undefined : input.official_finishes?.[p.product_id] as OfficialFinish | undefined;
    let configuration: Attr<ConfiguredComponent[]> = { status: "unknown", reason: "not_captured" };
    if (book) {
      // The composition book names the finish of each part: it replaces what the capture inferred.
      // Its name goes between «» so answers quote it as is ("sabbia «Earth Dune R215»").
      const doc = input.official_finishes!._fuente;
      const curated = !!(po?.color || po?.material || po?.parts);
      const f = addFact({ id: `F-${p.product_id}-conf`, subject: p.product_id,
        claim: `Acabados (${book.caja}): ${book.partes.map((pt) => `${pt.parte}: ${pt.acabado}`).join("; ")}`,
        source: { kind: curated ? "curated" : "official_document", url: doc.documento, captured_at: doc.fecha_documento,
          evidence: `${doc.titulo}, pág. ${book.pagina}, ${book.caja} ${book.nombre_libro}: ${book.partes.map((pt) => `${pt.parte}: ${pt.acabado}`).join("; ")}${curated ? " (conceptos editados en la base de datos en Excel)" : ""}` } });
      const comps: ConfiguredComponent[] = book.partes.map((pt) => ({
        role: pt.principal ? dominantRole(category, rules) : pt.rol, dominant: pt.principal,
        material: pt.principal && po?.material ? po.material[0] : pt.material,
        color_family: pt.principal && po?.color ? po.color : pt.familias,
        observed_color: pt.nombre && normalizeText(pt.nombre) !== normalizeText(pt.color) ? `${pt.color} «${pt.nombre}»` : pt.color,
      }));
      // Parts the book does not list but the capture saw (a metal base, a glass lid) keep their material.
      const listed = new Set(comps.map((c) => c.material));
      for (const t of matsText.slice(1)) {
        for (const m of concepts(t, "material")) if (!listed.has(m)) { listed.add(m); comps.push({ role: "whole", dominant: false, material: m, color_family: [], observed_color: null }); }
      }
      for (const pt of po?.parts ?? []) comps.push({ role: pt.role, dominant: false, material: pt.material, color_family: [], observed_color: pt.observed });
      configuration = attr(comps, f, "not_captured");
    } else if (colorsText.length || matsText.length || po?.color || po?.material || po?.parts) {
      const curated = !!(po?.color || po?.material || po?.parts);
      const f = addFact({ id: `F-${p.product_id}-conf`, subject: p.product_id, claim: `Se ve: ${colorsText.join(", ")} · ${matsText.join(", ")}`,
        source: curated ? { kind: "curated", captured_at: now.slice(0, 10), evidence: `${evidence} (conceptos editados en la base de datos en Excel)` } : { kind, captured_at: now.slice(0, 10), evidence } });
      const colorIds = po?.color ?? [...new Set(colorsText.flatMap((t) => [
        ...concepts(t, "color"),
        ...t.split(/[\/,;]| e | y | and /).flatMap((part) => proposeColor(part, null).families),
      ]))];
      // The first observed material is the dominant surface; refine it to its most specific concept.
      const firstMats = po?.material ? po.material.slice(0, 1) : concepts(matsText[0] ?? "", "material");
      const dominantMat = mostSpecific(lx, firstMats);
      const otherMats = po?.material ? po.material.slice(1)
        : [...new Set(matsText.slice(1).flatMap((t) => concepts(t, "material")))].filter((m) => !firstMats.includes(m));
      const comp: ConfiguredComponent = { role: dominantRole(category, rules), dominant: true, material: dominantMat, color_family: colorIds, observed_color: colorsText.join(", ") || null };
      const extra: ConfiguredComponent[] = [
        ...otherMats.map((m): ConfiguredComponent => ({ role: "whole", dominant: false, material: m, color_family: [], observed_color: null })),
        ...(po?.parts ?? []).map((pt): ConfiguredComponent => ({ role: pt.role, dominant: false, material: pt.material, color_family: [], observed_color: pt.observed })),
      ];
      configuration = attr([comp, ...extra], f, "not_captured");
    }
    let shapeAs: Attr<ConceptId[]> = { status: "unknown", reason: "not_captured" };
    const shapeIds = shapeText ? fitShapes(concepts(shapeText, "shape"), category, rules) : [];
    if (po?.shape) {
      shapeAs = curatedAttr(p.product_id, "shape", po.shape)!;
    } else if (shapeIds.length) {
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
      g("G7", "Hechos con fuente literal o validados (sin rechazos)", cat.facts.map((f) => ({ id: f.id, ok: f.review.status === "validated" || (f.review.status === "pending" && ["official_page", "official_document", "tour_capture"].includes(f.source.kind)) }))),
    ],
  };
}
