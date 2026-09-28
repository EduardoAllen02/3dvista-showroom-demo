import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const EnvSchema = z
  .object({
    PORT: z.coerce.number().default(8787),
    // "openai" (default, unchanged behavior), "anthropic" (raw Messages API,
    // needs ANTHROPIC_API_KEY), or "claude-code" (Fase 2 local comparison —
    // routes through the Claude Agent SDK using the machine's own Claude
    // Code CLI login, no API key/billing at all). Only the matching key is
    // required below, so a single .env can hold both keys and switch
    // providers per-process via a shell-level MODEL_PROVIDER override
    // (dotenv doesn't clobber already-set process.env vars), letting
    // multiple local instances run from the same server/ checkout.
    MODEL_PROVIDER: z.enum(["openai", "anthropic", "claude-code"]).default("openai"),
    OPENAI_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),
    MODEL_ID: z.string().default("gpt-4o-mini"),
    // "v2" (default): packages/assistant-engine (sourced catalog + query engine; the LLM only
    // plans and writes; needs OPENAI_API_KEY). "v1": the old tool-calling orchestrator, kept as
    // a fallback only.
    ASSISTANT_ENGINE: z.enum(["v1", "v2"]).default("v2"),
    TOUR_ID: z.string().default("demo-showroom"),
    ALLOWED_ORIGIN: z.string().default("http://localhost:5500"),
    USAGE_LOG_PATH: z.string().default("./data/usage.jsonl"),
  })
  .superRefine((data, ctx) => {
    if (data.MODEL_PROVIDER === "openai" && !data.OPENAI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["OPENAI_API_KEY"],
        message: "OPENAI_API_KEY es obligatorio cuando MODEL_PROVIDER=openai — copia server/.env.example a server/.env",
      });
    }
    if (data.MODEL_PROVIDER === "anthropic" && !data.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ANTHROPIC_API_KEY"],
        message: "ANTHROPIC_API_KEY es obligatorio cuando MODEL_PROVIDER=anthropic",
      });
    }
  });

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Configuración inválida en server/.env:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  process.exit(1);
}

export const config = parsed.data;
