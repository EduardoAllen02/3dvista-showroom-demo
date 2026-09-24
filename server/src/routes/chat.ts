import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config } from "../config.js";
import { handleChat } from "../agent/orchestrator.js";
import { handleChatViaClaudeCode } from "../agent/claude-code-orchestrator.js";
import { requireMatchingTour } from "../middleware/tour-auth.js";
import { logUsage } from "../logging/usage-logger.js";
import { computeCostUsd } from "../logging/model-pricing.js";

const ChatRequestSchema = z.object({
  tour_id: z.string(),
  session_id: z.string(),
  message: z.string().min(1).max(1000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        text: z.string(),
        product_ids: z.array(z.string()).optional(),
      })
    )
    .max(20)
    .default([]),
  wishlist_product_ids: z.array(z.string()).max(50).default([]),
});

export function registerChatRoute(app: FastifyInstance): void {
  app.post("/chat", { preHandler: requireMatchingTour }, async (request, reply) => {
    const parsed = ChatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Cuerpo de solicitud inválido.", issues: parsed.error.issues });
    }

    const { session_id, message, history, wishlist_product_ids } = parsed.data;

    try {
      const result =
        config.MODEL_PROVIDER === "claude-code"
          ? await handleChatViaClaudeCode(message, history, wishlist_product_ids)
          : await handleChat(message, history, wishlist_product_ids);

      const reportedCostUsd =
        config.MODEL_PROVIDER === "claude-code"
          ? (result.claudeCodeCostUsd ?? 0)
          : computeCostUsd(config.MODEL_ID, result.usage);

      logUsage({
        tour_id: config.TOUR_ID,
        session_id,
        model: config.MODEL_ID,
        provider: config.MODEL_PROVIDER,
        input_tokens: result.usage.input_tokens,
        cached_input_tokens: result.usage.cached_input_tokens,
        reasoning_tokens: result.usage.reasoning_tokens,
        output_tokens: result.usage.output_tokens,
        reported_cost_usd: reportedCostUsd,
        latency_ms: result.latencyMs,
        tool_call_valid: result.toolCallValid,
        navigation_correct: null,
      });

      return reply.send({
        reply: result.reply,
        product_cards: result.cards,
        navigate: result.navigate,
        usage: {
          input_tokens: result.usage.input_tokens,
          output_tokens: result.usage.output_tokens,
          latency_ms: result.latencyMs,
        },
      });
    } catch (err) {
      request.log.error(err);
      return reply.code(502).send({ error: "No se pudo obtener respuesta del modelo de IA." });
    }
  });
}
