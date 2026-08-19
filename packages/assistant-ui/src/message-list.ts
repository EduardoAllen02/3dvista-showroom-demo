import type { ChatMessage } from "@3dvista-assistant/assistant-core";
import type { TourBridgeStrategy } from "@3dvista-assistant/tour-bridge";
import { renderProductInfo, renderProductActions, type ProductCardHandlers } from "./product-card.js";

export function createMessageList(
  container: HTMLElement,
  tourBridge: TourBridgeStrategy,
  handlers: ProductCardHandlers
) {
  let typingEl: HTMLElement | null = null;

  function render(messages: ChatMessage[]): void {
    container.innerHTML = "";
    for (const message of messages) {
      const bubble = document.createElement("div");
      bubble.className = `tva-bubble tva-bubble-${message.role}`;
      bubble.textContent = message.text;
      container.appendChild(bubble);

      for (const card of message.cards) {
        // Every card in message.cards is a proposal (get_product/
        // get_alternatives) — navigate_to_product never produces one — so
        // it always gets the info block AND its own action buttons.
        container.appendChild(renderProductInfo(card));
        container.appendChild(renderProductActions(card, tourBridge, handlers));
      }
    }
    container.scrollTop = container.scrollHeight;
  }

  function showTyping(): void {
    if (typingEl) return;
    typingEl = document.createElement("div");
    typingEl.className = "tva-typing";
    typingEl.setAttribute("aria-label", "El asistente está escribiendo");
    typingEl.innerHTML = "<span></span><span></span><span></span>";
    container.appendChild(typingEl);
    container.scrollTop = container.scrollHeight;
  }

  function hideTyping(): void {
    typingEl?.remove();
    typingEl = null;
  }

  return { render, showTyping, hideTyping };
}
