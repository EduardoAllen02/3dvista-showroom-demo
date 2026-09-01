import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireMatchingTour } from "../middleware/tour-auth.js";
import { runTool } from "../agent/tools.js";

const AlternativesRequestSchema = z.object({
  tour_id: z.string(),
  session_id: z.string(),
  product_id: z.string().min(1),
});

/**
 * Deterministic counterpart to "Llévame" (which already never touches the
 * model — it just plays back coordinates the backend already resolved).
 * "Ver alternativas" used to round-trip through the LLM by sending a fake
 * chat message ("¿Tienes alternativas a X?"), which meant its reliability
 * depended on the model choosing to call get_alternatives correctly. Since
 * the button already knows the exact product_id it was clicked from, there
 * is nothing for the model to decide here — this endpoint runs the same
 * get_alternatives tool logic directly, no OpenAI call, no tokens spent.
 */
export function registerAlternativesRoute(app: FastifyInstance): void {
  app.post("/alternatives", { preHandler: requireMatchingTour }, async (request, reply) => {
    const parsed = AlternativesRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Cuerpo de solicitud inválido.", issues: parsed.error.issues });
    }

    const toolResult = runTool("get_alternatives", { product_id: parsed.data.product_id });
    if (!toolResult.valid) {
      return reply.code(404).send({ error: "Producto no encontrado o no activo." });
    }

    return reply.send({ cards: toolResult.cards });
  });
}
