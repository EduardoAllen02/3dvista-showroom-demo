import type { ChatMessage } from "@3dvista-assistant/assistant-core";
import type { TourBridgeStrategy } from "@3dvista-assistant/tour-bridge";
import { renderProductInfo, renderProductActions, type ProductCardHandlers } from "./product-card.js";
import { renderFormattedText } from "./format-text.js";

export function createMessageList(
  container: HTMLElement,
  tourBridge: TourBridgeStrategy,
  handlers: ProductCardHandlers
) {
  let typingEl: HTMLElement | null = null;

  function isNearBottom(): boolean {
    return container.scrollTop + container.clientHeight >= container.scrollHeight - 80;
  }

  function render(messages: ChatMessage[]): void {
    const wasNearBottom = isNearBottom();
    const prevScrollTop = container.scrollTop;
    container.innerHTML = "";
    for (const message of messages) {
      const bubble = document.createElement("div");
      bubble.className = `tva-bubble tva-bubble-${message.role}`;
      renderFormattedText(bubble, message.text);
      container.appendChild(bubble);

      for (const card of message.cards) {
        // Every card in message.cards is a proposal (get_product/
        // get_alternatives) — navigate_to_product never produces one — so
        // it always gets the info block AND its own action buttons.
        container.appendChild(renderProductInfo(card, handlers));
        container.appendChild(renderProductActions(card, tourBridge, handlers));
      }
    }
    // Only auto-scroll to bottom if the user was already near the bottom —
    // if they scrolled up to read earlier messages, preserve their position.
    if (wasNearBottom) {
      container.scrollTop = container.scrollHeight;
    } else {
      container.scrollTop = prevScrollTop;
    }
  }

  function showTyping(): void {
    if (typingEl) return;
    const wasNearBottom = isNearBottom();
    typingEl = document.createElement("div");
    typingEl.className = "tva-typing";
    typingEl.setAttribute("aria-label", "El asistente está escribiendo");
    typingEl.innerHTML = "<span></span><span></span><span></span>";
    container.appendChild(typingEl);
    if (wasNearBottom) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function hideTyping(): void {
    typingEl?.remove();
    typingEl = null;
  }

  return { render, showTyping, hideTyping };
}
