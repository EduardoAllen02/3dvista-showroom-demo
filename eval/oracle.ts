/**
 * Independent oracle for the query engine (docs/chatbot-v2/02-arquitectura-clean-room.md §10, L1).
 *
 * Written separately on purpose: it does NOT import the engine. It re-derives, by brute
 * force over the canonical catalog JSON, which pieces satisfy a set of constraints physically
 * (T1) and which models can be ordered satisfying them (T2). The differential test
 * compares both implementations on thousands of constraint combinations: any difference
 * is either an engine bug or an oracle bug, and must be explained before shipping.
 */
import type { CanonicalCatalog, Exhibit, Model } from "../packages/assistant-engine/src/catalog/types.js";
import type { OntologyPack } from "../packages/assistant-engine/src/ontology/types.js";

export interface OracleConstraint { facet: string; op: "is" | "not"; value: string }

export class Oracle {
  private parent = new Map<string, string>();
  constructor(private cat: CanonicalCatalog, pack: OntologyPack) {
    for (const c of pack.concepts) if (c.parent) this.parent.set(c.id, c.parent);
  }

  private under(id: string, target: string): boolean {
    for (let cur: string | undefined = id, i = 0; cur && i < 10; cur = this.parent.get(cur), i++) if (cur === target) return true;
    return false;
  }

  /** "yes" | "no" | "unknown" for one physical piece. */
  private pieceSays(e: Exhibit, c: OracleConstraint): "yes" | "no" | "unknown" {
    let r: "yes" | "no" | "unknown";
    if (c.facet === "category") r = this.under(e.category, c.value) ? "yes" : "no";
    else if (c.facet === "shape") r = e.shape_as_shown.status !== "known" ? "unknown" : e.shape_as_shown.value.some((s) => this.under(s, c.value)) ? "yes" : "no";
    else if (c.facet === "style") r = e.styles.status !== "known" ? "unknown" : e.styles.value.some((s) => this.under(s, c.value)) ? "yes" : "no";
    else if (c.facet === "color") {
      const fams = e.configuration.status === "known" ? e.configuration.value.filter((x) => x.dominant).flatMap((x) => x.color_family) : [];
      r = !fams.length ? "unknown" : fams.some((f) => this.under(f, c.value)) ? "yes" : "no";
    } else if (c.facet === "material") {
      const mats = e.configuration.status === "known" ? e.configuration.value.map((x) => x.material).filter((m): m is string => !!m) : [];
      r = !mats.length ? "unknown" : mats.some((m) => this.under(m, c.value)) ? "yes" : "no";
    } else r = "unknown";
    if (c.op === "not" && r !== "unknown") r = r === "yes" ? "no" : "yes";
    return r;
  }

  private modelOffers(m: Model, roleCs: OracleConstraint[]): boolean {
    for (const g of m.option_groups) {
      if (g.scope === "generic_palette") continue;
      for (const o of g.options) {
        const ok = roleCs.every((c) => {
          let hit = false;
          if (c.facet === "color") hit = o.color_family.some((f) => this.under(f, c.value));
          if (c.facet === "material") { const mat = o.material ?? g.material; hit = !!mat && this.under(mat, c.value); }
          return c.op === "not" ? !hit : hit;
        });
        if (ok) return true;
      }
    }
    return false;
  }

  /** Pieces that satisfy every constraint as they are exhibited. */
  exhibited(cs: OracleConstraint[]): Set<string> {
    return new Set(this.cat.exhibits.filter((e) => cs.every((c) => this.pieceSays(e, c) === "yes")).map((e) => e.id));
  }

  /** Models (not already exhibited as a full match) that can be ordered satisfying every constraint. */
  onOrder(cs: OracleConstraint[]): Set<string> {
    const roleCs = cs.filter((c) => c.facet === "color" || c.facet === "material");
    if (!roleCs.length) return new Set();
    const exhibitedModels = new Set(this.cat.exhibits.filter((e) => cs.every((c) => this.pieceSays(e, c) === "yes")).map((e) => e.model_id));
    const out = new Set<string>();
    for (const e of this.cat.exhibits) {
      const m = this.cat.models.find((x) => x.id === e.model_id);
      if (!m || exhibitedModels.has(m.id)) continue;
      const frameOk = cs.filter((c) => !roleCs.includes(c)).every((c) => {
        if (this.pieceSays(e, c) === "yes") return true;
        if ((c.facet === "shape" || c.facet === "style") && c.op === "is") {
          const a = c.facet === "shape" ? m.shapes : m.styles;
          return a.status === "known" && a.value.some((s) => this.under(s, c.value));
        }
        return false;
      });
      if (!frameOk) continue;
      if (roleCs.every((c) => this.pieceSays(e, c) === "yes")) continue;
      if (this.modelOffers(m, roleCs)) out.add(m.id);
    }
    return out;
  }
}
