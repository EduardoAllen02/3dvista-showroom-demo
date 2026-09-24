/**
 * OpenAI structured-output client (strict JSON schema) for the v2 turn pipeline
 * (planner + composer). Structurally matches assistant-engine's LlmJsonClient.
 * Prompt caching is automatic on OpenAI for prefixes ≥1024 tokens: the static
 * system prompt goes first and never contains volatile data.
 */
export interface JsonCompletionUsage { input_tokens: number; cached_input_tokens: number; output_tokens: number }

export function createOpenAiJsonClient(apiKey: string, model: string, opts: { timeoutMs?: number; temperature?: number } = {}) {
  return {
    model,
    async json(req: { system: string; user: string; schemaName: string; schema: object; maxTokens: number }): Promise<{ text: string; usage: JsonCompletionUsage; latency_ms: number }> {
      const t0 = Date.now();
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20000);
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          signal: ctrl.signal,
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            temperature: opts.temperature ?? 0,
            max_tokens: req.maxTokens,
            messages: [{ role: "system", content: req.system }, { role: "user", content: req.user }],
            response_format: { type: "json_schema", json_schema: { name: req.schemaName, strict: true, schema: req.schema } },
          }),
        });
        const body = (await res.json()) as {
          choices?: { message?: { content?: string | null; refusal?: string | null } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
          error?: { message: string };
        };
        if (!res.ok || body.error) throw new Error(`OpenAI ${res.status}: ${body.error?.message ?? res.statusText}`);
        const msg = body.choices?.[0]?.message;
        if (!msg?.content) throw new Error(`OpenAI empty content${msg?.refusal ? ` (refusal: ${msg.refusal})` : ""}`);
        return {
          text: msg.content,
          usage: {
            input_tokens: body.usage?.prompt_tokens ?? 0,
            cached_input_tokens: body.usage?.prompt_tokens_details?.cached_tokens ?? 0,
            output_tokens: body.usage?.completion_tokens ?? 0,
          },
          latency_ms: Date.now() - t0,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
