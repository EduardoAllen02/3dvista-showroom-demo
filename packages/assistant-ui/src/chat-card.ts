import { ChatState, createApiClient, getOrCreateSessionId, type ProductCard } from "@3dvista-assistant/assistant-core";
import { createTourBridge } from "@3dvista-assistant/tour-bridge";
import type { AssistantConfig } from "./types.js";
import { createMessageList } from "./message-list.js";

export function createChatCard(config: AssistantConfig): { element: HTMLElement; toggleOpen: () => void } {
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
  const titleWrap = document.createElement("div");
  titleWrap.className = "tva-title";
  const nameEl = document.createElement("strong");
  nameEl.textContent = config.assistantName;
  const subEl = document.createElement("span");
  subEl.textContent = "Tu asistente personal";
  titleWrap.append(nameEl, subEl);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Cerrar");
  closeBtn.textContent = "×";

  header.append(avatar, titleWrap, closeBtn);
  card.appendChild(header);

  // Messages
  const messagesEl = document.createElement("div");
  messagesEl.className = "tva-messages";
  card.appendChild(messagesEl);

  const messageList = createMessageList(messagesEl, tourBridge, {
    onVerAlternativas: (productCard: ProductCard) => {
      void sendMessage(`¿Tienes alternativas a ${productCard.name}?`);
    },
  });

  // Suggestions
  const suggestions = document.createElement("div");
  suggestions.className = "tva-suggestions";
  for (const question of config.suggestedQuestions) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tva-chip";
    chip.textContent = question;
    chip.addEventListener("click", () => void sendMessage(question));
    suggestions.appendChild(chip);
  }
  card.appendChild(suggestions);

  // Input row
  const inputRow = document.createElement("div");
  inputRow.className = "tva-input-row";
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Escribe tu pregunta...";
  input.setAttribute("aria-label", "Mensaje para el asistente");
  const sendBtn = document.createElement("button");
  sendBtn.type = "button";
  sendBtn.setAttribute("aria-label", "Enviar");
  sendBtn.textContent = "➤";
  inputRow.append(input, sendBtn);
  card.appendChild(inputRow);

  async function sendMessage(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    input.value = "";
    state.addUserMessage(trimmed);
    messageList.render(state.getMessages());
    messageList.showTyping();

    try {
      const history = state
        .getMessages()
        .slice(-10)
        .map((m) => ({ role: m.role, text: m.text }));
      const response = await api.sendMessage(trimmed, history);
      messageList.hideTyping();
      state.addAssistantMessage(response.reply, response.product_cards);
      // The agent itself decided to navigate this turn (explicit
      // "llévame"/selection) — apply it immediately, no card/button
      // involved. Proposal cards (response.product_cards) always render
      // with their own Llévame/Ver alternativas buttons instead.
      if (response.navigate) {
        tourBridge.navigateTo(response.navigate);
      }
    } catch {
      messageList.hideTyping();
      state.addAssistantMessage(
        "Lo siento, tuve un problema para responder. Intenta de nuevo en un momento.",
        []
      );
    }
    messageList.render(state.getMessages());
  }

  sendBtn.addEventListener("click", () => void sendMessage(input.value));
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") void sendMessage(input.value);
  });

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

  return { element: card, toggleOpen };
}
