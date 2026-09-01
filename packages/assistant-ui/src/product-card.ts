import type { ProductCard } from "@3dvista-assistant/assistant-core";
import type { TourBridgeStrategy } from "@3dvista-assistant/tour-bridge";

export interface ProductCardHandlers {
  onVerAlternativas: (card: ProductCard) => void;
  isWishlisted: (productId: string) => boolean;
  onToggleWishlist: (card: ProductCard) => void;
  /** Called when "Ver ficha" is clicked — should open the product's info panel in the tour. */
  onVerFicha?: (card: ProductCard) => void;
}

/**
 * Trims a product description down to a short ~3-word teaser line for the
 * card (the reference UI shows a brief spec-like line, not the full
 * description — the full text is still available via "Ver ficha").
 */
function shortDescription(description: string, wordCount = 3): string {
  const words = description.trim().split(/\s+/).slice(0, wordCount);
  return words.join(" ") + (description.trim().split(/\s+/).length > wordCount ? "…" : "");
}

/**
 * Renders a product's INFO ONLY (larger thumbnail + name + short teaser +
 * "Ver ficha" link), as its own message-like element — matches the
 * reference UI's horizontal layout (image on the left, text on the right).
 * No action buttons here; see renderProductActions for those, rendered as a
 * separate element right after. Uses textContent exclusively for
 * catalog-sourced strings — never innerHTML — as defense in depth even
 * though the backend already strips raw HTML/JS at validation time.
 */
export function renderProductInfo(card: ProductCard, handlers: ProductCardHandlers): HTMLElement {
  const el = document.createElement("div");
  el.className = "tva-product-card";

  const heartBtn = document.createElement("button");
  heartBtn.type = "button";
  heartBtn.className = "tva-wishlist-heart";
  const syncHeart = (saved: boolean): void => {
    heartBtn.classList.toggle("tva-wishlist-heart--saved", saved);
    heartBtn.setAttribute("aria-pressed", String(saved));
    heartBtn.setAttribute("aria-label", saved ? "Quitar de mi colección" : "Guardar en mi colección");
  };
  syncHeart(handlers.isWishlisted(card.product_id));
  heartBtn.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M12 20.5s-7.5-4.8-10-9.4C.5 7.8 2.3 4.5 5.6 4c2-.3 3.9.6 5 2.2C11.7 4.6 13.6 3.7 15.6 4c3.3.5 5.1 3.8 3.6 7.1-2.5 4.6-10 9.4-10 9.4Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>' +
    "</svg>";
  heartBtn.addEventListener("click", () => {
    handlers.onToggleWishlist(card);
    syncHeart(handlers.isWishlisted(card.product_id));
  });
  el.appendChild(heartBtn);

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
  desc.textContent = shortDescription(card.description);
  body.append(title, desc);

  if (card.detail_url || handlers.onVerFicha) {
    const fichaBtn = document.createElement("button");
    fichaBtn.type = "button";
    fichaBtn.className = "tva-product-card-link";
    fichaBtn.textContent = "Ver ficha ›";
    fichaBtn.addEventListener("click", () => {
      if (handlers.onVerFicha) {
        handlers.onVerFicha(card);
      } else if (card.detail_url) {
        window.open(card.detail_url, "_blank", "noopener,noreferrer");
      }
    });
    body.appendChild(fichaBtn);
  }

  el.appendChild(body);

  return el;
}

/**
 * Renders the "Llévame" / "Ver alternativas" action buttons for a proposed
 * product — a separate element from the info card above, ~80% width and
 * centered (matches the reference), stacked. Only ever attached to
 * PROPOSAL cards (get_product/get_alternatives) — navigate_to_product
 * results carry no card/buttons at all (see assistant-core's ProductCard
 * doc comment for why).
 */
export function renderProductActions(
  card: ProductCard,
  tourBridge: TourBridgeStrategy,
  handlers: ProductCardHandlers
): HTMLElement {
  const actions = document.createElement("div");
  actions.className = "tva-product-actions";

  const goBtn = document.createElement("button");
  goBtn.type = "button";
  goBtn.className = "tva-primary";
  goBtn.textContent = "Llévame";
  goBtn.addEventListener("click", () => {
    // The nav target was already resolved server-side from the validated
    // catalog — this button only ever plays back coordinates the backend
    // returned, it never computes or accepts model-authored coordinates.
    tourBridge.navigateTo(card.navTarget);
  });

  actions.appendChild(goBtn);

  // Only a fresh single-product proposal offers this — a card that is
  // itself already one of the revealed alternatives doesn't get its own
  // "more alternatives" button (see ProductCard.alternativesAvailable).
  if (card.alternativesAvailable) {
    const altBtn = document.createElement("button");
    altBtn.type = "button";
    altBtn.textContent = "Ver alternativas";
    altBtn.addEventListener("click", () => handlers.onVerAlternativas(card));
    actions.appendChild(altBtn);
  }

  return actions;
}
