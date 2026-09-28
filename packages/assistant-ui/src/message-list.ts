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

  // Revised 2026-09-04 per client feedback (Andrea, Febal Casa): a fresh
  // assistant reply with product cards was easy to miss, because the view
  // never moved — the visitor had to notice and scroll manually. The old
  // behavior (restore prevScrollTop unconditionally, never auto-follow) is
  // kept for re-renders that do NOT add a new message — e.g. a wishlist
  // heart toggled elsewhere still shouldn't yank the view — but a genuinely
  // new message (index >= renderedMessageCount at call time, captured
  // BEFORE it's overwritten below) now scrolls smoothly to reveal it.
  function render(messages: ChatMessage[]): void {
    const prevScrollTop = container.scrollTop;
    const hasNewMessage = messages.length > renderedMessageCount;
    let firstNewEl: HTMLElement | null = null;
    container.innerHTML = "";
    messages.forEach((message, index) => {
      const isNew = index >= renderedMessageCount;
      const bubble = document.createElement("div");
      bubble.className = `tva-bubble tva-bubble-${message.role}`;
      if (isNew) bubble.classList.add("tva-msg-enter");
      renderFormattedText(bubble, message.text);
      container.appendChild(bubble);
      if (isNew && !firstNewEl) firstNewEl = bubble;

      // v2 cards come in groups ("En el showroom", "Disponible bajo pedido"…): a small
      // header each time the group changes. v1 cards carry no group and show none.
      let lastGroup: string | undefined;
      for (const card of message.cards) {
        if (card.group_title && card.group_id !== lastGroup) {
          const head = document.createElement("div");
          head.className = "tva-card-group";
          head.textContent = card.group_title;
          if (isNew) head.classList.add("tva-msg-enter");
          container.appendChild(head);
        }
        lastGroup = card.group_id;
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

    if (hasNewMessage && firstNewEl) {
      // Reveal the start of the new reply rather than jumping straight to
      // the very bottom — with several cards in one reply, the visitor
      // should land on the assistant's text/first card, not past it.
      (firstNewEl as HTMLElement).scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      container.scrollTop = prevScrollTop;
    }
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
