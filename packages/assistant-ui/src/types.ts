import type { TourBridgeStrategy } from "@3dvista-assistant/tour-bridge";

export interface AssistantTheme {
  primaryColor: string;
  position: "bottom-right" | "bottom-left";
  logoUrl?: string;
}

export interface AssistantConfig {
  tourId: string;
  apiBaseUrl: string;
  /** Base URL the widget's own bundle/css/manifest were served from (no
   * trailing slash) — derived from the injected <script> tag's own src, so
   * the wishlist layer can fetch catalog-manifest.json from the same place
   * without a separate config value to keep in sync. */
  assetsBaseUrl: string;
  assistantName: string;
  welcomeMessage: string;
  suggestedQuestions: string[];
  theme: AssistantTheme;
  /** Preferred tour-bridge navigation strategy, per Fase 0 findings for this tour. */
  navStrategy?: "hash" | "player-api";
  /** Another viewer platform's bridge; when absent, the 3DVista bridge (createTourBridge) is used. */
  bridge?: TourBridgeStrategy;
}
