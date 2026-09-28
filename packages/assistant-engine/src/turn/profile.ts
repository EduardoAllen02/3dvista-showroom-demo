import type { Lang } from "../catalog/types.js";

/**
 * Who the assistant is and how it talks, per tour (clients/<tour>/assistant.json).
 * Everything here is wording, never logic: the same engine answers for a furniture
 * showroom, a decoration shop or a museum with a different profile (and domain pack).
 * Missing fields fall back to DEFAULT_PROFILE (a furniture showroom, no brand).
 */
export interface AssistantProfile {
  id: string;
  /** For the LLM prompts, which are written in Spanish. */
  prompt: {
    /** "el asesor de ventas" */
    role: string;
    /** The brand, when the products are one brand's ("Febal"): "la línea de Febal". */
    brand?: string;
    /** "un showroom de muebles de diseño italiano, recorrible como tour virtual 360°" */
    venue: string;
    /** Short form for the planner: "un showroom de muebles (tour virtual 360°)" */
    venue_short: string;
    /** Spanish contractions of the venue, as the prompts need them. */
    the_venue: string;   // "el showroom"
    in_venue: string;    // "en el showroom"
    of_venue: string;    // "del showroom"
    to_venue: string;    // "al showroom"
    /** Worked examples for the composer (they use real piece ids of the tour). */
    composer_examples: string;
  };
  /**
   * The tour's zone names ("CASA 03 - AUDACE"): `pattern` captures the parts, `label` rebuilds the
   * spoken form with {1}, {2}… (each part sentence-cased: "Casa 3 (Audace)"), `spoken` is the word
   * that precedes a zone number in prose ("casa 3"), so the verifier can check zones written by hand.
   */
  zones?: { pattern: string; label: string; spoken: string };
  /** Names of the product lines whose shared palette a model may use (the catalog's `line` keys). */
  line_names?: Record<string, Record<Lang, string>>;
  /** Visitor-facing template sentences that differ from the defaults, by key (see templates.ts). */
  texts?: Record<string, Partial<Record<Lang, string>>>;
  /** Card labels that differ from the defaults, by key (see render.ts). */
  labels?: Record<string, Partial<Record<Lang, string>>>;
}

export const DEFAULT_PROFILE: AssistantProfile = {
  id: "furniture-showroom",
  prompt: {
    role: "el asesor de ventas",
    venue: "un showroom de muebles, recorrible como tour virtual 360°",
    venue_short: "un showroom de muebles (tour virtual 360°)",
    the_venue: "el showroom",
    in_venue: "en el showroom",
    of_venue: "del showroom",
    to_venue: "al showroom",
    composer_examples: "",
  },
};

/** A tour's profile over the defaults (a partial file is enough). */
export function resolveProfile(p?: Partial<AssistantProfile> | null): AssistantProfile {
  if (!p) return DEFAULT_PROFILE;
  return { ...DEFAULT_PROFILE, ...p, prompt: { ...DEFAULT_PROFILE.prompt, ...(p.prompt ?? {}) } };
}

/** Default strings with the profile's replacements (whole sentences per language, never word patches). */
export function withOverrides<K extends string>(defaults: Record<K, Record<Lang, string>>, over?: Record<string, Partial<Record<Lang, string>>>): Record<K, Record<Lang, string>> {
  if (!over) return defaults;
  const out = { ...defaults };
  for (const k of Object.keys(over)) if (k in out) out[k as K] = { ...out[k as K], ...over[k] };
  return out;
}

/** "CASA 03 - AUDACE" → "Casa 3 (Audace)" with the profile's zone format; plain sentence case otherwise. */
export function zoneLabel(zone: string, zones?: AssistantProfile["zones"]): string {
  const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
  const m = zones ? new RegExp(zones.pattern, "i").exec(zone) : null;
  if (!m || !zones) return sentence(zone);
  return zones.label.replace(/\{(\d)\}/g, (_, i: string) => sentence(m[Number(i)] ?? ""));
}
