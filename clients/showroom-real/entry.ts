import { AssistantWidget } from "@3dvista-assistant/assistant-ui";
import tourConfig from "./tour.config.json" with { type: "json" };

AssistantWidget.init({
  tourId: tourConfig.tour_id,
  apiBaseUrl: tourConfig.backendUrl,
  assistantName: tourConfig.assistant.assistantName,
  welcomeMessage: tourConfig.assistant.welcomeMessage,
  suggestedQuestions: tourConfig.assistant.suggestedQuestions,
  theme: {
    primaryColor: tourConfig.theme.primaryColor,
    position: tourConfig.theme.position,
  },
});
