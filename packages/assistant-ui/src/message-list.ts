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

  // Never auto-follow to the bottom, even when a fresh response (however
  // long — several proposal cards, alternatives, etc.) lands while the
  // user is already at/near the bottom — explicit direction: the view must
  // stay exactly where the user left it, full stop, not just "unless they
  // were already at the bottom" (an earlier version only preserved position
  // when scrolled UP, which still yanked the view down on every reply if
  // the user happened to be at the bottom already — not what was wanted).
  function render(messages: ChatMessage[]): void {
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
    container.scrollTop = prevScrollTop;
  }

  function showTyping(): void {
    if (typingEl) return;
    typingEl = document.createElement("div");
    typingEl.className = "tva-typing";
    typingEl.setAttribute("aria-label", "L'assistente sta scrivendo");
    typingEl.innerHTML = "<span></span><span></span><span></span>";
    container.appendChild(typingEl);
  }

  function hideTyping(): void {
    typingEl?.remove();
    typingEl = null;
  }

  return { render, showTyping, hideTyping };
}
