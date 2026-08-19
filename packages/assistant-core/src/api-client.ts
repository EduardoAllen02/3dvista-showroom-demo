import type { ChatResponseBody } from "./types.js";

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
    async sendMessage(message: string, history: { role: string; text: string }[]): Promise<ChatResponseBody> {
      const res = await fetch(`${config.apiBaseUrl}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tour_id: config.tourId,
          session_id: config.sessionId,
          message,
          history,
        }),
      });
      if (!res.ok) {
        throw new Error(`Chat request failed: ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as ChatResponseBody;
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
