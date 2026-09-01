import type { ChatResponseBody, HotspotManifestEntry, ProductCard } from "./types.js";

/**
 * Fetched once per page load (module-level cache) — it's static build
 * output, not per-visitor state, so there's no reason to refetch it.
 */
let manifestPromise: Promise<HotspotManifestEntry[]> | null = null;

export function loadCatalogManifest(assetsBaseUrl: string): Promise<HotspotManifestEntry[]> {
  if (!manifestPromise) {
    manifestPromise = fetch(`${assetsBaseUrl}/catalog-manifest.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`catalog-manifest.json fetch failed: ${res.status}`);
        return res.json() as Promise<HotspotManifestEntry[]>;
      })
      .catch((err) => {
        manifestPromise = null; // allow a later retry instead of caching a permanent failure
        throw err;
      });
  }
  return manifestPromise;
}

export interface ApiClientConfig {
  apiBaseUrl: string;
  tourId: string;
  sessionId: string;
}

/**
 * Thin fetch wrapper to the tour's own backend deployment (one backend per
 * tour — see README). Never talks to any AI provider directly from the
 * browser; the API key lives only server-side.
 */
export function createApiClient(config: ApiClientConfig) {
  return {
    async sendMessage(
      message: string,
      history: { role: string; text: string; product_ids?: string[] }[],
      wishlistProductIds: string[] = []
    ): Promise<ChatResponseBody> {
      const res = await fetch(`${config.apiBaseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tour_id: config.tourId,
          session_id: config.sessionId,
          message,
          history,
          wishlist_product_ids: wishlistProductIds,
        }),
      });
      if (!res.ok) {
        throw new Error(`Chat request failed: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as ChatResponseBody;
    },

    /**
     * Deterministic "Ver alternativas" — no AI model involved, so it never
     * fails the way a chat completion can, and costs no tokens.
     */
    async getAlternatives(productId: string): Promise<ProductCard[]> {
      const res = await fetch(`${config.apiBaseUrl}/alternatives`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tour_id: config.tourId,
          session_id: config.sessionId,
          product_id: productId,
        }),
      });
      if (!res.ok) {
        throw new Error(`Alternatives request failed: ${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as { cards: ProductCard[] };
      return body.cards;
    },

    /**
     * Deterministic wishlist recommendations — also no AI model involved
     * (see server's recommendations.ts route). Called whenever the saved
     * collection changes, so it should stay cheap enough to call often.
     */
    async getRecommendations(productIds: string[]): Promise<{ dominantStyle: string | null; cards: ProductCard[] }> {
      const res = await fetch(`${config.apiBaseUrl}/recommendations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tour_id: config.tourId,
          session_id: config.sessionId,
          product_ids: productIds,
        }),
      });
      if (!res.ok) {
        throw new Error(`Recommendations request failed: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as { dominantStyle: string | null; cards: ProductCard[] };
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
