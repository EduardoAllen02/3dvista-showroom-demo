import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8787),
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY es obligatorio — copia server/.env.example a server/.env"),
  MODEL_ID: z.string().default("gpt-4o-mini"),
  TOUR_ID: z.string().default("demo-showroom"),
  ALLOWED_ORIGIN: z.string().default("http://localhost:5500"),
  USAGE_LOG_PATH: z.string().default("./data/usage.jsonl"),
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
