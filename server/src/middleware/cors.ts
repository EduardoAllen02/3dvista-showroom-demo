import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";

/**
 * This backend serves exactly one tour, so CORS is a single fixed allowlist
 * entry (config.ALLOWED_ORIGIN) rather than a per-tour lookup map.
 */
export async function registerCors(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || origin === config.ALLOWED_ORIGIN) {
        cb(null, true);
        return;
      }
      cb(new Error(`Origin no permitido: ${origin}`), false);
    },
  });
}
