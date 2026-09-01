import type { ToolSchema } from "./provider.js";

/**
 * The agent tools (section 8 of the master context doc). The model only
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
        "Busca productos en el catálogo del showroom por texto libre y filtros opcionales. Devuelve hasta 8 candidatos reales bajo `candidates`. Si encuentra menos de 2, además incluye `low_confidence: true` y un `full_catalog` de respaldo con todo el catálogo activo (con descripciones) para que puedas identificar por significado qué pidió el usuario — sigue confirmando siempre con get_product/get_alternatives antes de describir cualquier producto de ahí.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Texto de búsqueda en español, tal como lo escribió el usuario." },
          category: { type: "string" },
          color: { type: "string" },
          material: { type: "string" },
          shape: {
            type: "string",
            description:
              "Forma/silueta física si el usuario la menciona (p. ej. 'redondo', 'modular', 'rectangular', 'en L', 'compacto') — solo cuando la pidió explícitamente, no la inventes.",
          },
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
      name: "get_recommendations",
      description:
        "Sugiere productos según el estilo dominante de la wishlist (colección guardada) del visitante — nunca se usa sin que exista una wishlist. Los ids exactos de la wishlist actual, si existen, aparecen en este mismo mensaje de sistema; pásalos tal cual en product_ids. El resultado ya viene filtrado y puntuado por el sistema (estilo, compatibilidad, materiales) — no elijas ni inventes tú los productos, solo narra lo que esta herramienta devuelva.",
      parameters: {
        type: "object",
        properties: {
          product_ids: {
            type: "array",
            items: { type: "string" },
            description: "product_id de cada artículo guardado en la wishlist del visitante.",
          },
        },
        required: ["product_ids"],
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
