/**
 * Deliberately holds NO open/closed state of its own. An earlier version
 * tracked a local `open` boolean and called `onToggle(open)` with it — that
 * desynced the moment the card was closed via its OWN close button instead
 * of the launcher (the launcher's local `open` stayed `true`, so the next
 * launcher click flipped it to `false` and closed an already-closed card;
 * only the click after THAT actually reopened it — the reported "needs two
 * taps" bug). The card (chat-card.ts) is the single source of truth for
 * open/closed; this button just asks it to toggle.
 */
export function createLauncher(onClick: () => void): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "tva-launcher";
  button.setAttribute("aria-label", "Abrir o cerrar asistente");
  button.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    '<path d="M4 12a8 8 0 1 1 3.2 6.4L4 20l1.2-3.4A7.96 7.96 0 0 1 4 12Z" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>' +
    "</svg>";

  button.addEventListener("click", onClick);

  return button;
}
