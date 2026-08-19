import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, "../..");

export interface UsageLogEntry {
  tour_id: string;
  session_id: string;
  model: string;
  provider: string;
  input_tokens: number;
  cached_input_tokens: number;
  reasoning_tokens: number;
  output_tokens: number;
  reported_cost_usd: number;
  latency_ms: number;
  tool_call_valid: boolean;
  navigation_correct: boolean | null;
}

export function logUsage(entry: UsageLogEntry): void {
  const logPath = path.resolve(SERVER_ROOT, config.USAGE_LOG_PATH);
  const dir = path.dirname(logPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(logPath, JSON.stringify(entry) + "\n", "utf8");
}
