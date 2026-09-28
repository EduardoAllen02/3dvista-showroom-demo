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
  save: { it: "Salva nella mia collezione", es: "Guardar en mi colección", en: "Save to my collection" },
  unsave: { it: "Rimuovi dalla mia collezione", es: "Quitar de mi colección", en: "Remove from my collection" },
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

let current: UiLang = "it";

export function uiLang(): UiLang {
  return current;
}

/** Returns true when the language actually changed (the caller re-renders). */
export function setUiLang(lang: string | undefined | null): boolean {
  if (lang !== "it" && lang !== "es" && lang !== "en") return false;
  if (lang === current) return false;
  current = lang;
  return true;
}

export function t(key: keyof typeof TEXT): string {
  return TEXT[key][current];
}

export function chipText(configured: string): string {
  return CHIPS[configured]?.[current] ?? configured;
}
