import { openaiPost, type OpenAIConfig } from "./openai.js";
import { imageCostUsd } from "./pricing.js";
import type { TextureDifficulty } from "./types.js";

/**
 * IA #2: paints one texture per material, text-to-image only.
 *
 * The image model never sees the product photos. moodboard-ai tried
 * image-to-image and dropped it on purpose: shown a photo, the model copies
 * objects, shadows and perspective, while a texture has to be a flat,
 * repeatable surface. The English prompt the analysis wrote, with the exact
 * hex inside, pins the one thing that must match the moodboard: the colour.
 */

const TIMEOUT_MS = 120_000;
const QUALITIES = ["low", "medium", "high"] as const;

export interface ImageModelChoice {
  model: string;
  quality: (typeof QUALITIES)[number];
}

/** Which image model paints each difficulty ("auto" mode in moodboard-ai, the one it recommends). */
export type TextureRoute = Record<TextureDifficulty, ImageModelChoice>;

/** Parses "gpt-image-1-mini:low" into a model and a quality. */
export function parseImageModel(value: string): ImageModelChoice {
  const [model, quality = "low"] = value.split(":").map((s) => s.trim());
  if (!model || !(QUALITIES as readonly string[]).includes(quality)) {
    throw new Error(`Invalid image model "${value}". Expected "<model>:<low|medium|high>".`);
  }
  return { model, quality: quality as ImageModelChoice["quality"] };
}

export interface GeneratedImage {
  bytes: Buffer;
  mime: "image/webp";
  model: string;
  costUsd: number;
  ms: number;
}

export async function generateTexture(
  openai: OpenAIConfig,
  prompt: string,
  choice: ImageModelChoice
): Promise<GeneratedImage> {
  const started = Date.now();
  const response = await openaiPost(
    openai,
    "/images/generations",
    {
      model: choice.model,
      prompt,
      n: 1,
      size: "1024x1024",
      quality: choice.quality,
      output_format: "webp",
      // Shown at ~250px on the board: 80 is visually lossless there and a
      // fraction of the bytes the tour visitor has to download.
      output_compression: 80,
    },
    TIMEOUT_MS
  );
  const data = Array.isArray(response.data) ? (response.data as Array<{ b64_json?: string }>) : [];
  const b64 = data[0]?.b64_json;
  if (!b64) throw new Error("The image model returned no image.");
  return {
    bytes: Buffer.from(b64, "base64"),
    mime: "image/webp",
    model: `${choice.model} (${choice.quality})`,
    costUsd: imageCostUsd(choice.model, response.usage as { input_tokens?: number; output_tokens?: number }),
    ms: Date.now() - started,
  };
}
