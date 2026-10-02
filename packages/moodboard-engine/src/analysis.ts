import { openaiPost, type OpenAIConfig } from "./openai.js";
import { textCostUsd } from "./pricing.js";
import type {
  ColorRole,
  MoodboardAnalysis,
  MoodboardLocale,
  MoodboardMaterial,
  MoodboardProduct,
  PaletteColor,
  StoredAnalysis,
  TextureDifficulty,
} from "./types.js";

/**
 * IA #1: writes the moodboard's words and choices (motto, description,
 * palette, materials) from the saved pieces' photos and showroom facts.
 *
 * What changed from moodboard-ai, where the input was a photo of a room:
 * - The style label is an INPUT, not an output. The wishlist already
 *   computed it (catalog-engine's computeStyleProfile, pure statistics over
 *   the catalog's `style` tags) and the moodboard must show the same one.
 * - The input is 1-2 saved products: their official catalog photo plus
 *   whatever the catalog records about the piece as displayed in the
 *   showroom (colors, materials, finish, shape).
 *
 * Structured Outputs (json_schema, strict) keep the shape fixed: the texture
 * step receives data, not free text.
 */

export const PALETTE_SIZE = 6;
export const MATERIAL_COUNT = 4;
const MOTTO_LINES = 2;
const TIMEOUT_MS = 90_000;

const LANGUAGE: Record<MoodboardLocale, string> = { it: "Italian", es: "Spanish", en: "English" };

const EXAMPLES: Record<MoodboardLocale, { motto: string; description: string }> = {
  it: {
    motto: '["Essenziale, caldo e naturale.", "Il tuo spazio, il tuo equilibrio."]',
    description: "Colori naturali, legni chiari e texture materiche per ambienti luminosi e accoglienti.",
  },
  es: {
    motto: '["Esencial, cálido y natural.", "Tu espacio, tu equilibrio."]',
    description: "Colores naturales, maderas claras y texturas matéricas para ambientes luminosos y acogedores.",
  },
  en: {
    motto: '["Essential, warm and natural.", "Your space, your balance."]',
    description: "Natural colours, light woods and tactile textures for bright, welcoming rooms.",
  },
};

export interface AnalysisAnchor {
  product: MoodboardProduct;
  /** The product's catalog photo as a data URL, or null if it could not be read. */
  imageDataUrl: string | null;
}

export interface AnalysisInput {
  style: string;
  brand: string;
  locale: MoodboardLocale;
  anchors: AnalysisAnchor[];
  model: string;
  /** Responses API `reasoning.effort`; omitted when undefined. */
  reasoningEffort?: string;
}

function describePiece(anchor: AnalysisAnchor, index: number): string {
  const p = anchor.product;
  const facts: string[] = [];
  if (p.colors.length) facts.push(`colors: ${p.colors.join(", ")}`);
  if (p.materials.length) facts.push(`materials: ${p.materials.join(", ")}`);
  if (p.finish.length) facts.push(`finish line: ${p.finish.join(", ")}`);
  if (p.shape) facts.push(`shape: ${p.shape}`);
  const photo = anchor.imageDataUrl ? "" : " (no photo available)";
  const factLine = facts.length ? `Showroom facts: ${facts.join("; ")}.` : "Showroom facts: none recorded, rely on the photo.";
  return `${index + 1}. "${p.name}" (${p.category})${photo}\n   ${factLine}`;
}

export function buildInstructions(input: AnalysisInput): string {
  const language = LANGUAGE[input.locale];
  return [
    `You are the art director of ${input.brand}, an Italian furniture brand, composing a client's moodboard.`,
    "",
    `The client's style was already determined from the products they saved: "${input.style}". It is final:`,
    "do not rename, translate or reinterpret it. Everything you write must express this style.",
    "",
    "The moodboard is inspired by the saved pieces below. Their official catalog photos are attached in the",
    "same order. A photo may show a different finish than the piece in the showroom, and other furniture",
    "around it. When showroom facts are listed, they describe the real piece and win over the photo.",
    "",
    ...input.anchors.map(describePiece),
    "",
    "Write:",
    `- motto: exactly ${MOTTO_LINES} short, evocative lines (not a technical description).`,
    "- description: one sentence, at most 20 words, on the colours, materials and textures of the moodboard.",
    `- palette: exactly ${PALETTE_SIZE} clearly distinct colours (never two near-identical shades), from most`,
    "  to least present, weights summing to about 100. Take them from the pieces and complete them with",
    "  tones typical of the style. Name each colour as an interior designer would.",
    `- materials: exactly ${MATERIAL_COUNT} surface materials that define the moodboard. Prefer materials`,
    "  visible on the saved pieces; you may add at most one complementary material typical of the style.",
    "  Each one is shown as a flat, opaque swatch: never choose glass, mirror, water or any other",
    "  transparent material (they render as a blur). If a piece has glass, pick another of its materials.",
    '  - difficulty: "simple" for flat, matte, repetitive surfaces (wood, fabric, plaster, matte lacquer,',
    '    stone); "complex" only for glossy, reflective, patterned or veined surfaces (polished metal,',
    "    high-gloss lacquer, decorated tiles, veined marble).",
    "  - texturePrompt, in English: a close-up of that material's surface only. Always: tileable seamless",
    "    pattern, top-down view, soft diffused light, no objects, no people, no text. Include the hex",
    "    colour from the palette that matches the material.",
    "",
    `Language: motto, description, colour names and material names and descriptions in ${language}.`,
    "texturePrompt always in English.",
    "Never name products, prices or other brands in the texts.",
  ].join("\n");
}

function buildSchema(locale: MoodboardLocale): Record<string, unknown> {
  const language = LANGUAGE[locale];
  const example = EXAMPLES[locale];
  return {
    type: "object",
    properties: {
      motto: {
        type: "array",
        items: { type: "string" },
        description: `Exactly ${MOTTO_LINES} short lines in ${language}, without quotation marks. Example: ${example.motto}`,
      },
      description: {
        type: "string",
        description: `One sentence in ${language}, at most 20 words. Example: "${example.description}"`,
      },
      palette: {
        type: "array",
        description: `Exactly ${PALETTE_SIZE} colours, most present first.`,
        items: {
          type: "object",
          properties: {
            hex: { type: "string", description: "Hex colour, e.g. #C8955A" },
            name: { type: "string", description: `Colour name in ${language}.` },
            role: { type: "string", enum: ["dominant", "secondary", "accent"] },
            weight: { type: "number", description: "Share of the moodboard, 0-100." },
          },
          required: ["hex", "name", "role", "weight"],
          additionalProperties: false,
        },
      },
      materials: {
        type: "array",
        description: `Exactly ${MATERIAL_COUNT} surface materials.`,
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: `Short material name in ${language}.` },
            description: { type: "string", description: `Grain, finish, feel. In ${language}, max 10 words.` },
            difficulty: { type: "string", enum: ["simple", "complex"] },
            texturePrompt: { type: "string", description: "English prompt for an image model." },
          },
          required: ["name", "description", "difficulty", "texturePrompt"],
          additionalProperties: false,
        },
      },
    },
    required: ["motto", "description", "palette", "materials"],
    additionalProperties: false,
  };
}

export function buildAnalysisRequest(input: AnalysisInput): Record<string, unknown> {
  const images = input.anchors
    .filter((a) => a.imageDataUrl)
    .map((a) => ({ type: "input_image", image_url: a.imageDataUrl }));
  return {
    model: input.model,
    input: [{ role: "user", content: [{ type: "input_text", text: buildInstructions(input) }, ...images] }],
    text: { format: { type: "json_schema", name: "moodboard", strict: true, schema: buildSchema(input.locale) } },
    ...(input.reasoningEffort ? { reasoning: { effort: input.reasoningEffort } } : {}),
  };
}

/**
 * The Responses API can put reasoning items before the message: take the
 * first output_text block wherever it is.
 */
function extractText(response: Record<string, unknown>): string | null {
  if (typeof response.output_text === "string" && response.output_text) return response.output_text;
  const output = Array.isArray(response.output) ? response.output : [];
  for (const item of output as Array<{ content?: Array<{ type?: string; text?: string }> }>) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text) return part.text;
    }
  }
  return null;
}

function cleanLine(value: unknown): string {
  // The UI draws its own quotation marks around the motto.
  return typeof value === "string" ? value.trim().replace(/^["'“”«»]+|["'“”«»]+$/g, "").trim() : "";
}

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${raw.split("").map((c) => c + c).join("")}`.toUpperCase();
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw}`.toUpperCase();
  return null;
}

/** Below this RGB distance two swatches read as the same colour (e.g. #343638 vs #2F3032, measured: 9.8). */
const MIN_COLOR_DISTANCE = 14;

function rgbDistance(a: string, b: string): number {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [x, y] = [channels(a), channels(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

const ROLES: readonly ColorRole[] = ["dominant", "secondary", "accent"];
const DIFFICULTIES: readonly TextureDifficulty[] = ["simple", "complex"];

/**
 * Strict mode can't express minItems/maxItems or a hex pattern, so the
 * limits are enforced here. Throws when too little survives to fill the
 * template: an incomplete analysis must not be cached as if it were good.
 */
export function sanitizeAnalysis(raw: unknown): MoodboardAnalysis {
  const r = (raw ?? {}) as Record<string, unknown>;

  const motto = (Array.isArray(r.motto) ? r.motto : []).map(cleanLine).filter(Boolean).slice(0, MOTTO_LINES);

  const palette: PaletteColor[] = [];
  for (const c of Array.isArray(r.palette) ? r.palette : []) {
    const color = (c ?? {}) as Record<string, unknown>;
    const hex = normalizeHex(color.hex);
    // Near-duplicates look like a rendering bug on the board: keep the first
    // (more present) one and drop the rest.
    if (!hex || palette.some((p) => rgbDistance(p.hex, hex) < MIN_COLOR_DISTANCE)) continue;
    const weight = typeof color.weight === "number" && Number.isFinite(color.weight) ? color.weight : 0;
    palette.push({
      hex,
      name: typeof color.name === "string" ? color.name.trim() : "",
      role: ROLES.includes(color.role as ColorRole) ? (color.role as ColorRole) : "secondary",
      weight: Math.min(100, Math.max(0, Math.round(weight))),
    });
  }

  const materials: MoodboardMaterial[] = [];
  for (const m of Array.isArray(r.materials) ? r.materials : []) {
    const material = (m ?? {}) as Record<string, unknown>;
    const name = typeof material.name === "string" ? material.name.trim() : "";
    const texturePrompt = typeof material.texturePrompt === "string" ? material.texturePrompt.trim() : "";
    if (!name || !texturePrompt) continue;
    materials.push({
      name,
      description: typeof material.description === "string" ? material.description.trim() : "",
      difficulty: DIFFICULTIES.includes(material.difficulty as TextureDifficulty)
        ? (material.difficulty as TextureDifficulty)
        : "simple",
      texturePrompt,
    });
  }

  const description = typeof r.description === "string" ? r.description.trim() : "";
  if (motto.length === 0 || !description || palette.length < 3 || materials.length === 0) {
    throw new Error("Incomplete moodboard analysis from the model.");
  }
  return {
    motto,
    description,
    palette: palette.slice(0, PALETTE_SIZE),
    materials: materials.slice(0, MATERIAL_COUNT),
  };
}

export async function runAnalysis(openai: OpenAIConfig, input: AnalysisInput): Promise<StoredAnalysis> {
  const started = Date.now();
  const response = await openaiPost(openai, "/responses", buildAnalysisRequest(input), TIMEOUT_MS);
  const text = extractText(response);
  if (!text) throw new Error("The analysis model returned no text.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`The analysis model returned non-JSON output: ${text.slice(0, 200)}`);
  }
  return {
    analysis: sanitizeAnalysis(parsed),
    model: input.model,
    costUsd: textCostUsd(input.model, response.usage as { input_tokens?: number; output_tokens?: number }),
    ms: Date.now() - started,
    createdAt: new Date().toISOString(),
  };
}
