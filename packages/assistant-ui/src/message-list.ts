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

  // Tracks how many messages were on screen after the last render() — the
  // only way to tell a genuinely NEW message apart from a full rebuild
  // triggered by unrelated state (e.g. a wishlist heart toggled elsewhere
  // re-renders the exact same messages). Messages only ever get appended,
  // never reordered or removed (see ChatState), so "index >= this count" is
  // a safe, cheap way to identify the newly-added tail without diffing.
  let renderedMessageCount = 0;

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
    messages.forEach((message, index) => {
      const isNew = index >= renderedMessageCount;
      const bubble = document.createElement("div");
      bubble.className = `tva-bubble tva-bubble-${message.role}`;
      if (isNew) bubble.classList.add("tva-msg-enter");
      renderFormattedText(bubble, message.text);
      container.appendChild(bubble);

      for (const card of message.cards) {
        // Every card in message.cards is a proposal (get_product/
        // get_alternatives) — navigate_to_product never produces one — so
        // it always gets the info block AND its own action buttons.
        const info = renderProductInfo(card, handlers);
        const actions = renderProductActions(card, tourBridge, handlers);
        if (isNew) {
          info.classList.add("tva-msg-enter");
          actions.classList.add("tva-msg-enter");
        }
        container.appendChild(info);
        container.appendChild(actions);
      }
    });
    renderedMessageCount = messages.length;
    container.scrollTop = prevScrollTop;
  }

  function showTyping(): void {
    if (typingEl) return;
    typingEl = document.createElement("div");
    typingEl.className = "tva-typing tva-msg-enter";
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
