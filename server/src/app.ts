import Fastify, { type FastifyInstance } from "fastify";
import { config } from "./config.js";
import { registerCors } from "./middleware/cors.js";
import { registerChatRoute } from "./routes/chat.js";
import { registerAlternativesRoute } from "./routes/alternatives.js";
import { registerRecommendationsRoute } from "./routes/recommendations.js";
import { registerMoodboardRoutes } from "./routes/moodboard.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await registerCors(app);
  registerChatRoute(app);
  registerAlternativesRoute(app);
  registerRecommendationsRoute(app);
  registerMoodboardRoutes(app);

  app.get("/health", async () => ({ ok: true, engine: config.ASSISTANT_ENGINE }));

  return app;
}
