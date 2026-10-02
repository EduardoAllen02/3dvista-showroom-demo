import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { parseImageModel, type TextureRoute } from "@3dvista-assistant/moodboard-engine";
import { config } from "../config.js";
import { loadTourConfig } from "../catalog/catalog-loader.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, "../..");

/**
 * The moodboard's own settings, read from the same server/.env but owned by
 * this module: the chatbot's config schema doesn't know (or need to know)
 * the moodboard exists. Models are fixed here, per deployment, never chosen
 * by the browser: every generation is paid from this backend's key.
 */
const MoodboardEnvSchema = z.object({
  MOODBOARD_ENABLED: z.enum(["true", "false"]).default("true"),
  MOODBOARD_ANALYSIS_MODEL: z.string().min(1).default("gpt-5.6-luna"),
  // "low" measured 7.7 s vs 11-15 s with the model's default, same quality
  // (2026-09-25, gpt-5.6-luna). "default" omits the parameter.
  MOODBOARD_ANALYSIS_REASONING: z.string().min(1).default("low"),
  MOODBOARD_TEXTURE_SIMPLE: z.string().min(1).default("gpt-image-1-mini:low"),
  MOODBOARD_TEXTURE_COMPLEX: z.string().min(1).default("gpt-image-1.5:low"),
  MOODBOARD_CACHE_DIR: z.string().min(1).default("./data/moodboards"),
  MOODBOARD_USAGE_LOG_PATH: z.string().min(1).default("./data/moodboard-usage.jsonl"),
  MOODBOARD_DAILY_LIMIT: z.coerce.number().int().min(1).default(300),
  MOODBOARD_SESSION_HOURLY_LIMIT: z.coerce.number().int().min(1).default(6),
  MOODBOARD_BRAND: z.string().min(1).optional(),
});

export interface MoodboardConfig {
  enabled: boolean;
  /** Why it's off, for the startup log. */
  disabledReason: string | null;
  openaiApiKey: string;
  analysisModel: string;
  analysisReasoningEffort: string | undefined;
  textureRoute: TextureRoute;
  cacheDir: string;
  usageLogPath: string;
  dailyLimit: number;
  sessionHourlyLimit: number;
  brand: string;
}

/** "Assistente Febal Casa" -> "Febal Casa": same rule the wishlist's PDF byline uses. */
function brandFromTour(): string {
  const tour = loadTourConfig() as unknown as { assistant?: { assistantName?: string }; displayName?: string };
  const name = tour.assistant?.assistantName ?? tour.displayName?.split("—")[0] ?? config.TOUR_ID;
  return name.replace(/^(asistente|assistente|assistant)\s+/i, "").trim();
}

export function loadMoodboardConfig(): MoodboardConfig {
  const env = MoodboardEnvSchema.parse(process.env);
  const apiKey = process.env.OPENAI_API_KEY ?? "";
  const disabledReason =
    env.MOODBOARD_ENABLED === "false"
      ? "MOODBOARD_ENABLED=false"
      : !apiKey
        ? "falta OPENAI_API_KEY (el moodboard siempre genera con OpenAI, sea cual sea MODEL_PROVIDER)"
        : null;
  return {
    enabled: disabledReason === null,
    disabledReason,
    openaiApiKey: apiKey,
    analysisModel: env.MOODBOARD_ANALYSIS_MODEL,
    analysisReasoningEffort: env.MOODBOARD_ANALYSIS_REASONING === "default" ? undefined : env.MOODBOARD_ANALYSIS_REASONING,
    textureRoute: {
      simple: parseImageModel(env.MOODBOARD_TEXTURE_SIMPLE),
      complex: parseImageModel(env.MOODBOARD_TEXTURE_COMPLEX),
    },
    cacheDir: path.resolve(SERVER_ROOT, env.MOODBOARD_CACHE_DIR),
    usageLogPath: path.resolve(SERVER_ROOT, env.MOODBOARD_USAGE_LOG_PATH),
    dailyLimit: env.MOODBOARD_DAILY_LIMIT,
    sessionHourlyLimit: env.MOODBOARD_SESSION_HOURLY_LIMIT,
    brand: env.MOODBOARD_BRAND ?? brandFromTour(),
  };
}
