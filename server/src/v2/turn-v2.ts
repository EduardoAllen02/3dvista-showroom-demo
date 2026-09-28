/**
 * v2 assistant (ASSISTANT_ENGINE=v2): sourced catalog + ontology + query engine + LLM turn pipeline
 * (packages/assistant-engine). Built once per process from clients/<tour>/catalog.v2.json and the
 * client's vocabulary edits (ontology.overrides.json). The v1 orchestrator stays untouched.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FURNITURE_PACK, Lexicon, MemoryStateStore, TurnGateway, applyOverrides, resolveProfile,
  type AssistantProfile, type CanonicalCatalog, type PackOverrides, type TurnResult,
} from "@3dvista-assistant/assistant-engine";
import { createOpenAiJsonClient } from "@3dvista-assistant/model-adapters";
import { config } from "../config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const TRACE_LOG = path.resolve(__dirname, "../../data/v2-turns.jsonl");

/** Where the visitor is looking, as the widget reads it from the tour (never shown to the LLM). */
export interface ViewerInput { media_name: string | null; yaw?: number; pitch?: number; hfov?: number }

let gateway: TurnGateway | null = null;
let catalog: CanonicalCatalog | null = null;

function load(): TurnGateway {
  if (gateway) return gateway;
  const dir = path.join(ROOT, "clients", config.TOUR_ID);
  catalog = JSON.parse(readFileSync(path.join(dir, "catalog.v2.json"), "utf8")) as CanonicalCatalog;
  const overridesPath = path.join(dir, "ontology.overrides.json");
  const overrides = existsSync(overridesPath) ? (JSON.parse(readFileSync(overridesPath, "utf8")) as PackOverrides) : null;
  const profilePath = path.join(dir, "assistant.json");
  const profile = resolveProfile(existsSync(profilePath) ? (JSON.parse(readFileSync(profilePath, "utf8")) as Partial<AssistantProfile>) : null);
  const llm = config.OPENAI_API_KEY ? createOpenAiJsonClient(config.OPENAI_API_KEY, config.MODEL_ID) : null;
  gateway = new TurnGateway(catalog, new Lexicon(applyOverrides(FURNITURE_PACK, overrides)), llm, new MemoryStateStore(), profile);
  return gateway;
}

const angle = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

/** Pieces framed in the current panorama and view: the closest one to the centre is "this one". */
function viewerContext(v: ViewerInput | undefined): { media_name: string | null; centered: string | null; visible: string[] } | undefined {
  if (!v?.media_name || !catalog) return undefined;
  const here = catalog.viewpoints.filter((p) => p.media_name === v.media_name);
  if (v.yaw == null || v.hfov == null) return { media_name: v.media_name, centered: null, visible: here.map((p) => p.exhibit_id) };
  const inView = here
    .map((p) => ({ id: p.exhibit_id, d: Math.hypot(angle(p.yaw, v.yaw!), (p.pitch - (v.pitch ?? 0)) / 2) }))
    .filter((p) => p.d <= v.hfov! / 2)
    .sort((a, b) => a.d - b.d);
  const centered = inView[0] && inView[0].d <= Math.min(25, v.hfov / 3) ? inView[0].id : null;
  return { media_name: v.media_name, centered, visible: inView.map((p) => p.id) };
}

export async function handleTurnV2(input: {
  session_id: string;
  message: string;
  history: { role: "user" | "assistant"; text: string }[];
  wishlist: string[];
  viewer?: ViewerInput;
  clicked?: { exhibit_id: string; action: "alternatives" | "take_me" | "sheet" };
}): Promise<{ result: TurnResult; latencyMs: number }> {
  const gw = load();
  const t0 = Date.now();
  const result = await gw.turn({
    session_id: input.session_id,
    message: input.message,
    history: input.history,
    wishlist: input.wishlist,
    viewer: viewerContext(input.viewer),
    clicked: input.clicked,
  });
  const latencyMs = Date.now() - t0;
  try {
    mkdirSync(path.dirname(TRACE_LOG), { recursive: true });
    appendFileSync(TRACE_LOG, JSON.stringify({
      at: new Date().toISOString(), session_id: input.session_id, message: input.message, viewer: input.viewer ?? null, clicked: input.clicked ?? null,
      reply: result.reply, cards: result.cards.map((c) => `${c.product_id} · ${c.availability} · ${c.group_title}`),
      navigate: result.navigate?.media_name ?? null, trace: result.trace, latency_ms: latencyMs,
    }) + "\n");
  } catch { /* the trace log is a debugging aid, never a reason to fail the turn */ }
  return { result, latencyMs };
}
