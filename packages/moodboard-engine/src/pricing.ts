/**
 * USD per 1M tokens, for the usage log only: the production UI never shows
 * costs. Same table moodboard-ai measured against (prices verified
 * 2026-09-13, see moodboard-ai/docs/COSTOS.md).
 */
const TEXT_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-5.6-luna": { input: 0.2, output: 1.2 },
  "gpt-5.6-terra": { input: 2.0, output: 12.0 },
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
};

const IMAGE_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-image-1-mini": { input: 2.0, output: 8.0 },
  "gpt-image-1.5": { input: 5.0, output: 32.0 },
  "gpt-image-2": { input: 5.0, output: 30.0 },
  "gpt-image-1": { input: 5.0, output: 40.0 },
};

interface Usage {
  input_tokens?: number;
  output_tokens?: number;
}

function cost(price: { input: number; output: number } | undefined, usage: Usage | undefined): number {
  // Unknown model: 0 rather than a made-up number. The log then reads as
  // "unpriced", not as a wrong figure.
  if (!price || !usage) return 0;
  return ((usage.input_tokens ?? 0) / 1_000_000) * price.input + ((usage.output_tokens ?? 0) / 1_000_000) * price.output;
}

export function textCostUsd(model: string, usage: Usage | undefined): number {
  return cost(TEXT_PRICES[model], usage);
}

export function imageCostUsd(model: string, usage: Usage | undefined): number {
  return cost(IMAGE_PRICES[model], usage);
}
