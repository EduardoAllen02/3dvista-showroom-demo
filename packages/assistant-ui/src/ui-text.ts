/**
 * The widget's own words (buttons, placeholder, errors) follow the language of the
 * conversation: Italian until the backend reports another one (`lang` in the chat
 * response), so a visitor who writes in Spanish gets "Llévame", not "Portami lì".
 */
export type UiLang = "it" | "es" | "en";

const TEXT = {
  subtitle: { it: "Il tuo consulente d'arredamento", es: "Tu asesor de interiorismo", en: "Your interior design advisor" },
  myList: { it: "La mia lista", es: "Mi lista", en: "My list" },
  openMyList: { it: "Apri la mia lista", es: "Abrir mi lista", en: "Open my list" },
  close: { it: "Chiudi", es: "Cerrar", en: "Close" },
  takeMe: { it: "Portami lì", es: "Llévame", en: "Take me there" },
  alternatives: { it: "Vedi alternative", es: "Ver alternativas", en: "See alternatives" },
  alternativesTo: { it: "Alternative a", es: "Alternativas a", en: "Alternatives to" },
  officialSite: { it: "Sito ufficiale ↗", es: "Sitio oficial ↗", en: "Official site ↗" },
  placeholder: { it: "Scrivi la tua domanda...", es: "Escribe tu pregunta...", en: "Type your question..." },
  messageLabel: { it: "Messaggio per l'assistente", es: "Mensaje para el asistente", en: "Message to the assistant" },
  send: { it: "Invia", es: "Enviar", en: "Send" },
  suggestions: { it: "Suggerimenti:", es: "Sugerencias:", en: "Suggestions:" },
  save: { it: "Salva nella mia collezione", es: "Guardar en mi lista", en: "Save to my list" },
  unsave: { it: "Rimuovi dalla mia collezione", es: "Quitar de mi lista", en: "Remove from my list" },
  // "Mi lista" panel (wishlist layer) and what it exports
  collection: { it: "La mia collezione", es: "Mi lista", en: "My list" },
  savedOne: { it: "1 prodotto salvato", es: "1 producto guardado", en: "1 saved item" },
  savedMany: { it: "{n} prodotti salvati", es: "{n} productos guardados", en: "{n} saved items" },
  itemsOne: { it: "1 prodotto", es: "1 producto", en: "1 item" },
  itemsMany: { it: "{n} prodotti", es: "{n} productos", en: "{n} items" },
  assistant: { it: "Assistente", es: "Asistente", en: "Assistant" },
  openAssistant: { it: "Apri assistente", es: "Abrir asistente", en: "Open assistant" },
  removeItem: { it: "Rimuovi {name} dalla mia collezione", es: "Quitar {name} de mi lista", en: "Remove {name} from my list" },
  emptyList: {
    it: "Non hai ancora salvato nulla. Passa il cursore su qualsiasi prodotto nel tour, oppure usa il cuore nella chat, per iniziare la tua collezione.",
    es: "Todavía no has guardado nada. Pasa el cursor sobre cualquier producto del tour, o usa el corazón del chat, para empezar tu lista.",
    en: "You haven't saved anything yet. Hover over any product in the tour, or use the heart in the chat, to start your list.",
  },
  analyzingStyle: { it: "Analizzando il tuo stile…", es: "Analizando tu estilo…", en: "Looking at your style…" },
  yourStyle: { it: "Il tuo stile:", es: "Tu estilo:", en: "Your style:" },
  mightLike: { it: "Questo potrebbe piacerti.", es: "Esto te puede gustar.", en: "You might like this." },
  downloadPdf: { it: "Scarica PDF", es: "Descargar PDF", en: "Download PDF" },
  sendEmail: { it: "Invia via email", es: "Enviar por correo", en: "Send by email" },
  fullPage: { it: "Vedi la scheda completa →", es: "Ver la ficha completa →", en: "See the full product page →" },
  previous: { it: "Precedente", es: "Anterior", en: "Previous" },
  next: { it: "Successivo", es: "Siguiente", en: "Next" },
  toggleAssistant: { it: "Apri o chiudi l'assistente", es: "Abrir o cerrar el asistente", en: "Open or close the assistant" },
  createMoodboard: { it: "Crea la tua moodboard", es: "Crea tu moodboard", en: "Create your moodboard" },
  greeting: { it: "Ciao! Sono il tuo assistente virtuale.", es: "¡Hola! Soy tu asistente virtual.", en: "Hi! I'm your virtual assistant." },
  // "Contáctame" (wishlist panel)
  contactMe: { it: "Contattami", es: "Contáctame", en: "Contact me" },
  contactTitle: { it: "Contattami", es: "Contáctame", en: "Contact me" },
  contactStoreIntro: {
    it: "Ti cerchiamo il negozio Febal Casa più vicino.",
    es: "Te buscamos la tienda Febal Casa más cercana.",
    en: "We'll find the Febal Casa store nearest to you.",
  },
  capPlaceholder: { it: "Il tuo CAP", es: "Tu código postal", en: "Your postcode" },
  search: { it: "Cerca", es: "Buscar", en: "Search" },
  capInvalid: { it: "Inserisci un CAP di 5 cifre.", es: "Escribe un código postal de 5 cifras.", en: "Enter a 5-digit postcode." },
  capRequired: { it: "Cerca prima il negozio più vicino.", es: "Busca primero tu tienda más cercana.", en: "Find your nearest store first." },
  nearestStore: { it: "Il negozio più vicino", es: "Tu tienda más cercana", en: "Your nearest store" },
  showMap: { it: "Mostra mappa", es: "Ver mapa", en: "Show map" },
  hideMap: { it: "Nascondi mappa", es: "Ocultar mapa", en: "Hide map" },
  firstName: { it: "Nome", es: "Nombre", en: "First name" },
  lastName: { it: "Cognome", es: "Apellido", en: "Last name" },
  email: { it: "Email", es: "Correo", en: "Email" },
  privacyBefore: { it: "Ho letto l'", es: "He leído la ", en: "I have read the " },
  privacyLink: { it: "informativa privacy", es: "información sobre privacidad", en: "privacy notice" },
  privacyNote: {
    it: "Useremo i tuoi dati solo per rispondere alla tua richiesta.",
    es: "Usaremos tus datos solo para responder a tu solicitud.",
    en: "We'll only use your details to answer your request.",
  },
  privacyRequired: { it: "Conferma di aver letto l'informativa privacy.", es: "Confirma que leíste la información sobre privacidad.", en: "Please confirm you've read the privacy notice." },
  privacyTitle: { it: "Informativa privacy (art. 13 GDPR)", es: "Información sobre privacidad (art. 13 RGPD)", en: "Privacy notice (Art. 13 GDPR)" },
  required: { it: "Campo obbligatorio.", es: "Campo obligatorio.", en: "Required." },
  emailInvalid: { it: "Email non valida.", es: "Correo no válido.", en: "Invalid email." },
  sendList: { it: "Invia la mia lista", es: "Enviar mi lista", en: "Send my list" },
  contactSentTitle: { it: "Fatto, {name}!", es: "¡Listo, {name}!", en: "Done, {name}!" },
  contactSentBody: {
    it: "La tua lista di {n} prodotti arriverà a {email} e a {store}. Un consulente ti contatterà a breve.",
    es: "Tu lista de {n} productos llegará a {email} y a {store}. Un asesor te contactará pronto.",
    en: "Your list of {n} items will reach {email} and {store}. An adviser will be in touch soon.",
  },
  contactSentBodyOne: {
    it: "La tua lista con 1 prodotto arriverà a {email} e a {store}. Un consulente ti contatterà a breve.",
    es: "Tu lista con 1 producto llegará a {email} y a {store}. Un asesor te contactará pronto.",
    en: "Your list with 1 item will reach {email} and {store}. An adviser will be in touch soon.",
  },
  backToList: { it: "Torna alla mia lista", es: "Volver a mi lista", en: "Back to my list" },
  error: {
    it: "Mi dispiace, ho avuto un problema nel rispondere. Riprova tra un momento.",
    es: "Lo siento, tuve un problema al responder. Inténtalo de nuevo en un momento.",
    en: "Sorry, I had a problem answering. Please try again in a moment.",
  },
} satisfies Record<string, Record<UiLang, string>>;

// The configured suggestion chips are Italian category names; shown in the conversation's language.
const CHIPS: Record<string, Record<UiLang, string>> = {
  Divani: { it: "Divani", es: "Sofás", en: "Sofas" },
  Cucine: { it: "Cucine", es: "Cocinas", en: "Kitchens" },
  Armadi: { it: "Armadi", es: "Armarios", en: "Wardrobes" },
  Tavoli: { it: "Tavoli", es: "Mesas", en: "Tables" },
  Letti: { it: "Letti", es: "Camas", en: "Beds" },
  Sedie: { it: "Sedie", es: "Sillas", en: "Chairs" },
};

// The wishlist's style vocabulary (scripts/enrich-febal-style-compat.mjs) is Italian.
const STYLES: Record<string, Record<UiLang, string>> = {
  Minimal: { it: "Minimal", es: "Minimalista", en: "Minimal" },
  Contemporaneo: { it: "Contemporaneo", es: "Contemporáneo", en: "Contemporary" },
  "Classico elegante": { it: "Classico elegante", es: "Clásico elegante", en: "Classic and elegant" },
  "Caldo accogliente": { it: "Caldo accogliente", es: "Cálido y acogedor", en: "Warm and cosy" },
};

/** A style of the wishlist ("Caldo accogliente") in the conversation's language. */
export function styleLabel(style: string): string {
  return STYLES[style]?.[current] ?? style;
}

let current: UiLang = "it";
const listeners: (() => void)[] = [];

export function uiLang(): UiLang {
  return current;
}

/** Date format of the conversation's language (the exported list's header). */
export function uiLocale(): string {
  return { it: "it-IT", es: "es-ES", en: "en-GB" }[current];
}

/** Other parts of the widget (the "Mi lista" panel) re-label themselves when the language changes. */
export function onUiLangChange(fn: () => void): void {
  listeners.push(fn);
}

/** Returns true when the language actually changed (the caller re-renders). */
export function setUiLang(lang: string | undefined | null): boolean {
  if (lang !== "it" && lang !== "es" && lang !== "en") return false;
  if (lang === current) return false;
  current = lang;
  for (const fn of listeners) fn();
  return true;
}

/** `vars` fills "{n}"-style slots ("{n} productos guardados"). */
export function t(key: keyof typeof TEXT, vars: Record<string, string | number> = {}): string {
  return TEXT[key][current].replace(/\{(\w+)\}/g, (whole, k: string) => (k in vars ? String(vars[k]) : whole));
}

export function chipText(configured: string): string {
  return CHIPS[configured]?.[current] ?? configured;
}
