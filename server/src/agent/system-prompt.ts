import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SearchCandidate } from "@3dvista-assistant/catalog-engine";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

let cachedPromptTemplate: string | null = null;

function loadPromptTemplate(): string {
  if (cachedPromptTemplate) return cachedPromptTemplate;
  const promptPath = path.join(ROOT, "clients", config.TOUR_ID, "prompt.md");
  cachedPromptTemplate = readFileSync(promptPath, "utf8");
  return cachedPromptTemplate;
}

/**
 * Builds the system prompt: the tour's prompt.md (persona + hard rules) plus
 * a compact, clearly-delimited JSON summary of the current search
 * candidates (id/name/category/section only — never coordinates). The
 * candidate list is presented as untrusted data, not instructions.
 */
export function buildSystemPrompt(candidates: SearchCandidate[]): string {
  const template = loadPromptTemplate();
  const candidateSummary = candidates.map((c) => ({
    product_id: c.product.product_id,
    name: c.product.name,
    category: c.product.category,
    section: c.product.section,
  }));

  return (
    `${template}\n\n` +
    "```json\n" +
    JSON.stringify(candidateSummary, null, 2) +
    "\n```\n"
  );
}
