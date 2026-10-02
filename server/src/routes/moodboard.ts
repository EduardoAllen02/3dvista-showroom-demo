import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { computeStyleProfile } from "@3dvista-assistant/catalog-engine";
import {
  FileMoodboardStore,
  MoodboardError,
  MoodboardService,
  isAssetFileName,
  isMoodboardKey,
  type StoredAnalysis,
  type StoredTexture,
  type UsageEntry,
} from "@3dvista-assistant/moodboard-engine";
import { config } from "../config.js";
import { findProductById, loadCatalog } from "../catalog/catalog-loader.js";
import { requireMatchingTour } from "../middleware/tour-auth.js";
import { loadMoodboardConfig } from "../moodboard/config.js";
import { GenerationLimiter } from "../moodboard/limiter.js";
import { createProductImageLoader, hasRealPhoto } from "../moodboard/product-images.js";

const SessionFields = {
  tour_id: z.string(),
  session_id: z.string().min(1).max(200),
};

const PlanRequestSchema = z.object({
  ...SessionFields,
  product_ids: z.array(z.string().min(1).max(64)).min(1).max(50),
  locale: z.enum(["it", "es", "en"]).default("it"),
});

const StageRequestSchema = z.object({
  ...SessionFields,
  key: z.string().refine(isMoodboardKey, "invalid key"),
});

const STATUS: Record<MoodboardError["code"], number> = {
  not_found: 404,
  not_ready: 409,
  rate_limited: 429,
  generation_failed: 502,
};

// Wire shapes, mirrored by packages/moodboard-ui/src/types.ts: keep both in
// step. The browser never sees prompts, difficulty, models or costs.

function toAnchor(productId: string) {
  const p = findProductById(productId);
  if (!p) return null;
  return {
    product_id: p.product_id,
    name: p.name,
    image_url: p.image_url,
    photo: hasRealPhoto(p.image_url),
    navTarget: { media_name: p.media_name, yaw: p.yaw, pitch: p.pitch, fov: p.fov, hotspot_name: p.hotspot_name },
  };
}

function toPublicAnalysis(stored: StoredAnalysis) {
  const { motto, description, palette, materials } = stored.analysis;
  return {
    motto,
    description,
    palette: palette.map((c) => ({ hex: c.hex, name: c.name })),
    materials: materials.map((m) => ({ name: m.name, description: m.description })),
  };
}

function toPublicTextures(key: string, textures: StoredTexture[]) {
  return textures.map((t) => ({
    index: t.index,
    material: t.material,
    url: t.file ? `/moodboard/assets/${key}/${t.file}` : null,
  }));
}

/**
 * The wishlist's moodboard. Separate from the chatbot on purpose: no agent,
 * no prompt.md, no chat state. Its only link to the rest of the backend is
 * the catalog and the wishlist's own style statistic (the exact call
 * /recommendations makes), so the style it shows is always the one the
 * wishlist panel shows.
 *
 *   POST /moodboard                     plan: style + 1-2 anchor products + whatever is cached. Free.
 *   POST /moodboard/analysis            IA #1 for that plan (cached; capped by GenerationLimiter).
 *   POST /moodboard/textures            IA #2 for that plan (cached; only repaints failed textures).
 *   GET  /moodboard/assets/:key/:file   the generated texture images.
 *
 * The stage calls take a server-issued key, never products or prompts: the
 * browser can only ask for moodboards the catalog itself produced.
 */
export function registerMoodboardRoutes(app: FastifyInstance): void {
  const mb = loadMoodboardConfig();
  if (!mb.enabled) {
    app.log.warn(`Moodboard desactivado: ${mb.disabledReason}`);
    // Still answers, so a widget built with the feature on shows its
    // "unavailable" state instead of failing on a 404.
    app.post("/moodboard", { preHandler: requireMatchingTour }, async (_request, reply) =>
      reply.code(503).send({ error: "moodboard_disabled" })
    );
    return;
  }

  const logUsage = (entry: UsageEntry): void => {
    const line = JSON.stringify({ ts: new Date().toISOString(), tour_id: config.TOUR_ID, ...entry }) + "\n";
    mkdir(path.dirname(mb.usageLogPath), { recursive: true })
      .then(() => appendFile(mb.usageLogPath, line, "utf8"))
      .catch((err) => app.log.warn({ err }, "moodboard usage log"));
  };

  const service = new MoodboardService({
    store: new FileMoodboardStore(mb.cacheDir),
    openai: { apiKey: mb.openaiApiKey },
    brand: mb.brand,
    analysisModel: mb.analysisModel,
    analysisReasoningEffort: mb.analysisReasoningEffort,
    textureRoute: mb.textureRoute,
    loadImage: createProductImageLoader(config.TOUR_ID),
    onUsage: logUsage,
  });
  const limiter = new GenerationLimiter(mb.sessionHourlyLimit, mb.dailyLimit);

  function fail(request: FastifyRequest, reply: FastifyReply, err: unknown) {
    if (err instanceof MoodboardError) {
      if (err.code !== "rate_limited") request.log.error({ err }, "moodboard");
      return reply.code(STATUS[err.code]).send({ error: err.code });
    }
    request.log.error({ err }, "moodboard");
    return reply.code(500).send({ error: "internal" });
  }

  app.post("/moodboard", { preHandler: requireMatchingTour }, async (request, reply) => {
    const parsed = PlanRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const { product_ids, locale } = parsed.data;
    try {
      const catalog = loadCatalog();
      const { dominantStyle } = computeStyleProfile(product_ids, catalog);
      const plan = await service.plan({
        tourId: config.TOUR_ID,
        locale,
        style: dominantStyle,
        savedIds: product_ids,
        catalog: catalog.map((p) => ({ ...p, has_photo: hasRealPhoto(p.image_url) })),
      });
      if (!plan) return reply.send({ available: false, reason: "no_style" });
      const [analysis, textures] = await Promise.all([service.readAnalysis(plan.key), service.readTextures(plan.key)]);
      return reply.send({
        available: true,
        key: plan.key,
        style: plan.style,
        anchors: plan.anchors.map((a) => toAnchor(a.product_id)).filter((a) => a !== null),
        analysis: analysis ? toPublicAnalysis(analysis) : null,
        textures: analysis && textures ? toPublicTextures(plan.key, textures) : null,
      });
    } catch (err) {
      return fail(request, reply, err);
    }
  });

  app.post("/moodboard/analysis", { preHandler: requireMatchingTour }, async (request, reply) => {
    const parsed = StageRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    try {
      const analysis = await service.ensureAnalysis(parsed.data.key, limiter.guard(parsed.data.session_id));
      return reply.send({ analysis: toPublicAnalysis(analysis) });
    } catch (err) {
      return fail(request, reply, err);
    }
  });

  app.post("/moodboard/textures", { preHandler: requireMatchingTour }, async (request, reply) => {
    const parsed = StageRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    try {
      const textures = await service.ensureTextures(parsed.data.key, limiter.guard(parsed.data.session_id));
      for (const t of textures) {
        if (t.error) request.log.warn({ key: parsed.data.key, index: t.index, error: t.error }, "moodboard texture failed");
      }
      return reply.send({ textures: toPublicTextures(parsed.data.key, textures) });
    } catch (err) {
      return fail(request, reply, err);
    }
  });

  app.get<{ Params: { key: string; file: string } }>("/moodboard/assets/:key/:file", async (request, reply) => {
    const { key, file } = request.params;
    if (!isMoodboardKey(key) || !isAssetFileName(file)) return reply.code(404).send();
    const bytes = await service.readAsset(key, file);
    if (!bytes) return reply.code(404).send();
    // A texture file is written once and never replaced (only missing ones
    // are ever painted), so it can be cached forever.
    return reply
      .header("Content-Type", "image/webp")
      .header("Cache-Control", "public, max-age=31536000, immutable")
      .send(bytes);
  });
}
