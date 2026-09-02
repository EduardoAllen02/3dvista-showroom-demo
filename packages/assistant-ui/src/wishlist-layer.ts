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

const CHEVRON_LEFT_SVG =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEVRON_RIGHT_SVG =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/**
 * "Assistente Febal Casa" (the chatbot's own persona name, used everywhere
 * ELSE in the widget) reads oddly as the byline on an exported document
 * representing the STORE's collection, not the assistant's — reported live
 * ("que no diga asistente febal casa solo febal casa"). Strips a leading
 * "Asistente"/"Assistente"/"Assistant" word when present, so this tour's
 * "Assistente Febal Casa" becomes plain "Febal Casa"; a future tour whose
 * assistantName doesn't start with that word is returned unchanged rather
 * than mangled.
 */
function brandName(assistantName: string): string {
  return assistantName.replace(/^(asistente|assistente|assistant)\s+/i, "");
}

function formatExportDate(): string {
  return new Date().toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
}

function buildSummaryText(items: ProductCard[], assistantName: string): string {
  const brand = brandName(assistantName);
  const count = items.length === 1 ? "1 prodotto" : `${items.length} prodotti`;
  const lines = [`La mia collezione — ${brand}`, `${formatExportDate()} · ${count}`, ""];
  items.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.name}`);
    if (item.description) lines.push(`   ${item.description}`);
    if (item.detail_url) lines.push(`   ${item.detail_url}`);
    lines.push("");
  });
  return lines.join("\n").trimEnd();
}

/**
 * Opens a plain, print-ready page and triggers the browser's native print
 * dialog ("Guardar como PDF" is a print-destination on every major
 * browser) — a real PDF download without pulling a PDF-generation library
 * into a browser bundle. `primaryColor` is resolved from the live
 * `--assistant-primary` CSS variable at the call site (see renderPanel) —
 * this print window is a separate, unstyled document with no access to the
 * parent page's stylesheet, so the per-tour brand color has to be passed in
 * as a literal value rather than referenced.
 */
function downloadAsPdf(items: ProductCard[], assistantName: string, primaryColor: string): void {
  const win = window.open("", "_blank");
  if (!win) return;
  const brand = brandName(assistantName);
  const count = items.length === 1 ? "1 prodotto" : `${items.length} prodotti`;
  const rows = items
    .map(
      (item, i) => `
      <div class="item">
        <span class="num">${i + 1}</span>
        <img src="${item.image_url}" alt="">
        <div class="body">
          <strong>${item.name}</strong>
          ${item.section ? `<span class="section">${item.section}</span>` : ""}
          ${item.description ? `<p>${item.description}</p>` : ""}
          ${item.detail_url ? `<a href="${item.detail_url}">Vedi la scheda completa →</a>` : ""}
        </div>
      </div>`
    )
    .join("");
  win.document.write(
    `<!doctype html><html><head><title>La mia collezione — ${brand}</title><meta charset="utf-8"><style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 0; color: #1a1a1a; }
      header { background: ${primaryColor}; color: #fff; padding: 36px 40px; }
      header .brand { font-size: 26px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
      header .subtitle { margin-top: 6px; font-size: 15px; opacity: 0.92; }
      header .meta { margin-top: 14px; font-size: 12.5px; opacity: 0.85; }
      main { padding: 28px 40px 40px; }
      .item { display: flex; gap: 16px; padding: 18px 0; border-bottom: 1px solid #e5e5e5; align-items: flex-start; }
      .item:last-child { border-bottom: none; }
      .num { flex-shrink: 0; width: 22px; font-size: 13px; font-weight: 700; color: ${primaryColor}; padding-top: 2px; }
      img { width: 96px; height: 96px; object-fit: cover; border-radius: 8px; background: #eee; flex-shrink: 0; }
      .body { min-width: 0; }
      .body strong { display: block; font-size: 15.5px; }
      .body .section { display: block; margin-top: 2px; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.03em; }
      .body p { margin: 8px 0 0; font-size: 13px; line-height: 1.5; color: #444; }
      .body a { display: inline-block; margin-top: 8px; font-size: 12.5px; font-weight: 600; color: ${primaryColor}; text-decoration: none; }
      footer { padding: 18px 40px 32px; font-size: 11px; color: #999; }
      @media print { header { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    </style></head><body>
      <header>
        <div class="brand">${brand}</div>
        <div class="subtitle">La mia collezione</div>
        <div class="meta">${formatExportDate()} · ${count}</div>
      </header>
      <main>${rows}</main>
      <footer>${brand}</footer>
    </body></html>`
  );
  win.document.close();
  win.focus();
  win.print();
}

function emailWishlist(items: ProductCard[], assistantName: string): void {
  const body = buildSummaryText(items, assistantName);
  const url = `mailto:?subject=${encodeURIComponent("La mia collezione — " + brandName(assistantName))}&body=${encodeURIComponent(body)}`;
  window.open(url, "_blank");
}

function shareOnWhatsapp(items: ProductCard[], assistantName: string): void {
  const text = buildSummaryText(items, assistantName);
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}

/**
 * Same image/text proportions as the chat's own product card (.tva-product-card:
 * 50%-width image, text filling the other half) per explicit direction — the
 * old layout squeezed the image down to a ~56px thumbnail. No card wrapper
 * here though (also explicit): sits directly on the panel's own background.
 */
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
  goBtn.textContent = "Portami lì";
  goBtn.addEventListener("click", () => deps.tourBridge.navigateTo(item.navTarget));
  body.appendChild(goBtn);
  row.appendChild(body);

  // Small corner badge overlapping the image — same visual treatment as the
  // chat card's own .tva-wishlist-heart — instead of its own flex column.
  const heart = document.createElement("button");
  heart.type = "button";
  heart.className = "tva-wl-item-heart tva-wl-item-heart--saved";
  heart.setAttribute("aria-label", `Rimuovi ${item.name} dalla mia collezione`);
  heart.innerHTML = HEART_SVG;
  heart.addEventListener("click", () => {
    deps.wishlist.remove(item.product_id);
    onChanged();
  });
  row.appendChild(heart);

  return row;
}

/**
 * Recommendations row wrapped with prev/next arrows and manual (pointer)
 * drag-to-scroll — replaces the native horizontal scrollbar entirely
 * (hidden via CSS) per explicit direction: "esa barrita gris se ve
 * horrible." Arrows self-hide at either end; dragging still works with the
 * scrollbar gone since native touch/trackpad scrolling wasn't the issue —
 * a MOUSE click-drag needs this (browsers don't do that natively, only
 * touch/trackpad do).
 */
function createRecommendationsRow(cards: ProductCard[], deps: WishlistLayerDeps): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "tva-wl-rec-wrap";

  const row = document.createElement("div");
  row.className = "tva-wl-rec-row";
  for (const card of cards) row.appendChild(renderRecommendationCard(card, deps));
  wrap.appendChild(row);

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.className = "tva-wl-rec-arrow tva-wl-rec-arrow--prev tva-wl-rec-arrow--hidden";
  prevBtn.setAttribute("aria-label", "Precedente");
  prevBtn.innerHTML = CHEVRON_LEFT_SVG;
  wrap.appendChild(prevBtn);

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.className = "tva-wl-rec-arrow tva-wl-rec-arrow--next";
  nextBtn.setAttribute("aria-label", "Successivo");
  nextBtn.innerHTML = CHEVRON_RIGHT_SVG;
  wrap.appendChild(nextBtn);

  function step(dir: 1 | -1): void {
    const card = row.querySelector<HTMLElement>(".tva-wl-rec-card");
    const width = card ? card.getBoundingClientRect().width + 12 : 108;
    row.scrollBy({ left: dir * width, behavior: "smooth" });
  }
  prevBtn.addEventListener("click", () => step(-1));
  nextBtn.addEventListener("click", () => step(1));

  function syncArrows(): void {
    const maxScroll = row.scrollWidth - row.clientWidth;
    prevBtn.classList.toggle("tva-wl-rec-arrow--hidden", row.scrollLeft <= 1);
    nextBtn.classList.toggle("tva-wl-rec-arrow--hidden", row.scrollLeft >= maxScroll - 1);
  }
  row.addEventListener("scroll", syncArrows);
  // scrollWidth isn't reliable until the row has actually painted its
  // children — one frame is enough for that first "does it even overflow" check.
  requestAnimationFrame(syncArrows);

  // Drag threshold: only commit to "this is a drag" (and only THEN capture
  // the pointer / suppress the click) once the pointer has actually moved a
  // few px. Capturing unconditionally on every pointerdown — an earlier
  // version did — rerouted the pointerup that would normally complete a
  // plain click on a .tva-wl-rec-card button to `row` instead, silently
  // breaking every recommendation card's navigation (reported live: cards
  // stopped taking the visitor anywhere on click).
  const DRAG_THRESHOLD_PX = 5;
  let tracking = false;
  let dragStarted = false;
  let startX = 0;
  let startScrollLeft = 0;
  row.addEventListener("pointerdown", (e) => {
    tracking = true;
    dragStarted = false;
    startX = e.clientX;
    startScrollLeft = row.scrollLeft;
  });
  row.addEventListener("pointermove", (e) => {
    if (!tracking) return;
    const dx = e.clientX - startX;
    if (!dragStarted) {
      if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
      dragStarted = true;
      row.setPointerCapture(e.pointerId);
      row.classList.add("tva-wl-rec-row--dragging");
    }
    row.scrollLeft = startScrollLeft - dx;
  });
  const endDrag = (): void => {
    if (dragStarted) {
      // A real drag just ended — swallow the click it would otherwise fire
      // on whatever card sits under the pointer (one-shot: removes itself).
      const suppressClick = (ev: MouseEvent): void => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      row.addEventListener("click", suppressClick, { capture: true, once: true });
    }
    tracking = false;
    dragStarted = false;
    row.classList.remove("tva-wl-rec-row--dragging");
  };
  row.addEventListener("pointerup", endDrag);
  row.addEventListener("pointercancel", endDrag);

  return wrap;
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
  // No section/room label here — removed per explicit direction ("quitar
  // 'CASA 01' debajo del nombre"); these are compact thumbnails, not the
  // full item rows above, which still show it.

  return el;
}

export function createWishlistLayer(
  deps: WishlistLayerDeps
): { element: HTMLElement; open: () => void; setChatOpen: (next: boolean) => void } {
  const root = document.createElement("div");
  root.className = "tva-wl-root";

  // Declared up here rather than down by renderPanel, where it
  // conceptually belongs — grouped with previewOpen/previewProduct/
  // chatOpen below, the other state syncEntryButtons reads.
  let open = false;

  // Two mutually-exclusive entry points share this top-right spot, never
  // both visible at once:
  //  - previewHeartBtn: a native tour hotspot's own info panel is open
  //    (ANY of them — even ones not yet in the catalog, shown regardless
  //    per explicit direction, see onNativePreviewChange below) — saves
  //    THAT specific product.
  //  - collectionBtn ("Mi colección" pill): the fallback the rest of the
  //    time — opens the panel, same as before.
  // Both hidden the instant either the chat or this panel itself opens.
  let previewOpen = false;
  let previewProduct: HotspotManifestEntry | null = null;
  let chatOpen = false;

  const hotspotOverlay = createHotspotHeartOverlay({
    wishlist: deps.wishlist,
    manifest: deps.manifest,
    onNativePreviewChange: (state) => {
      previewOpen = state.open;
      previewProduct = state.product;
      syncEntryButtons();
    },
  });
  root.appendChild(hotspotOverlay.element);

  const collectionBtn = document.createElement("button");
  collectionBtn.type = "button";
  collectionBtn.className = "tva-wl-toggle";
  collectionBtn.textContent = "La mia collezione";
  root.appendChild(collectionBtn);

  const previewHeartBtn = document.createElement("button");
  previewHeartBtn.type = "button";
  previewHeartBtn.className = "tva-wl-preview-heart tva-wl-preview-heart--hidden";
  previewHeartBtn.setAttribute("aria-label", "Salva nella mia collezione");
  previewHeartBtn.innerHTML = HEART_SVG;
  root.appendChild(previewHeartBtn);

  function syncPreviewHeartVisual(): void {
    const saved = previewProduct ? deps.wishlist.has(previewProduct.product_id) : false;
    previewHeartBtn.classList.toggle("tva-wl-preview-heart--saved", saved);
  }

  previewHeartBtn.addEventListener("click", () => {
    // Hotspot doesn't map to a catalog product yet — the button still
    // shows (explicit direction, see onNativePreviewChange), it just has
    // nothing to save. Silent no-op, not an error state.
    if (!previewProduct) return;
    const p = previewProduct;
    deps.wishlist.toggle({
      product_id: p.product_id,
      name: p.name,
      description: "",
      image_url: p.image_url,
      section: "",
      detail_url: p.detail_url,
      navTarget: { media_name: p.media_name, yaw: p.yaw, pitch: p.pitch, fov: p.fov, hotspot_name: p.hotspot_name },
      alternativesAvailable: false,
    });
    syncPreviewHeartVisual();
  });

  function syncEntryButtons(): void {
    const hideBoth = open || chatOpen;
    collectionBtn.classList.toggle("tva-wl-toggle--hidden", hideBoth || previewOpen);
    previewHeartBtn.classList.toggle("tva-wl-preview-heart--hidden", hideBoth || !previewOpen);
    syncPreviewHeartVisual();
  }

  // Panel
  const panel = document.createElement("aside");
  panel.className = "tva-wl-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "La mia collezione");
  root.appendChild(panel);

  function renderPanel(): void {
    const items = deps.wishlist.getAll();
    panel.innerHTML = "";

    const header = document.createElement("div");
    header.className = "tva-wl-header";
    const titleWrap = document.createElement("div");
    const h2 = document.createElement("h2");
    h2.textContent = "La mia collezione";
    const count = document.createElement("span");
    count.textContent = items.length === 1 ? "1 prodotto salvato" : `${items.length} prodotti salvati`;
    titleWrap.append(h2, count);
    const switchToChatBtn = document.createElement("button");
    switchToChatBtn.type = "button";
    switchToChatBtn.className = "tva-wl-switch-btn";
    switchToChatBtn.setAttribute("aria-label", "Apri assistente");
    switchToChatBtn.textContent = "Assistente";
    switchToChatBtn.addEventListener("click", () => {
      setOpen(false);
      deps.onOpenChat?.();
    });

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "tva-wl-close";
    closeBtn.setAttribute("aria-label", "Chiudi");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => setOpen(false));
    // Grouped together so both sit flush against the right edge, next to
    // each other — header's own justify-content:space-between previously
    // had THREE direct children (titleWrap, switchToChatBtn, closeBtn),
    // which spaced switchToChatBtn evenly in the middle instead (reported
    // live: "Asistente" looked centered rather than beside the close ×).
    const headerActions = document.createElement("div");
    headerActions.className = "tva-wl-header-actions";
    headerActions.append(switchToChatBtn, closeBtn);
    header.append(titleWrap, headerActions);
    panel.appendChild(header);

    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "tva-wl-empty";
      empty.textContent =
        "Non hai ancora salvato nulla. Passa il cursore su qualsiasi prodotto nel tour, oppure usa il cuore nella chat, per iniziare la tua collezione.";
      panel.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "tva-wl-list";
    for (const item of items) list.appendChild(renderItemRow(item, deps, () => renderPanel()));
    panel.appendChild(list);

    // Groups the style section + PDF/mail/WhatsApp actions so they're
    // pinned to the panel's bottom TOGETHER (single margin-top:auto on this
    // wrapper — see .tva-wl-bottom) regardless of whether styleSection ends
    // up removed below (no dominant style, no recommendations).
    const bottom = document.createElement("div");
    bottom.className = "tva-wl-bottom";
    panel.appendChild(bottom);

    const styleSection = document.createElement("div");
    styleSection.className = "tva-wl-style-section";
    const loading = document.createElement("p");
    loading.className = "tva-wl-style-loading";
    loading.textContent = "Analizzando il tuo stile…";
    styleSection.appendChild(loading);
    bottom.appendChild(styleSection);

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
          text.innerHTML = `<strong>Il tuo stile: ${dominantStyle}.</strong> Questo potrebbe piacerti.`;
          label.appendChild(text);
          styleSection.appendChild(label);
        }
        if (cards.length > 0) {
          styleSection.appendChild(createRecommendationsRow(cards, deps));
        } else if (!dominantStyle) {
          styleSection.remove();
        }
      })
      .catch(() => styleSection.remove());

    // No "Ver en el showroom" button — removed per explicit direction: every
    // product's own "Llévame" already does exactly this, one product at a
    // time, which is the only sensible target anyway once there's more than
    // one item saved (this button always just jumped to items[0]).

    const actions = document.createElement("div");
    actions.className = "tva-wl-actions";
    const actionDefs: Array<[string, string, () => void]> = [
      [
        "Scarica PDF",
        "pdf",
        () =>
          downloadAsPdf(
            items,
            deps.assistantName,
            getComputedStyle(panel).getPropertyValue("--assistant-primary").trim() || "#e20613"
          ),
      ],
      ["Invia via email", "mail", () => emailWishlist(items, deps.assistantName)],
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
    bottom.appendChild(actions);
  }

  function setOpen(next: boolean): void {
    open = next;
    panel.classList.toggle("tva-wl-panel--open", open);
    syncEntryButtons();
    if (open) renderPanel();
  }

  collectionBtn.addEventListener("click", () => setOpen(true));

  deps.wishlist.subscribe(() => {
    syncPreviewHeartVisual();
    if (open) renderPanel();
  });

  return {
    element: root,
    open: () => setOpen(true),
    // Called by index.ts whenever the (separately-owned) chat card opens or
    // closes — the only coupling between the two layers besides the shared
    // WishlistState, and only for these buttons' visibility, nothing else.
    setChatOpen: (next: boolean): void => {
      chatOpen = next;
      syncEntryButtons();
    },
  };
}
