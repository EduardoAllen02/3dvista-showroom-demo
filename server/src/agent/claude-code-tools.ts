import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod4";
import { runTool, type ProductCardPayload } from "./tools.js";
import type { NavTarget } from "@3dvista-assistant/catalog-engine";

/**
 * Mutable, per-request accumulator the 5 tool handlers below write into as
 * a side effect. The Agent SDK's query() loop calls these handlers directly
 * (unlike the OpenAI/Anthropic-API path, where the orchestrator itself gets
 * tool_calls back and runs runTool() externally) — there is no return
 * channel from inside query() back to the caller for anything beyond the
 * tool's own `content`, so cards/navigate have to be captured this way
 * instead. One fresh accumulator per handleChatViaClaudeCode() call — never
 * shared across requests.
 */
export interface ClaudeCodeToolAccumulator {
  cards: ProductCardPayload[];
  navigate: NavTarget | null;
  toolCallValid: boolean;
  /** Mirrors orchestrator.ts's proposalMade — see pushProposalCards below. */
  proposalMade: boolean;
}

function toToolResultContent(output: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(output) }] };
}

/**
 * At most ONE proposal-type tool call (get_product/get_alternatives/
 * get_recommendations) contributes cards per user turn — same rule
 * orchestrator.ts enforces structurally for the OpenAI/Anthropic-API path
 * (see its doc comment: a live test showed the model sometimes calling
 * get_product for the top pick AND get_alternatives right after, dumping
 * every candidate as a full card in one message). Without this here too,
 * the Claude Agent SDK path would get MORE cards per turn than the other
 * two providers purely from a code asymmetry, not a real model difference —
 * confirmed live: Sonnet 5 returned 6 cards in one turn before this fix.
 */
function pushProposalCards(acc: ClaudeCodeToolAccumulator, cards: ProductCardPayload[]): void {
  if (acc.proposalMade) return;
  acc.cards.push(...cards);
  if (cards.length > 0) acc.proposalMade = true;
}

/**
 * Builds a fresh MCP server exposing exactly the same 5 tools as
 * tool-schemas.ts's TOOL_SCHEMAS (search_catalog/get_product/
 * get_alternatives/get_recommendations/navigate_to_product), delegating to
 * the SAME runTool() the OpenAI/Anthropic-API orchestrator uses — this is
 * what makes the Fase 2 comparison fair: identical catalog, identical tool
 * behavior, only the model/harness differs. Schemas are hand-written in
 * zod (v4, aliased as "zod4" — see package.json's comment on why this
 * differs from the rest of the server's zod v3) to mirror TOOL_SCHEMAS'
 * JSON Schema definitions field-for-field.
 */
export function createChatbotToolServer(acc: ClaudeCodeToolAccumulator) {
  const searchCatalog = tool(
    "search_catalog",
    "Busca productos en el catálogo del showroom por texto libre y filtros opcionales. Devuelve hasta 8 candidatos reales bajo `candidates`. Si encuentra menos de 2, además incluye `low_confidence: true` y un `full_catalog` de respaldo con todo el catálogo activo (con descripciones) para que puedas identificar por significado qué pidió el usuario — sigue confirmando siempre con get_product/get_alternatives antes de describir cualquier producto de ahí.",
    {
      query: z.string().describe("Texto de búsqueda en español, tal como lo escribió el usuario."),
      category: z.string().optional(),
      color: z.string().optional(),
      material: z.string().optional(),
      shape: z
        .string()
        .optional()
        .describe(
          "Forma/silueta física si el usuario la menciona (p. ej. 'redondo', 'modular', 'rectangular', 'en L', 'compacto') — solo cuando la pidió explícitamente, no la inventes."
        ),
      finish: z
        .string()
        .optional()
        .describe(
          "Acabado/línea de tela con nombre propio de Febal Casa (p. ej. 'Velvet', 'Boston', 'Rimini') si el usuario lo menciona — solo cuando lo pidió explícitamente, no lo inventes. Distinto de color: 'velvet' suele ser un acabado, no un color."
        ),
      style: z
        .string()
        .optional()
        .describe("Estilo decorativo si el usuario lo menciona (p. ej. 'elegante', 'minimal', 'clásico') — solo cuando lo pidió explícitamente, no lo inventes."),
      section: z.string().optional(),
    },
    async (args) => {
      const result = runTool("search_catalog", args);
      if (!result.valid) acc.toolCallValid = false;
      return toToolResultContent(result.output);
    },
    { annotations: { readOnlyHint: true } }
  );

  const getProduct = tool(
    "get_product",
    "Obtiene la ficha completa de un producto por su product_id exacto (descripción, imagen, sección). OBLIGATORIO llamarla antes de describir cualquier producto específico al usuario — los candidatos de búsqueda solo traen id/nombre/categoría/sección, nunca la descripción, así que sin esta llamada no conoces los detalles reales del producto.",
    { product_id: z.string() },
    async (args) => {
      const result = runTool("get_product", args);
      if (!result.valid) acc.toolCallValid = false;
      pushProposalCards(acc, result.cards);
      return toToolResultContent(result.output);
    },
    { annotations: { readOnlyHint: true } }
  );

  const getAlternatives = tool(
    "get_alternatives",
    "Obtiene productos alternativos al indicado, del mismo grupo de alternativas.",
    {
      product_id: z.string(),
      preferred_attribute: z
        .enum(["shape", "color", "style", "finish"])
        .optional()
        .describe(
          "Qué característica pidió el visitante al buscar alternativas (p. ej. preguntó por otro COLOR, aunque cambie la forma). Solo inclúyelo cuando el visitante mencionó explícitamente esa característica al pedir alternativas — si no dijo nada específico, omite el campo."
        ),
    },
    async (args) => {
      const result = runTool("get_alternatives", args);
      if (!result.valid) acc.toolCallValid = false;
      pushProposalCards(acc, result.cards);
      return toToolResultContent(result.output);
    },
    { annotations: { readOnlyHint: true } }
  );

  const getRecommendations = tool(
    "get_recommendations",
    "Sugiere productos según el estilo dominante de la wishlist (colección guardada) del visitante — nunca se usa sin que exista una wishlist. Los ids exactos de la wishlist actual, si existen, aparecen en el mensaje de sistema; pásalos tal cual en product_ids. El resultado ya viene filtrado y puntuado por el sistema (estilo, compatibilidad, materiales) — no elijas ni inventes tú los productos, solo narra lo que esta herramienta devuelva.",
    {
      product_ids: z
        .array(z.string())
        .describe("product_id de cada artículo guardado en la wishlist del visitante."),
    },
    async (args) => {
      const result = runTool("get_recommendations", args);
      if (!result.valid) acc.toolCallValid = false;
      pushProposalCards(acc, result.cards);
      return toToolResultContent(result.output);
    },
    { annotations: { readOnlyHint: true } }
  );

  const getProductVariant = tool(
    "get_product_variant",
    "Resuelve si un producto YA propuesto existe en un acabado/color/forma distinto que el visitante pida (p. ej. '¿lo tienes en velvet?', '¿viene en verde?'). Úsala SOLO sobre un product_id que tú mismo ya propusiste en este turno o el anterior — nunca busques de nuevo con search_catalog para esto. Devuelve el producto real que coincide (si existe) o, si no, los acabados/colores/formas reales de los diseños hermanos para que ofrezcas alternativas honestas.",
    {
      product_id: z.string(),
      requested_value: z.string().describe("El acabado, color o forma exactos que pidió el visitante, tal como los escribió."),
    },
    async (args) => {
      const result = runTool("get_product_variant", args);
      if (!result.valid) acc.toolCallValid = false;
      pushProposalCards(acc, result.cards);
      return toToolResultContent(result.output);
    },
    { annotations: { readOnlyHint: true } }
  );

  const navigateToProduct = tool(
    "navigate_to_product",
    "Resuelve la navegación de cámara hacia un producto por su product_id. NUNCA inventes ni pases coordenadas directamente — esta función siempre las obtiene del catálogo validado del servidor.",
    { product_id: z.string() },
    async (args) => {
      const result = runTool("navigate_to_product", args);
      if (!result.valid) acc.toolCallValid = false;
      if (result.navigate) acc.navigate = result.navigate;
      return toToolResultContent(result.output);
    }
  );

  return createSdkMcpServer({
    name: "febal-chatbot",
    version: "1.0.0",
    tools: [searchCatalog, getProduct, getAlternatives, getRecommendations, getProductVariant, navigateToProduct],
  });
}

export const CHATBOT_ALLOWED_TOOLS = [
  "mcp__febal-chatbot__search_catalog",
  "mcp__febal-chatbot__get_product",
  "mcp__febal-chatbot__get_alternatives",
  "mcp__febal-chatbot__get_recommendations",
  "mcp__febal-chatbot__get_product_variant",
  "mcp__febal-chatbot__navigate_to_product",
];
