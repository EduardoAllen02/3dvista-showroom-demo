import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMatchingTour } from "../middleware/tour-auth.js";
import { runTool } from "../agent/tools.js";

const RecommendationsRequestSchema = z.object({
  tour_id: z.string(),
  session_id: z.string(),
  product_ids: z.array(z.string()).min(1).max(50),
});

/**
 * Deterministic counterpart to /alternatives — the wishlist panel calls this
 * directly whenever the visitor's saved collection changes, to refresh the
 * "your style" label and the suggested-products row. No LLM call: it's the
 * same get_recommendations tool logic (pure stats over the catalog's `style`/
 * `compatible_with` fields — see catalog-engine's recommendations.ts) the
 * chat agent uses when a visitor asks in free text, just invoked directly
 * instead of waiting for the model to decide to call it.
 */
export function registerRecommendationsRoute(app: FastifyInstance): void {
  app.post("/recommendations", { preHandler: requireMatchingTour }, async (request, reply) => {
    const parsed = RecommendationsRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Cuerpo de solicitud inválido.", issues: parsed.error.issues });
    }

    const toolResult = runTool("get_recommendations", { product_ids: parsed.data.product_ids });
    if (!toolResult.valid) {
      return reply.code(400).send({ error: "No se pudieron calcular recomendaciones." });
    }

    const output = toolResult.output as { dominant_style: string | null };
    return reply.send({ dominantStyle: output.dominant_style, cards: toolResult.cards });
  });
}
