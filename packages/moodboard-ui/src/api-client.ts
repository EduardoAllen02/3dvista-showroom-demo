import type {
  MoodboardAnalysisView,
  MoodboardLocale,
  MoodboardPlanResponse,
  MoodboardTextureView,
} from "./types.js";

export class MoodboardApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string
  ) {
    super(`Moodboard request failed: ${status} ${code}`);
    this.name = "MoodboardApiError";
  }
}

export interface MoodboardApiConfig {
  /** The tour's own backend (one per tour), no trailing slash. */
  apiBaseUrl: string;
  tourId: string;
  sessionId: string;
  /** Language of the generated texts. Defaults to Italian. */
  locale?: MoodboardLocale;
}

/**
 * Thin fetch wrapper around the backend's /moodboard routes. The browser
 * never talks to an AI provider and never chooses a model: it sends the
 * saved product ids, then asks for the stages of the key the server issued.
 */
export function createMoodboardApi(config: MoodboardApiConfig) {
  async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    let res: Response;
    try {
      res = await fetch(`${config.apiBaseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tour_id: config.tourId, session_id: config.sessionId, ...body }),
      });
    } catch {
      throw new MoodboardApiError(0, "network");
    }
    if (!res.ok) {
      const payload = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new MoodboardApiError(res.status, payload?.error ?? "http_error");
    }
    return (await res.json()) as T;
  }

  return {
    /** Free and instant: which moodboard this wishlist maps to, plus whatever is already generated. */
    plan(productIds: string[]): Promise<MoodboardPlanResponse> {
      return post("/moodboard", { product_ids: productIds, locale: config.locale ?? "it" });
    },
    /** ~8 s the first time for a key, instant afterwards (cached server-side). */
    async analysis(key: string): Promise<MoodboardAnalysisView> {
      return (await post<{ analysis: MoodboardAnalysisView }>("/moodboard/analysis", { key })).analysis;
    },
    /** ~10 s the first time for a key, instant afterwards. */
    async textures(key: string): Promise<MoodboardTextureView[]> {
      return (await post<{ textures: MoodboardTextureView[] }>("/moodboard/textures", { key })).textures;
    },
    /** Absolute URL of a generated asset path returned by the backend. */
    assetUrl(path: string): string {
      return `${config.apiBaseUrl}${path}`;
    },
  };
}

export type MoodboardApi = ReturnType<typeof createMoodboardApi>;
