/**
 * Minimal OpenAI HTTP client: plain fetch, no SDK, same as moodboard-ai.
 * The key is only ever read server-side.
 */
export interface OpenAIConfig {
  apiKey: string;
  baseUrl?: string;
}

export class OpenAIError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "OpenAIError";
  }
}

export async function openaiPost(
  config: OpenAIConfig,
  path: string,
  body: unknown,
  timeoutMs: number
): Promise<Record<string, unknown>> {
  const res = await fetch(`${config.baseUrl ?? "https://api.openai.com/v1"}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new OpenAIError(`OpenAI ${path} ${res.status}: ${detail.slice(0, 400)}`, res.status);
  }
  return (await res.json()) as Record<string, unknown>;
}
