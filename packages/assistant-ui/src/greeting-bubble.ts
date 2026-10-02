import { t } from "./ui-text.js";

export interface GreetingBubble {
  element: HTMLElement;
  /** Pops in and types its text; no-op once dismissed or already shown. */
  show(): void;
  /** Gone for the rest of this page load. */
  dismiss(): void;
}

const TYPE_MS = 35;
const POP_MS = 380;

/**
 * "¡Hola! Soy tu asistente virtual": a speech bubble next to the chat button, shown once after the
 * visitor enters the tour. It pops in, types its text, and stays until the chat is opened; a click
 * on it opens the chat. The full text sits invisibly underneath the typed one, so the bubble has
 * its final size from the first frame instead of growing letter by letter.
 */
export function createGreetingBubble(onOpen: () => void): GreetingBubble {
  const el = document.createElement("button");
  el.type = "button";
  el.className = "tva-greeting";
  el.hidden = true;
  const sizer = document.createElement("span");
  sizer.className = "tva-greeting-sizer";
  sizer.setAttribute("aria-hidden", "true");
  const typed = document.createElement("span");
  typed.className = "tva-greeting-typed";
  typed.setAttribute("aria-hidden", "true");
  el.append(sizer, typed);
  el.addEventListener("click", onOpen);

  let dismissed = false;
  let timer: number | undefined;

  function show(): void {
    if (dismissed || !el.hidden) return;
    const full = t("greeting");
    el.setAttribute("aria-label", full);
    sizer.textContent = full;
    el.hidden = false;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      typed.textContent = full;
      el.classList.add("tva-greeting--done");
      return;
    }
    el.classList.add("tva-greeting--in");
    let i = 0;
    const typeNext = (): void => {
      if (dismissed) return;
      typed.textContent = full.slice(0, ++i);
      if (i < full.length) timer = window.setTimeout(typeNext, TYPE_MS);
      else el.classList.add("tva-greeting--done");
    };
    timer = window.setTimeout(typeNext, POP_MS);
  }

  function dismiss(): void {
    dismissed = true;
    window.clearTimeout(timer);
    el.remove();
  }

  return { element: el, show, dismiss };
}
