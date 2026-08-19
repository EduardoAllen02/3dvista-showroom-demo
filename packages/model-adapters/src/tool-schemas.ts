import type { ToolSchema } from "./provider.js";

/**
 * The 4 agent tools (section 8 of the master context doc). The model only
 * ever supplies a product_id/query/filters — it never supplies coordinates.
 * navigate_to_product's *result* (computed server-side from the catalog) is
 * what carries media_name/yaw/pitch/fov, never the model's arguments.
 */
export const TOOL_SCHEMAS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description:
        "Busca productos en el catálogo del showroom por texto libre y filtros opcionales. Devuelve entre 3 y 8 candidatos, nunca el catálogo completo.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Texto de búsqueda en español, tal como lo escribió el usuario." },
          category: { type: "string" },
          color: { type: "string" },
          material: { type: "string" },
          section: { type: "string" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_product",
      description:
        "Obtiene la ficha completa de un producto por su product_id exacto (descripción, imagen, sección). OBLIGATORIO llamarla antes de describir cualquier producto específico al usuario — los candidatos de búsqueda solo traen id/nombre/categoría/sección, nunca la descripción, así que sin esta llamada no conoces los detalles reales del producto.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_alternatives",
      description: "Obtiene productos alternativos al indicado, del mismo grupo de alternativas.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
        },
        required: ["product_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "navigate_to_product",
      description:
        "Resuelve la navegación de cámara hacia un producto por su product_id. NUNCA inventes ni pases coordenadas directamente — esta función siempre las obtiene del catálogo validado del servidor.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
        },
        required: ["product_id"],
      },
    },
  },
];
