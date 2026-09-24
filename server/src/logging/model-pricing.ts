/**
 * Per-1M-token USD pricing for the models this project's provider adapters
 * support — cached from provider pricing pages as of 2026-06-24 (see the
 * `claude-api` skill's pricing table for the Anthropic rows). Used only to
 * populate `reported_cost_usd` in the usage log for the Fase 2 gpt-4o-mini
 * vs. Claude cost comparison; not used for billing.
 *
 * `cachedInput` is the discounted per-1M rate for tokens served from a
 * provider-side prompt cache (OpenAI's `cached_tokens`, Anthropic's
 * `cache_read_input_tokens`) — both providers report cached tokens as a
 * SUBSET of `input_tokens` (see the adapters' usage-mapping comments), so
 * cost math must subtract the cached count before applying the full input
 * rate, then add it back at the cached rate.
 */
interface ModelPricing {
  input: number;
  cachedInput: number;
  output: number;
}

const PRICING: Record<string, ModelPricing> = {
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10.0 },
  "claude-sonnet-5": { input: 2.0, cachedInput: 0.2, output: 10.0 },
  "claude-haiku-4-5": { input: 1.0, cachedInput: 0.1, output: 5.0 },
};

export function computeCostUsd(
  model: string,
  usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number }
): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  const uncachedInput = usage.input_tokens - usage.cached_input_tokens;
  const cost =
    (uncachedInput / 1_000_000) * pricing.input +
    (usage.cached_input_tokens / 1_000_000) * pricing.cachedInput +
    (usage.output_tokens / 1_000_000) * pricing.output;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
