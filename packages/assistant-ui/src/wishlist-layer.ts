import type { HotspotManifestEntry, ProductCard, WishlistState } from "@3dvista-assistant/assistant-core";
import type { TourBridgeStrategy } from "@3dvista-assistant/tour-bridge";
import { createHotspotHeartOverlay } from "./hotspot-heart-overlay.js";

export interface WishlistLayerDeps {
  wishlist: WishlistState;
  tourBridge: TourBridgeStrategy;
  manifest: HotspotManifestEntry[];
  assistantName: string;
  fetchRecommendations: (productIds: string[]) => Promise<{ dominantStyle: string | null; cards: ProductCard[] }>;
  onOpenChat?: () => void;
}

const HEART_SVG =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M12 20.5s-7.5-4.8-10-9.4C.5 7.8 2.3 4.5 5.6 4c2-.3 3.9.6 5 2.2C11.7 4.6 13.6 3.7 15.6 4c3.3.5 5.1 3.8 3.6 7.1-2.5 4.6-10 9.4-10 9.4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
  "</svg>";

function buildSummaryText(items: ProductCard[], assistantName: string): string {
  const lines = [`Mi colección de ${assistantName}:`, ""];
  items.forEach((item, i) => lines.push(`${i + 1}. ${item.name}`));
  return lines.join("\n");
}

/**
 * Opens a plain, print-ready page and triggers the browser's native print
 * dialog ("Guardar como PDF" is a print-destination on every major
 * browser) — a real PDF download without pulling a PDF-generation library
 * into a browser bundle.
 */
function downloadAsPdf(items: ProductCard[], assistantName: string): void {
  const win = window.open("", "_blank");
  if (!win) return;
  const rows = items
    .map(
      (item) =>
        `<tr><td><img src="${item.image_url}" alt=""></td><td><strong>${item.name}</strong></td></tr>`
    )
    .join("");
  win.document.write(
    `<!doctype html><html><head><title>Mi colección — ${assistantName}</title><style>
      body{font-family:sans-serif;padding:32px;color:#111}
      h1{font-size:20px}
      table{width:100%;border-collapse:collapse;margin-top:16px}
      td{padding:10px 8px;border-bottom:1px solid #ddd;vertical-align:middle}
      img{width:64px;height:64px;object-fit:cover;border-radius:6px;background:#eee}
    </style></head><body>
      <h1>Mi colección — ${assistantName}</h1>
      <table>${rows}</table>
    </body></html>`
  );
  win.document.close();
  win.focus();
  win.print();
}

function emailWishlist(items: ProductCard[], assistantName: string): void {
  const body = buildSummaryText(items, assistantName);
  const url = `mailto:?subject=${encodeURIComponent("Mi colección — " + assistantName)}&body=${encodeURIComponent(body)}`;
  window.open(url, "_blank");
}

function shareOnWhatsapp(items: ProductCard[], assistantName: string): void {
  const text = buildSummaryText(items, assistantName);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

function renderItemRow(item: ProductCard, deps: WishlistLayerDeps, onChanged: () => void): HTMLElement {
  const row = document.createElement("div");
  row.className = "tva-wl-item";

  const img = document.createElement("img");
  img.src = item.image_url;
  img.alt = item.name;
  img.loading = "lazy";
  row.appendChild(img);

  const body = document.createElement("div");
  body.className = "tva-wl-item-body";
  const name = document.createElement("strong");
  name.textContent = item.name;
  body.appendChild(name);
  if (item.section) {
    const section = document.createElement("span");
    section.className = "tva-wl-item-section";
    section.textContent = item.section;
    body.appendChild(section);
  }
  const goBtn = document.createElement("button");
  goBtn.type = "button";
  goBtn.className = "tva-wl-item-go";
  goBtn.textContent = "Llévame";
  goBtn.addEventListener("click", () => deps.tourBridge.navigateTo(item.navTarget));
  body.appendChild(goBtn);
  row.appendChild(body);

  const actions = document.createElement("div");
  actions.className = "tva-wl-item-actions";

  const heart = document.createElement("button");
  heart.type = "button";
  heart.className = "tva-wl-item-heart tva-wl-item-heart--saved";
  heart.setAttribute("aria-label", `Quitar ${item.name} de mi colección`);
  heart.innerHTML = HEART_SVG;
  heart.addEventListener("click", () => {
    deps.wishlist.remove(item.product_id);
    onChanged();
  });
  actions.appendChild(heart);
  row.appendChild(actions);

  return row;
}

function renderRecommendationCard(card: ProductCard, deps: WishlistLayerDeps): HTMLElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "tva-wl-rec-card";
  el.addEventListener("click", () => deps.tourBridge.navigateTo(card.navTarget));

  const img = document.createElement("img");
  img.src = card.image_url;
  img.alt = card.name;
  img.loading = "lazy";
  el.appendChild(img);

  const name = document.createElement("strong");
  name.textContent = card.name;
  el.appendChild(name);

  if (card.section) {
    const section = document.createElement("span");
    section.textContent = card.section;
    el.appendChild(section);
  }

  return el;
}

export function createWishlistLayer(deps: WishlistLayerDeps): { element: HTMLElement; open: () => void } {
  const root = document.createElement("div");
  root.className = "tva-wl-root";

  // Hotspot-hover heart overlay — independent piece, mounted alongside the
  // toggle/panel but with no coupling to either beyond the shared store.
  const hotspotOverlay = createHotspotHeartOverlay({ wishlist: deps.wishlist, manifest: deps.manifest });
  root.appendChild(hotspotOverlay.element);

  // Toggle button — positioned clear of the tour's own Febal logo (top-right,
  // but low enough to sit below it) per explicit instruction: the trigger
  // must never cover the logo, even though the opened panel itself may.
  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "tva-wl-toggle";
  toggleBtn.setAttribute("aria-label", "Mi colección");
  toggleBtn.setAttribute("aria-pressed", "false");
  toggleBtn.innerHTML = HEART_SVG;
  const badge = document.createElement("span");
  badge.className = "tva-wl-toggle-badge";
  badge.hidden = true;
  toggleBtn.appendChild(badge);
  root.appendChild(toggleBtn);

  // Panel
  const panel = document.createElement("aside");
  panel.className = "tva-wl-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Mi colección");
  root.appendChild(panel);

  let open = false;

  function syncBadge(): void {
    const count = deps.wishlist.getAll().length;
    badge.hidden = count === 0;
    badge.textContent = String(count);
  }

  function renderPanel(): void {
    const items = deps.wishlist.getAll();
    panel.innerHTML = "";

    const header = document.createElement("div");
    header.className = "tva-wl-header";
    const titleWrap = document.createElement("div");
    const h2 = document.createElement("h2");
    h2.textContent = "Mi colección";
    const count = document.createElement("span");
    count.textContent = items.length === 1 ? "1 producto guardado" : `${items.length} productos guardados`;
    titleWrap.append(h2, count);
    const switchToChatBtn = document.createElement("button");
    switchToChatBtn.type = "button";
    switchToChatBtn.className = "tva-wl-switch-btn";
    switchToChatBtn.setAttribute("aria-label", "Abrir asistente");
    switchToChatBtn.textContent = "Asistente";
    switchToChatBtn.addEventListener("click", () => {
      setOpen(false);
      deps.onOpenChat?.();
    });

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "tva-wl-close";
    closeBtn.setAttribute("aria-label", "Cerrar");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => setOpen(false));
    header.append(titleWrap, switchToChatBtn, closeBtn);
    panel.appendChild(header);

    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "tva-wl-empty";
      empty.textContent =
        "Aún no has guardado nada. Pasa el cursor sobre cualquier producto en el tour, o usa el corazón en el chat, para empezar tu colección.";
      panel.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "tva-wl-list";
    for (const item of items) list.appendChild(renderItemRow(item, deps, () => { renderPanel(); syncBadge(); }));
    panel.appendChild(list);

    const styleSection = document.createElement("div");
    styleSection.className = "tva-wl-style-section";
    const loading = document.createElement("p");
    loading.className = "tva-wl-style-loading";
    loading.textContent = "Analizando tu estilo…";
    styleSection.appendChild(loading);
    panel.appendChild(styleSection);

    deps
      .fetchRecommendations(items.map((i) => i.product_id))
      .then(({ dominantStyle, cards }) => {
        styleSection.innerHTML = "";
        if (dominantStyle) {
          const label = document.createElement("div");
          label.className = "tva-wl-style-label";
          label.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
            '<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3Z" fill="currentColor"/></svg>';
          const text = document.createElement("span");
          text.innerHTML = `<strong>Tu estilo: ${dominantStyle}.</strong> Esto es lo que podría gustarte.`;
          label.appendChild(text);
          styleSection.appendChild(label);
        }
        if (cards.length > 0) {
          const row = document.createElement("div");
          row.className = "tva-wl-rec-row";
          for (const card of cards) row.appendChild(renderRecommendationCard(card, deps));
          styleSection.appendChild(row);
        } else if (!dominantStyle) {
          styleSection.remove();
        }
      })
      .catch(() => styleSection.remove());

    const showroomBtn = document.createElement("button");
    showroomBtn.type = "button";
    showroomBtn.className = "tva-wl-showroom-btn";
    showroomBtn.textContent = "Ver en el showroom";
    showroomBtn.addEventListener("click", () => {
      deps.tourBridge.navigateTo(items[0].navTarget);
      setOpen(false);
    });
    panel.appendChild(showroomBtn);

    const actions = document.createElement("div");
    actions.className = "tva-wl-actions";
    const actionDefs: Array<[string, string, () => void]> = [
      ["Descargar PDF", "pdf", () => downloadAsPdf(items, deps.assistantName)],
      ["Enviar por correo", "mail", () => emailWishlist(items, deps.assistantName)],
      ["WhatsApp", "whatsapp", () => shareOnWhatsapp(items, deps.assistantName)],
    ];
    for (const [label, iconKind, handler] of actionDefs) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tva-wl-action";
      btn.dataset.icon = iconKind;
      btn.textContent = label;
      btn.addEventListener("click", handler);
      actions.appendChild(btn);
    }
    panel.appendChild(actions);
  }

  function setOpen(next: boolean): void {
    open = next;
    panel.classList.toggle("tva-wl-panel--open", open);
    toggleBtn.classList.toggle("tva-wl-toggle--active", open);
    toggleBtn.setAttribute("aria-pressed", String(open));
    if (open) renderPanel();
  }

  toggleBtn.addEventListener("click", () => setOpen(!open));
  deps.wishlist.subscribe(() => {
    syncBadge();
    if (open) renderPanel();
  });
  syncBadge();

  return { element: root, open: () => setOpen(true) };
}
