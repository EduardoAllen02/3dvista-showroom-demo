import { runAnalysis, type AnalysisAnchor } from "./analysis.js";
import { CONTENT_VERSION, moodboardKey } from "./key.js";
import type { OpenAIConfig } from "./openai.js";
import { pickStyleAnchors } from "./select-anchors.js";
import { textureFileName, type MoodboardStore } from "./store.js";
import { generateTexture, type TextureRoute } from "./textures.js";
import type {
  MoodboardLocale,
  MoodboardPlan,
  MoodboardProduct,
  StoredAnalysis,
  StoredTexture,
  UsageEntry,
} from "./types.js";

export type MoodboardErrorCode = "not_found" | "not_ready" | "rate_limited" | "generation_failed";

export class MoodboardError extends Error {
  constructor(
    readonly code: MoodboardErrorCode,
    message: string
  ) {
    super(message);
    this.name = "MoodboardError";
  }
}

/**
 * Called right before a paid generation, never on a cache hit. Throw a
 * MoodboardError("rate_limited") to refuse it.
 */
export type GenerationGuard = () => void;

export interface MoodboardServiceOptions {
  store: MoodboardStore;
  openai: OpenAIConfig;
  /** Brand the art-director prompt speaks for, e.g. "Febal Casa". */
  brand: string;
  analysisModel: string;
  analysisReasoningEffort?: string;
  textureRoute: TextureRoute;
  /** Reads a product's catalog photo as a data URL; null when it isn't available. */
  loadImage: (product: MoodboardProduct) => Promise<string | null>;
  onUsage?: (entry: UsageEntry) => void;
}

export interface PlanInput {
  tourId: string;
  locale: MoodboardLocale;
  /** The wishlist's dominant style, exactly as the wishlist computed it. Null: nothing to build from. */
  style: string | null;
  savedIds: readonly string[];
  catalog: readonly MoodboardProduct[];
}

/**
 * The moodboard pipeline in three stages, each cached by the moodboard key:
 *   plan      free, deterministic: style + anchors -> key
 *   analysis  IA #1, ~10 s: motto, description, palette, materials
 *   textures  IA #2, ~10 s in parallel: one image per material
 * Concurrent requests for the same key share one generation instead of
 * paying twice.
 */
export class MoodboardService {
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(private readonly options: MoodboardServiceOptions) {}

  async plan(input: PlanInput): Promise<MoodboardPlan | null> {
    if (!input.style) return null;
    const anchors = pickStyleAnchors(input.savedIds, input.catalog, input.style);
    if (anchors.length === 0) return null;
    const key = moodboardKey({ tourId: input.tourId, locale: input.locale, style: input.style, anchors });
    const existing = await this.options.store.readPlan(key);
    // Same key means same style and same anchor data. Only the order can
    // differ, and the visitor's current order is the one to display.
    if (existing) return { ...existing, anchors };
    const plan: MoodboardPlan = {
      key,
      tourId: input.tourId,
      locale: input.locale,
      style: input.style,
      anchors,
      contentVersion: CONTENT_VERSION,
      createdAt: new Date().toISOString(),
    };
    await this.options.store.writePlan(plan);
    return plan;
  }

  readAnalysis(key: string): Promise<StoredAnalysis | null> {
    return this.options.store.readAnalysis(key);
  }

  readTextures(key: string): Promise<StoredTexture[] | null> {
    return this.options.store.readTextures(key);
  }

  readAsset(key: string, file: string): Promise<Buffer | null> {
    return this.options.store.readAsset(key, file);
  }

  async ensureAnalysis(key: string, guard?: GenerationGuard): Promise<StoredAnalysis> {
    const cached = await this.options.store.readAnalysis(key);
    if (cached) return cached;
    return this.once(`analysis:${key}`, async () => {
      const again = await this.options.store.readAnalysis(key);
      if (again) return again;
      const plan = await this.options.store.readPlan(key);
      if (!plan) throw new MoodboardError("not_found", `Unknown moodboard ${key}.`);
      guard?.();

      const anchors: AnalysisAnchor[] = await Promise.all(
        plan.anchors.map(async (product) => ({
          product,
          imageDataUrl:
            product.has_photo === false ? null : await this.options.loadImage(product).catch(() => null),
        }))
      );
      let result: StoredAnalysis;
      try {
        result = await runAnalysis(this.options.openai, {
          style: plan.style,
          brand: this.options.brand,
          locale: plan.locale,
          anchors,
          model: this.options.analysisModel,
          reasoningEffort: this.options.analysisReasoningEffort,
        });
      } catch (err) {
        throw new MoodboardError("generation_failed", err instanceof Error ? err.message : String(err));
      }
      await this.options.store.writeAnalysis(key, result);
      this.options.onUsage?.({ key, stage: "analysis", models: [result.model], costUsd: result.costUsd, ms: result.ms });
      return result;
    });
  }

  /**
   * Paints the textures the analysis asked for. Materials are independent:
   * one failure never sinks the others, and a later call only repaints the
   * ones that failed. Resolves even if every texture failed; the board then
   * falls back to plain palette swatches.
   */
  async ensureTextures(key: string, guard?: GenerationGuard): Promise<StoredTexture[]> {
    const analysis = await this.options.store.readAnalysis(key);
    if (!analysis) throw new MoodboardError("not_ready", `Moodboard ${key} has no analysis yet.`);
    const existing = await this.options.store.readTextures(key);
    if (existing && existing.every((t) => t.file)) return existing;

    return this.once(`textures:${key}`, async () => {
      const current = await this.options.store.readTextures(key);
      if (current && current.every((t) => t.file)) return current;
      // The first painting comes with the analysis the guard already counted; repainting the
      // ones that failed is a new paid generation.
      if (current) guard?.();

      const started = Date.now();
      const fresh: StoredTexture[] = [];
      const textures = await Promise.all(
        analysis.analysis.materials.map(async (material, index): Promise<StoredTexture> => {
          const done = current?.find((t) => t.index === index && t.file);
          if (done) return done;
          const choice = this.options.textureRoute[material.difficulty];
          let texture: StoredTexture;
          try {
            const image = await generateTexture(this.options.openai, material.texturePrompt, choice);
            const file = textureFileName(index);
            await this.options.store.writeAsset(key, file, image.bytes);
            texture = { index, material: material.name, file, model: image.model, costUsd: image.costUsd, ms: image.ms, error: null };
          } catch (err) {
            texture = {
              index,
              material: material.name,
              file: null,
              model: `${choice.model} (${choice.quality})`,
              costUsd: 0,
              ms: 0,
              error: err instanceof Error ? err.message : String(err),
            };
          }
          fresh.push(texture);
          return texture;
        })
      );
      await this.options.store.writeTextures(key, textures);
      this.options.onUsage?.({
        key,
        stage: "textures",
        models: [...new Set(fresh.map((t) => t.model))],
        costUsd: fresh.reduce((sum, t) => sum + t.costUsd, 0),
        ms: Date.now() - started,
      });
      return textures;
    });
  }

  private once<T>(id: string, run: () => Promise<T>): Promise<T> {
    const pending = this.inflight.get(id);
    if (pending) return pending as Promise<T>;
    const promise = run().finally(() => this.inflight.delete(id));
    this.inflight.set(id, promise);
    return promise;
  }
}
