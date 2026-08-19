import type { ProductCard } from "@3dvista-assistant/assistant-core";
import type { TourBridgeStrategy } from "@3dvista-assistant/tour-bridge";

export interface ProductCardHandlers {
  onVerAlternativas: (card: ProductCard) => void;
}

/**
 * Renders a product's INFO ONLY (thumbnail + name + description), as its
 * own message-like element — matches the reference UI's compact horizontal
 * layout (small square image on the left, text on the right). No buttons
 * here; see renderProductActions for those, rendered as a separate element
 * right after. Uses textContent exclusively for catalog-sourced strings —
 * never innerHTML — as defense in depth even though the backend already
 * strips raw HTML/JS at validation time.
 */
export function renderProductInfo(card: ProductCard): HTMLElement {
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

  const altBtn = document.createElement("button");
  altBtn.type = "button";
  altBtn.textContent = "Ver alternativas";
  altBtn.addEventListener("click", () => handlers.onVerAlternativas(card));

  actions.append(goBtn, altBtn);
  return actions;
}
