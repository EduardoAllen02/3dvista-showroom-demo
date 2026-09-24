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
          finish: {
            type: "string",
            description:
              "Acabado/línea de tela con nombre propio de Febal Casa (p. ej. 'Velvet', 'Boston', 'Rimini') si el usuario lo menciona — solo cuando lo pidió explícitamente, no lo inventes. Distinto de color: 'velvet' suele ser un acabado, no un color.",
          },
          style: {
            type: "string",
            description:
              "Estilo decorativo si el usuario lo menciona (p. ej. 'elegante', 'minimal', 'clásico') — solo cuando lo pidió explícitamente, no lo inventes.",
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
          preferred_attribute: {
            type: "string",
            enum: ["shape", "color", "style", "finish"],
            description:
              "Qué característica pidió el visitante al buscar alternativas (p. ej. preguntó por otro COLOR, aunque cambie la forma). Solo inclúyelo cuando el visitante mencionó explícitamente esa característica al pedir alternativas — si no dijo nada específico, omite el campo.",
          },
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
      name: "get_product_variant",
      description:
        "Resuelve si un producto YA propuesto existe en un acabado/color/forma distinto que el visitante pida (p. ej. '¿lo tienes en velvet?', '¿viene en verde?'). Úsala SOLO sobre un product_id que tú mismo ya propusiste en este turno o el anterior — nunca busques de nuevo con search_catalog para esto. Devuelve el producto real que coincide (si existe) o, si no, los acabados/colores/formas reales de los diseños hermanos para que ofrezcas alternativas honestas.",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          requested_value: {
            type: "string",
            description: "El acabado, color o forma exactos que pidió el visitante, tal como los escribió.",
          },
        },
        required: ["product_id", "requested_value"],
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
