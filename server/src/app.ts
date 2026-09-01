import Fastify, { type FastifyInstance } from "fastify";
import { registerCors } from "./middleware/cors.js";
import { registerChatRoute } from "./routes/chat.js";
import { registerAlternativesRoute } from "./routes/alternatives.js";
import { registerRecommendationsRoute } from "./routes/recommendations.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await registerCors(app);
  registerChatRoute(app);
  registerAlternativesRoute(app);
  registerRecommendationsRoute(app);

  app.get("/health", async () => ({ ok: true }));

  return app;
}
