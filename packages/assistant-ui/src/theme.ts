import type { AssistantTheme } from "./types.js";

/**
 * Applies per-tour theming as CSS custom properties on the widget's root
 * element. assistant.css only ever reads these variables — it never hardcodes
 * colors — so every tour can re-theme without touching the shared stylesheet.
 */
export function applyTheme(root: HTMLElement, theme: AssistantTheme): void {
  root.style.setProperty("--assistant-primary", theme.primaryColor);
  root.style.setProperty(
    "--assistant-position-side",
    theme.position === "bottom-left" ? "left" : "right"
  );
  root.dataset.assistantPosition = theme.position;
}
