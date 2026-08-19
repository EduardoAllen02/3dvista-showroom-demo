import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

interface TourScopedBody {
  tour_id?: string;
}

/**
 * Validates the request's declared tour_id against the single tour this
 * backend instance serves. Kept as an explicit check (not just implicit
 * trust) so the "one backend per tour" isolation property is structurally
 * verified per-request, not just true by folder convention.
 */
export async function requireMatchingTour(
  request: FastifyRequest<{ Body: TourScopedBody }>,
  reply: FastifyReply
): Promise<void> {
  const tourId = request.body?.tour_id;
  if (!tourId || tourId !== config.TOUR_ID) {
    reply.code(403).send({ error: `tour_id inválido para este backend (esperado: ${config.TOUR_ID}).` });
  }
}
