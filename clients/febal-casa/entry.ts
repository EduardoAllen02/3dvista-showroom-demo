import { AssistantWidget } from "@3dvista-assistant/assistant-ui";
import tourConfig from "./tour.config.json" with { type: "json" };

// Captured synchronously at load time — document.currentScript is only
// valid during a script's own initial (non-async) execution, so this must
// run at module top-level, not inside any later callback.
const scriptSrc = document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : "";
const assetsBaseUrl = scriptSrc.replace(/\/[^/]*$/, "");

AssistantWidget.init({
  tourId: tourConfig.tour_id,
  apiBaseUrl: tourConfig.backendUrl,
  assetsBaseUrl,
  assistantName: tourConfig.assistant.assistantName,
  welcomeMessage: tourConfig.assistant.welcomeMessage,
  suggestedQuestions: tourConfig.assistant.suggestedQuestions,
  theme: {
    primaryColor: tourConfig.theme.primaryColor,
    position: tourConfig.theme.position,
  },
});
