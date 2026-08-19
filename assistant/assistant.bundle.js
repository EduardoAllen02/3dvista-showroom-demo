(() => {
  // packages/assistant-ui/src/theme.ts
  function applyTheme(root, theme) {
    root.style.setProperty("--assistant-primary", theme.primaryColor);
    root.style.setProperty(
      "--assistant-position-side",
      theme.position === "bottom-left" ? "left" : "right"
    );
    root.dataset.assistantPosition = theme.position;
  }

  // packages/assistant-ui/src/launcher.ts
  function createLauncher(onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tva-launcher";
    button.setAttribute("aria-label", "Abrir o cerrar asistente");
    button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 12a8 8 0 1 1 3.2 6.4L4 20l1.2-3.4A7.96 7.96 0 0 1 4 12Z" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    button.addEventListener("click", onClick);
    return button;
  }

  // packages/assistant-core/src/session.ts
  var SESSION_STORAGE_KEY = "3dvista-assistant:session-id";
  function getOrCreateSessionId() {
    try {
      const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (existing) return existing;
      const id = crypto.randomUUID();
      window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
      return id;
    } catch (e) {
      return crypto.randomUUID();
    }
  }

  // packages/assistant-core/src/chat-state.ts
  var ChatState = class {
    constructor() {
      this.messages = [];
      this.listeners = /* @__PURE__ */ new Set();
      this.open = false;
    }
    isOpen() {
      return this.open;
    }
    setOpen(open) {
      this.open = open;
    }
    getMessages() {
      return this.messages;
    }
    addUserMessage(text) {
      const message = {
        id: crypto.randomUUID(),
        role: "user",
        text,
        cards: [],
        createdAt: Date.now()
      };
      this.messages.push(message);
      this.emit();
      return message;
    }
    addAssistantMessage(text, cards) {
      const message = {
        id: crypto.randomUUID(),
        role: "assistant",
        text,
        cards,
        createdAt: Date.now()
      };
      this.messages.push(message);
      this.emit();
      return message;
    }
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    emit() {
      for (const listener of this.listeners) listener(this.messages);
    }
  };

  // packages/assistant-core/src/api-client.ts
  function createApiClient(config) {
    return {
      async sendMessage(message, history) {
        const res = await fetch(`${config.apiBaseUrl}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tour_id: config.tourId,
            session_id: config.sessionId,
            message,
            history
          })
        });
        if (!res.ok) {
          throw new Error(`Chat request failed: ${res.status} ${res.statusText}`);
        }
        return await res.json();
      }
    };
  }

  // packages/tour-bridge/src/hash-navigator.ts
  var hashNavigator = {
    name: "hash",
    isAvailable() {
      return typeof window !== "undefined" && typeof window.location !== "undefined";
    },
    navigateTo(target) {
      const label = encodeURIComponent(target.media_name);
      window.location.hash = `media-name=${label}&yaw=${target.yaw}&pitch=${target.pitch}&fov=${target.fov}`;
    }
  };

  // packages/tour-bridge/src/player-api-navigator.ts
  var MAIN_PLAYLIST_ID = "mainPlayList";
  var POST_ACTIVATION_REWRITE_DELAY_MS = 600;
  var playerApiNavigator = {
    name: "player-api",
    isAvailable() {
      var _a, _b;
      return typeof window !== "undefined" && typeof ((_b = (_a = window.tour) == null ? void 0 : _a.player) == null ? void 0 : _b.getById) === "function";
    },
    navigateTo(target) {
      var _a, _b, _c, _d, _e;
      const registry = (_a = window.tour) == null ? void 0 : _a.player;
      if (!registry) {
        throw new Error("player-api-navigator: window.tour.player not available.");
      }
      const rootPlayer = registry.getById("rootPlayer");
      if (!rootPlayer) {
        throw new Error("player-api-navigator: window.tour.player.getById('rootPlayer') not available.");
      }
      const playlist = registry.getById(MAIN_PLAYLIST_ID);
      if (!playlist) {
        throw new Error(`player-api-navigator: playlist '${MAIN_PLAYLIST_ID}' not found.`);
      }
      const items = playlist.get("items");
      const item = items == null ? void 0 : items.find((candidate) => {
        const media = candidate.get("media");
        const data = media == null ? void 0 : media.get("data");
        return (data == null ? void 0 : data.label) === target.media_name;
      });
      if (!item) {
        throw new Error(`player-api-navigator: no playlist item found with media label '${target.media_name}'.`);
      }
      const camera = item.get("camera");
      const initialPosition = camera == null ? void 0 : camera.get("initialPosition");
      if (!(initialPosition == null ? void 0 : initialPosition.set)) {
        throw new Error(`player-api-navigator: '${target.media_name}' has no settable camera.initialPosition.`);
      }
      initialPosition.set("yaw", target.yaw);
      initialPosition.set("pitch", target.pitch);
      initialPosition.set("hfov", target.fov);
      const currentIndex = playlist.get("selectedIndex");
      const currentItem = items == null ? void 0 : items[currentIndex];
      const currentMedia = currentItem == null ? void 0 : currentItem.get("media");
      const currentLabel = (_b = currentMedia == null ? void 0 : currentMedia.get("data")) == null ? void 0 : _b.label;
      if (currentLabel === target.media_name) {
        const viewer = rootPlayer.getMainViewer();
        const activePlayer = rootPlayer.getActivePlayerWithViewer(viewer);
        (_c = activePlayer.set) == null ? void 0 : _c.call(activePlayer, "yaw", target.yaw);
        (_d = activePlayer.set) == null ? void 0 : _d.call(activePlayer, "pitch", target.pitch);
        (_e = activePlayer.set) == null ? void 0 : _e.call(activePlayer, "hfov", target.fov);
      } else {
        rootPlayer.setMainMediaByName(target.media_name);
        setTimeout(() => {
          var _a2, _b2, _c2;
          const viewer = rootPlayer.getMainViewer();
          const activePlayer = rootPlayer.getActivePlayerWithViewer(viewer);
          (_a2 = activePlayer.set) == null ? void 0 : _a2.call(activePlayer, "yaw", target.yaw);
          (_b2 = activePlayer.set) == null ? void 0 : _b2.call(activePlayer, "pitch", target.pitch);
          (_c2 = activePlayer.set) == null ? void 0 : _c2.call(activePlayer, "hfov", target.fov);
        }, POST_ACTIVATION_REWRITE_DELAY_MS);
      }
    }
  };

  // packages/tour-bridge/src/strategy.ts
  function createTourBridge(preferred = "player-api") {
    const primary = preferred === "player-api" ? playerApiNavigator : hashNavigator;
    const fallback = preferred === "player-api" ? hashNavigator : playerApiNavigator;
    return {
      name: primary.name,
      isAvailable() {
        return primary.isAvailable() || fallback.isAvailable();
      },
      navigateTo(target) {
        if (primary.isAvailable()) {
          primary.navigateTo(target);
          return;
        }
        if (fallback.isAvailable()) {
          fallback.navigateTo(target);
          return;
        }
        throw new Error("createTourBridge: no navigation strategy is available.");
      }
    };
  }

  // packages/assistant-ui/src/product-card.ts
  function renderProductInfo(card) {
    const el = document.createElement("div");
    el.className = "tva-product-card";
    const img = document.createElement("img");
    img.src = card.image_url;
    img.alt = card.name;
    img.loading = "lazy";
    el.appendChild(img);
    const body = document.createElement("div");
    body.className = "tva-product-card-body";
    const title = document.createElement("strong");
    title.textContent = card.name;
    const desc = document.createElement("p");
    desc.textContent = card.description;
    body.append(title, desc);
    el.appendChild(body);
    return el;
  }
  function renderProductActions(card, tourBridge, handlers) {
    const actions = document.createElement("div");
    actions.className = "tva-product-actions";
    const goBtn = document.createElement("button");
    goBtn.type = "button";
    goBtn.className = "tva-primary";
    goBtn.textContent = "Ll\xE9vame";
    goBtn.addEventListener("click", () => {
      tourBridge.navigateTo(card.navTarget);
    });
    const altBtn = document.createElement("button");
    altBtn.type = "button";
    altBtn.textContent = "Ver alternativas";
    altBtn.addEventListener("click", () => handlers.onVerAlternativas(card));
    actions.append(goBtn, altBtn);
    return actions;
  }

  // packages/assistant-ui/src/message-list.ts
  function createMessageList(container, tourBridge, handlers) {
    let typingEl = null;
    function render(messages) {
      container.innerHTML = "";
      for (const message of messages) {
        const bubble = document.createElement("div");
        bubble.className = `tva-bubble tva-bubble-${message.role}`;
        bubble.textContent = message.text;
        container.appendChild(bubble);
        for (const card of message.cards) {
          container.appendChild(renderProductInfo(card));
          container.appendChild(renderProductActions(card, tourBridge, handlers));
        }
      }
      container.scrollTop = container.scrollHeight;
    }
    function showTyping() {
      if (typingEl) return;
      typingEl = document.createElement("div");
      typingEl.className = "tva-typing";
      typingEl.setAttribute("aria-label", "El asistente est\xE1 escribiendo");
      typingEl.innerHTML = "<span></span><span></span><span></span>";
      container.appendChild(typingEl);
      container.scrollTop = container.scrollHeight;
    }
    function hideTyping() {
      typingEl == null ? void 0 : typingEl.remove();
      typingEl = null;
    }
    return { render, showTyping, hideTyping };
  }

  // packages/assistant-ui/src/chat-card.ts
  function createChatCard(config) {
    const state = new ChatState();
    const tourBridge = createTourBridge(config.navStrategy);
    const api = createApiClient({
      apiBaseUrl: config.apiBaseUrl,
      tourId: config.tourId,
      sessionId: getOrCreateSessionId()
    });
    const card = document.createElement("div");
    card.className = "tva-card";
    card.inert = true;
    card.setAttribute("aria-hidden", "true");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", config.assistantName);
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
    closeBtn.textContent = "\xD7";
    header.append(avatar, titleWrap, closeBtn);
    card.appendChild(header);
    const messagesEl = document.createElement("div");
    messagesEl.className = "tva-messages";
    card.appendChild(messagesEl);
    const messageList = createMessageList(messagesEl, tourBridge, {
      onVerAlternativas: (productCard) => {
        void sendMessage(`\xBFTienes alternativas a ${productCard.name}?`);
      }
    });
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
    const inputRow = document.createElement("div");
    inputRow.className = "tva-input-row";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Escribe tu pregunta...";
    input.setAttribute("aria-label", "Mensaje para el asistente");
    const sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.setAttribute("aria-label", "Enviar");
    sendBtn.textContent = "\u27A4";
    inputRow.append(input, sendBtn);
    card.appendChild(inputRow);
    async function sendMessage(text) {
      const trimmed = text.trim();
      if (!trimmed) return;
      input.value = "";
      state.addUserMessage(trimmed);
      messageList.render(state.getMessages());
      messageList.showTyping();
      try {
        const history = state.getMessages().slice(-10).map((m) => ({ role: m.role, text: m.text }));
        const response = await api.sendMessage(trimmed, history);
        messageList.hideTyping();
        state.addAssistantMessage(response.reply, response.product_cards);
        if (response.navigate) {
          tourBridge.navigateTo(response.navigate);
        }
      } catch (e) {
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
    function setOpen(open) {
      card.classList.toggle("tva-card--open", open);
      card.inert = !open;
      card.setAttribute("aria-hidden", String(!open));
      state.setOpen(open);
      if (open) {
        requestAnimationFrame(() => input.focus());
        if (!welcomed) {
          welcomed = true;
          state.addAssistantMessage(config.welcomeMessage, []);
          messageList.render(state.getMessages());
        }
      }
    }
    function toggleOpen() {
      setOpen(!state.isOpen());
    }
    closeBtn.addEventListener("click", () => setOpen(false));
    return { element: card, toggleOpen };
  }

  // packages/assistant-ui/src/index.ts
  var MOUNT_ID = "tva-mount-root";
  var MOBILE_BREAKPOINT_PX = 480;
  function isMobileDevice() {
    const w = window.screen.width || Infinity;
    const h = window.screen.height || Infinity;
    const shortSide = Math.min(w, h);
    return Number.isFinite(shortSide) && shortSide <= MOBILE_BREAKPOINT_PX;
  }
  function computeMobileUnit() {
    const physicalWidth = window.screen.width;
    if (!physicalWidth || !Number.isFinite(physicalWidth) || physicalWidth <= 0) return "1px";
    return `calc(100vw / ${physicalWidth})`;
  }
  function init(config) {
    if (document.getElementById(MOUNT_ID)) return;
    const root = document.createElement("div");
    root.id = MOUNT_ID;
    root.className = "tva-root";
    root.dataset.assistantPosition = config.theme.position;
    applyTheme(root, config.theme);
    const applyResponsiveState = () => {
      const mobile = isMobileDevice();
      root.dataset.tvaMobile = String(mobile);
      root.style.setProperty("--tva-mobile-unit", mobile ? computeMobileUnit() : "1px");
    };
    applyResponsiveState();
    const { element: cardEl, toggleOpen } = createChatCard(config);
    const launcher = createLauncher(toggleOpen);
    root.append(cardEl, launcher);
    document.body.appendChild(root);
    window.addEventListener("orientationchange", applyResponsiveState);
  }
  var AssistantWidget = { init };

  // clients/showroom-real/tour.config.json
  var tour_config_default = {
    tour_id: "showroom-real",
    displayName: "Showroom Real \u2014 Colecci\xF3n Milano",
    allowedOrigin: "https://eduardoallen02.github.io",
    backendUrl: "https://threedvista-showroom-demo.onrender.com",
    media: [
      { media_name: "sala-1-entrada", sourceFrame: "frame_000001.webp", label: "Sala 1 \u2014 Entrada" },
      { media_name: "sala-2-vitrinas", sourceFrame: "frame_000007.webp", label: "Sala 2 \u2014 Vitrinas" },
      { media_name: "sala-3-living", sourceFrame: "frame_000010.webp", label: "Sala 3 \u2014 Living" },
      { media_name: "sala-4-lounge", sourceFrame: "frame_000015.webp", label: "Sala 4 \u2014 Lounge" },
      { media_name: "sala-5-mesas", sourceFrame: "frame_000019.webp", label: "Sala 5 \u2014 Mesas" }
    ],
    assistant: {
      assistantName: "AI Tour Assistant",
      welcomeMessage: "\xA1Hola! Soy tu asistente del showroom. Preg\xFAntame por cualquier producto \u2014 sof\xE1s, sillas, mesas o vitrinas \u2014 y te llevo directo a \xE9l.",
      suggestedQuestions: ["Sof\xE1s", "Sillas", "Mesas", "Vitrinas"]
    },
    theme: {
      primaryColor: "#14b8a6",
      position: "bottom-right"
    }
  };

  // clients/showroom-real/entry.ts
  AssistantWidget.init({
    tourId: tour_config_default.tour_id,
    apiBaseUrl: tour_config_default.backendUrl,
    assistantName: tour_config_default.assistant.assistantName,
    welcomeMessage: tour_config_default.assistant.welcomeMessage,
    suggestedQuestions: tour_config_default.assistant.suggestedQuestions,
    theme: {
      primaryColor: tour_config_default.theme.primaryColor,
      position: tour_config_default.theme.position
    }
  });
})();
