import {
  ChatState,
  createApiClient,
  getOrCreateSessionId,
  type ProductCard,
  type WishlistState,
} from "@3dvista-assistant/assistant-core";
import { createTourBridge } from "@3dvista-assistant/tour-bridge";
import type { AssistantConfig } from "./types.js";
import { createMessageList } from "./message-list.js";

/**
 * The chatbot is ONE of two independent layers on top of the tour — see
 * wishlist-layer.ts for the other. They share only `wishlist` (a single
 * WishlistState instance, owned by index.ts and passed into both) so a
 * product saved from either surface is consistent everywhere. The chatbot
 * itself owns no wishlist UI beyond the small secondary heart on its own
 * product cards (wired via message-list.ts's handlers) — no panel, no
 * toggle button, no badge. That used to live here; it was pulled out
 * because the chatbot and the wishlist are meant to read as two distinct
 * pieces of the experience, not one absorbing the other.
 */
export function createChatCard(
  config: AssistantConfig,
  wishlist: WishlistState,
  onOpenWishlist?: () => void,
  onOpenChange?: (open: boolean) => void
): { element: HTMLElement; toggleOpen: () => void; open: () => void } {
  const state = new ChatState();
  const tourBridge = createTourBridge(config.navStrategy);
  const api = createApiClient({
    apiBaseUrl: config.apiBaseUrl,
    tourId: config.tourId,
    sessionId: getOrCreateSessionId(),
  });

  const card = document.createElement("div");
  card.className = "tva-card";
  // Deliberately NOT `hidden`/`display:none` while closed — both are
  // binary (can't be transitioned), which is why the card used to just
  // pop in/out instead of animating. Left in the DOM at all times, only
  // toggling a class (opacity/transform transition in CSS) plus `inert`
  // (disables pointer/keyboard interaction and hides it from assistive
  // tech in one shot — supported in every target browser here) so it's
  // functionally invisible while closed without losing the animation.
  card.inert = true;
  card.setAttribute("aria-hidden", "true");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-label", config.assistantName);

  // Header
  const header = document.createElement("div");
  header.className = "tva-card-header";
  const avatar = document.createElement("div");
  avatar.className = "tva-avatar";
  avatar.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M12 2.5c.4 3.1 1.1 5.2 2.2 6.3 1.1 1.1 3.2 1.8 6.3 2.2-3.1.4-5.2 1.1-6.3 2.2-1.1 1.1-1.8 3.2-2.2 6.3-.4-3.1-1.1-5.2-2.2-6.3C8.7 12 6.6 11.3 3.5 11c3.1-.4 5.2-1.1 6.3-2.2 1.1-1.1 1.8-3.2 2.2-6.3Z" fill="white"/>' +
    '<path d="M19 2.5c.15 1 .4 1.7.8 2.1.4.4 1.1.65 2.1.8-1 .15-1.7.4-2.1.8-.4.4-.65 1.1-.8 2.1-.15-1-.4-1.7-.8-2.1-.4-.4-1.1-.65-2.1-.8 1-.15 1.7-.4 2.1-.8.4-.4.65-1.1.8-2.1Z" fill="white"/>' +
    "</svg>";
  const titleWrap = document.createElement("div");
  titleWrap.className = "tva-title";
  const nameEl = document.createElement("strong");
  nameEl.textContent = config.assistantName;
  const subEl = document.createElement("span");
  subEl.textContent = "Il tuo consulente d'arredamento";
  titleWrap.append(nameEl, subEl);

  const switchToWishlistBtn = document.createElement("button");
  switchToWishlistBtn.type = "button";
  switchToWishlistBtn.className = "tva-card-switch-btn";
  switchToWishlistBtn.setAttribute("aria-label", "Apri la mia lista");
  switchToWishlistBtn.textContent = "La mia lista";
  switchToWishlistBtn.addEventListener("click", () => {
    setOpen(false);
    onOpenWishlist?.();
  });

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Chiudi");
  closeBtn.textContent = "×";

  header.append(avatar, titleWrap, switchToWishlistBtn, closeBtn);
  card.appendChild(header);

  // Messages
  const messagesEl = document.createElement("div");
  messagesEl.className = "tva-messages";
  card.appendChild(messagesEl);

  const messageList = createMessageList(messagesEl, tourBridge, {
    onVerAlternativas: (productCard: ProductCard) => void showAlternatives(productCard),
    isWishlisted: (productId: string) => wishlist.has(productId),
    onToggleWishlist: (productCard: ProductCard) => wishlist.toggle(productCard),
    // Replicates a real click on the product's own tour hotspot: moves the
    // camera there AND opens the same info panel (see tour-bridge's
    // openProductPanel — optional because the hash-fallback strategy has
    // no way to do this; silently a no-op there instead of throwing).
    onVerFicha: (productCard: ProductCard) => {
      tourBridge.navigateTo(productCard.navTarget);
      tourBridge.openProductPanel?.(productCard.navTarget);
    },
  });

  // Only one request that appends to `state`/`messageList` runs at a time.
  // Without this, firing a second one before the first resolves (e.g.
  // clicking "Ver alternativas" and then immediately typing a new message)
  // lets both async calls race — whichever resolves LAST wins the final
  // `messageList.render()`, which can attach one call's cards under the
  // OTHER call's just-added text bubble. Reproduced live during testing.
  // Simplest fix: while one is in flight, the input/buttons that could
  // start another are disabled, and any handler still called during that
  // window (e.g. a stray double-click) bails out immediately instead of
  // racing.
  let requestInFlight = false;
  function setBusy(busy: boolean): void {
    requestInFlight = busy;
    input.disabled = busy;
    sendBtn.disabled = busy;
  }

  // Deterministic reveal — no LLM round-trip, so no "sí, entérate" prose to
  // wait on. This is also what keeps a fresh proposal down to exactly one
  // card: the model never has a reason to pre-empt this button by calling
  // get_alternatives itself (see orchestrator.ts's one-proposal-per-turn
  // guard for the structural backstop on that side too).
  async function showAlternatives(productCard: ProductCard): Promise<void> {
    if (requestInFlight) return;
    setBusy(true);
    messageList.showTyping();
    try {
      const altCards = await api.getAlternatives(productCard.product_id);
      messageList.hideTyping();
      state.addAssistantMessage(
        altCards.length > 0 ? "Ecco altre alternative:" : "Non ho trovato altre alternative per questo prodotto.",
        altCards
      );
    } catch {
      messageList.hideTyping();
      state.addAssistantMessage("Mi dispiace, non sono riuscito a caricare le alternative. Riprova.", []);
    }
    messageList.render(state.getMessages());
    setBusy(false);
  }

  // Input row
  const inputRow = document.createElement("div");
  inputRow.className = "tva-input-row";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Scrivi la tua domanda...";
  input.setAttribute("aria-label", "Messaggio per l'assistente");
  const sendBtn = document.createElement("button");
  sendBtn.type = "button";
  sendBtn.setAttribute("aria-label", "Invia");
  sendBtn.textContent = "➤";
  inputRow.append(input, sendBtn);
  card.appendChild(inputRow);

  // Suggestions — rendered BELOW the input row (matches the reference UI),
  // not above it.
  const suggestions = document.createElement("div");
  suggestions.className = "tva-suggestions";
  const suggestionsLabel = document.createElement("span");
  suggestionsLabel.className = "tva-suggestions-label";
  suggestionsLabel.textContent = "Suggerimenti:";
  suggestions.appendChild(suggestionsLabel);
  for (const question of config.suggestedQuestions) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tva-chip";
    chip.textContent = question;
    chip.addEventListener("click", () => void sendMessage(question));
    suggestions.appendChild(chip);
  }
  card.appendChild(suggestions);

  async function sendMessage(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || requestInFlight) return;
    setBusy(true);

    // The backend's history used to be plain {role, text} — it never saw
    // the structured `cards` a past assistant turn actually proposed,
    // only its own prose about them. That gap is what let a later short
    // "sí" confirmation lock onto the wrong earlier turn (a real bug
    // caught by the user, reproduced live). Sending `product_ids`
    // alongside each assistant turn (as real structured data, NOT glued
    // into the displayed text — see orchestrator.ts's toApiMessages,
    // which turns this into its own separate `system` note) gives the
    // model an unambiguous anchor. An earlier version embedded the ids
    // as a trailing text line instead, and the model started literally
    // copying that bracket syntax into its own new replies — this
    // structured field avoids that entirely.
    //
    // Built from `state.getMessages()` BEFORE `addUserMessage` runs below —
    // `sendMessage(trimmed, history)` already sends the current message as
    // its own top-level argument, and the backend appends it as the final
    // `user` turn itself. Snapshotting history afterward (an earlier
    // version did) put the SAME message in twice: once as the last history
    // entry, once as `message` — the model saw its own two-line "user said
    // X, user said X" every single turn, a real (if silent) contributor to
    // it losing the thread in longer conversations, caught live by a user
    // who noticed tool calls/cards stopped appearing after the first reply.
    const history = state
      .getMessages()
      .slice(-10)
      .map((m) => ({
        role: m.role,
        text: m.text,
        ...(m.role === "assistant" && m.cards.length > 0
          ? { product_ids: m.cards.map((c) => c.product_id) }
          : {}),
      }));

    input.value = "";
    state.addUserMessage(trimmed);
    messageList.render(state.getMessages());
    messageList.showTyping();

    try {
      const response = await api.sendMessage(
        trimmed,
        history,
        wishlist.getAll().map((c) => c.product_id)
      );
      messageList.hideTyping();
      state.addAssistantMessage(response.reply, response.product_cards);
      // The agent itself decided to navigate this turn (explicit
      // "llévame"/selección) — apply it immediately, no card/button
      // involved. Proposal cards (response.product_cards) always render
      // with their own Llévame/Ver alternativas buttons instead.
      if (response.navigate) {
        tourBridge.navigateTo(response.navigate);
      }
    } catch {
      messageList.hideTyping();
      state.addAssistantMessage(
        "Mi dispiace, ho avuto un problema nel rispondere. Riprova tra un momento.",
        []
      );
    }
    messageList.render(state.getMessages());
    setBusy(false);
  }

  sendBtn.addEventListener("click", () => void sendMessage(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void sendMessage(input.value);
  });

  // A card currently on screen may have just been (un)saved from the OTHER
  // layer (the wishlist's hotspot overlay, or the panel's own remove
  // button) — repaint so its heart reflects the new state without waiting
  // for the next chat message.
  wishlist.subscribe(() => messageList.render(state.getMessages()));

  let welcomed = false;

  // `state` (ChatState.isOpen/setOpen) is the SINGLE source of truth for
  // open/closed — both the launcher and this card's own close button read
  // and write through here, never a separately-tracked local flag. That
  // used to be split (the launcher kept its own `open` boolean), which
  // desynced the instant the card was closed via ITS OWN close button
  // instead of the launcher: the launcher's copy stayed `true`, so its
  // next click closed an already-closed card, requiring a second click to
  // actually reopen it.
  function setOpen(open: boolean): void {
    card.classList.toggle("tva-card--open", open);
    card.inert = !open;
    card.setAttribute("aria-hidden", String(!open));
    state.setOpen(open);
    onOpenChange?.(open);
    if (open) {
      // Wait a frame so focus doesn't jump before the open transition has
      // started painting (jarring on some mobile browsers otherwise).
      requestAnimationFrame(() => input.focus());
      if (!welcomed) {
        welcomed = true;
        state.addAssistantMessage(config.welcomeMessage, []);
        messageList.render(state.getMessages());
      }
    }
  }

  function toggleOpen(): void {
    setOpen(!state.isOpen());
  }

  closeBtn.addEventListener("click", () => setOpen(false));

  return { element: card, toggleOpen, open: () => setOpen(true) };
}
