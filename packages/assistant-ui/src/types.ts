export interface AssistantTheme {
  primaryColor: string;
  position: "bottom-right" | "bottom-left";
  logoUrl?: string;
}

export interface AssistantConfig {
  tourId: string;
  apiBaseUrl: string;
  assistantName: string;
  welcomeMessage: string;
  suggestedQuestions: string[];
  theme: AssistantTheme;
  /** Preferred tour-bridge navigation strategy, per Fase 0 findings for this tour. */
  navStrategy?: "hash" | "player-api";
}
