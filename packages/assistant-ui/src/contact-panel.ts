import { t } from "./ui-text.js";

/**
 * "Contáctame" inside the wishlist panel: the visitor finds the nearest store by postcode (CAP),
 * leaves name, surname and email, reads the privacy notice, and sends the list to that store and
 * to themselves.
 *
 * DEMO (proof of concept): nothing is sent and the store is a stand-in. What is real is the map:
 * Google Maps' public embed searching "Febal Casa" near that CAP. To go live:
 * - the store list: febalcasa.com/it/stores loads it by JS; nearest one by CAP coordinates;
 * - the sending: a backend route that mails the list to the store's sales team and to the visitor;
 * - the privacy notice text (lorem ipsum here) and, for marketing, a separate optional checkbox.
 */

/** Stand-in for the nearest store until the real store list is connected. */
export const DEMO_STORE = { name: "Febal Casa Store", address: "Via Esempio 1" };

export interface ContactState {
  step: "form" | "sent";
  cap: string;
  /** The CAP the store and the map were looked up for; null until the visitor searches. */
  searchedCap: string | null;
  mapOpen: boolean;
  firstName: string;
  lastName: string;
  email: string;
  privacy: boolean;
  privacyOpen: boolean;
  errors: Partial<Record<"cap" | "firstName" | "lastName" | "email" | "privacy", string>>;
}

export function newContactState(): ContactState {
  return { step: "form", cap: "", searchedCap: null, mapOpen: true, firstName: "", lastName: "", email: "", privacy: false, privacyOpen: false, errors: {} };
}

export interface ContactViewDeps {
  itemCount: number;
  /** Back to the list; `sent` → the form starts over next time. */
  onBack: (sent: boolean) => void;
  /** Re-render after a change of step or of what is shown. */
  onChange: () => void;
}

const CHEVRON_LEFT =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEVRON_DOWN =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 9l7 7 7-7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PIN =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="9.5" r="2.5" stroke="currentColor" stroke-width="1.8"/></svg>';
const CHECK =
  '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.8"/><path d="m7.5 12.5 3 3 6-6.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const LOREM = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Integer posuere erat a ante venenatis dapibus posuere velit aliquet.",
  "Titolare del trattamento: lorem ipsum. Finalità: lorem ipsum dolor sit amet. Base giuridica: lorem ipsum. Conservazione: lorem ipsum.",
  "Diritti dell'interessato (artt. 15-22 GDPR): lorem ipsum dolor sit amet, consectetur adipiscing elit. Nulla vitae elit libero, a pharetra augue.",
];

// Google Maps' public embed (no API key), at its final address: the short maps.google.com/maps?…
// &output=embed form answers with a redirect that carries X-Frame-Options and can end up blank.
const mapUrl = (cap: string): string =>
  `https://www.google.com/maps/embed?origin=mfe&pb=!1m3!2m1!1s${encodeURIComponent(`Febal Casa ${cap} Italia`).replace(/%20/g, "+")}!6i11`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function field(
  label: string,
  input: HTMLInputElement,
  error: string | undefined
): HTMLElement {
  const wrap = el("label", "tva-ct-field");
  wrap.append(el("span", "tva-ct-label", label), input);
  if (error) {
    input.setAttribute("aria-invalid", "true");
    wrap.append(el("span", "tva-ct-error", error));
  }
  return wrap;
}

function textInput(type: string, value: string, onInput: (v: string) => void, autocomplete: string): HTMLInputElement {
  const input = el("input", "tva-ct-input");
  input.type = type;
  input.value = value;
  input.autocomplete = autocomplete as AutoFill;
  input.addEventListener("input", () => onInput(input.value));
  return input;
}

/** Renders the contact view (form, or confirmation) into the panel, from `state`. */
export function renderContactView(panel: HTMLElement, state: ContactState, deps: ContactViewDeps): void {
  const root = el("div", "tva-ct");

  const header = el("div", "tva-ct-header");
  const back = el("button", "tva-ct-back");
  back.type = "button";
  back.innerHTML = CHEVRON_LEFT;
  back.append(t("collection"));
  back.addEventListener("click", () => deps.onBack(state.step === "sent"));
  header.append(back);
  root.append(header);

  if (state.step === "sent") {
    const done = el("div", "tva-ct-sent");
    const icon = el("span", "tva-ct-sent-icon");
    icon.innerHTML = CHECK;
    // The store by name and street only: the CAP stays in the search box.
    const storeName = `${DEMO_STORE.name}, ${DEMO_STORE.address}`;
    done.append(
      icon,
      el("h2", "tva-ct-title", t("contactSentTitle", { name: state.firstName.trim() })),
      el("p", "tva-ct-text", t(deps.itemCount === 1 ? "contactSentBodyOne" : "contactSentBody", { n: deps.itemCount, email: state.email.trim(), store: storeName })),
    );
    const again = el("button", "tva-ct-submit", t("backToList"));
    again.type = "button";
    again.addEventListener("click", () => deps.onBack(true));
    done.append(again);
    root.append(done);
    panel.append(root);
    return;
  }

  root.append(el("h2", "tva-ct-title", t("contactTitle")));

  // 1) Nearest store by CAP
  const storeBox = el("section", "tva-ct-section");
  storeBox.append(el("p", "tva-ct-text", t("contactStoreIntro")));
  const capRow = el("div", "tva-ct-cap-row");
  const cap = textInput("text", state.cap, (v) => (state.cap = v), "postal-code");
  cap.inputMode = "numeric";
  cap.maxLength = 5;
  cap.placeholder = t("capPlaceholder");
  cap.setAttribute("aria-label", t("capPlaceholder"));
  const search = el("button", "tva-ct-search", t("search"));
  search.type = "button";
  const doSearch = (): void => {
    const value = state.cap.trim();
    if (!/^\d{5}$/.test(value)) {
      state.errors.cap = t("capInvalid");
    } else {
      delete state.errors.cap;
      state.searchedCap = value;
      state.mapOpen = true;
    }
    deps.onChange();
  };
  search.addEventListener("click", doSearch);
  cap.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });
  capRow.append(cap, search);
  storeBox.append(capRow);
  if (state.errors.cap) {
    cap.setAttribute("aria-invalid", "true");
    storeBox.append(el("span", "tva-ct-error", state.errors.cap));
  }

  if (state.searchedCap) {
    const store = el("div", "tva-ct-store");
    const pin = el("span", "tva-ct-store-pin");
    pin.innerHTML = PIN;
    const info = el("div", "tva-ct-store-info");
    info.append(
      el("span", "tva-ct-store-kicker", t("nearestStore")),
      el("strong", "tva-ct-store-name", DEMO_STORE.name),
      el("span", "tva-ct-store-address", DEMO_STORE.address),
    );
    store.append(pin, info);
    storeBox.append(store);

    const toggle = el("button", `tva-ct-map-toggle${state.mapOpen ? " tva-ct-map-toggle--open" : ""}`);
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", String(state.mapOpen));
    toggle.append(state.mapOpen ? t("hideMap") : t("showMap"));
    toggle.insertAdjacentHTML("beforeend", CHEVRON_DOWN);
    toggle.addEventListener("click", () => {
      state.mapOpen = !state.mapOpen;
      deps.onChange();
    });
    storeBox.append(toggle);
    if (state.mapOpen) {
      const frame = el("iframe", "tva-ct-map");
      frame.src = mapUrl(state.searchedCap);
      frame.title = t("nearestStore");
      frame.loading = "lazy";
      frame.referrerPolicy = "no-referrer-when-downgrade";
      storeBox.append(frame);
    }
  }
  root.append(storeBox);

  // 2) Visitor's details
  const form = el("form", "tva-ct-section tva-ct-form");
  form.noValidate = true;
  const names = el("div", "tva-ct-names");
  names.append(
    field(t("firstName"), textInput("text", state.firstName, (v) => (state.firstName = v), "given-name"), state.errors.firstName),
    field(t("lastName"), textInput("text", state.lastName, (v) => (state.lastName = v), "family-name"), state.errors.lastName),
  );
  form.append(names, field(t("email"), textInput("email", state.email, (v) => (state.email = v), "email"), state.errors.email));

  const consent = el("label", "tva-ct-consent");
  const box = el("input");
  box.type = "checkbox";
  box.checked = state.privacy;
  box.addEventListener("change", () => (state.privacy = box.checked));
  const consentText = el("span");
  const link = el("button", "tva-ct-link", t("privacyLink"));
  link.type = "button";
  link.addEventListener("click", (e) => {
    e.preventDefault();
    state.privacyOpen = true;
    deps.onChange();
  });
  consentText.append(t("privacyBefore"), link);
  consent.append(box, consentText);
  form.append(consent);
  if (state.errors.privacy) form.append(el("span", "tva-ct-error", state.errors.privacy));
  form.append(el("p", "tva-ct-note", t("privacyNote")));

  const submit = el("button", "tva-ct-submit", t("sendList"));
  submit.type = "submit";
  form.append(submit);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const errors: ContactState["errors"] = {};
    if (!state.searchedCap) errors.cap = t("capRequired");
    if (!state.firstName.trim()) errors.firstName = t("required");
    if (!state.lastName.trim()) errors.lastName = t("required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.email.trim())) errors.email = t("emailInvalid");
    if (!state.privacy) errors.privacy = t("privacyRequired");
    state.errors = errors;
    // Demo: a valid form only shows the confirmation; nothing is sent anywhere.
    if (Object.keys(errors).length === 0) state.step = "sent";
    deps.onChange();
  });
  root.append(form);

  if (state.privacyOpen) {
    const modal = el("div", "tva-ct-modal");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", t("privacyTitle"));
    const sheet = el("div", "tva-ct-modal-sheet");
    const close = el("button", "tva-ct-modal-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", t("close"));
    close.addEventListener("click", () => {
      state.privacyOpen = false;
      deps.onChange();
    });
    sheet.append(close, el("h3", "tva-ct-modal-title", t("privacyTitle")), ...LOREM.map((p) => el("p", "tva-ct-text", p)));
    modal.append(sheet);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        state.privacyOpen = false;
        deps.onChange();
      }
    });
    root.append(modal);
  }

  panel.append(root);
}
