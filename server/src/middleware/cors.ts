import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";

/**
 * This backend serves exactly one tour, so CORS is a fixed allowlist
 * (config.ALLOWED_ORIGIN) rather than a per-tour lookup map. Several origins
 * are comma-separated: the same tour served locally and from a test site.
 */
export async function registerCors(app: FastifyInstance): Promise<void> {
  const allowed = new Set(config.ALLOWED_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean));
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || allowed.has(origin)) {
        cb(null, true);
        return;
      }
      cb(new Error(`Origin no permitido: ${origin}`), false);
    },
  });
}
