/**
 * Every client-facing string of the moodboard. Italian is the default (the
 * Febal tour's UI language, same as the wishlist panel); Spanish and English
 * are ready for the web platform's other tours. Override any subset through
 * createMoodboard's `strings`.
 */
export interface MoodboardStrings {
  dialogLabel: string;
  title: string;
  styleLabel: string;
  close: string;
  downloadPdf: string;
  goTo: string;
  composing: string;
  painting: string;
  retry: string;
  errorGeneric: string;
  errorBusy: string;
  errorUnavailable: string;
  noStyle: string;
  paletteHeading: string;
  materialsHeading: string;
  inspiredBy: string;
  pdfSubtitle: string;
  dateLocale: string;
}

export const STRINGS_IT: MoodboardStrings = {
  dialogLabel: "La tua moodboard",
  title: "La tua moodboard",
  styleLabel: "Il tuo stile",
  close: "Chiudi",
  downloadPdf: "Scarica PDF",
  goTo: "Portami lì",
  composing: "Stiamo componendo la tua moodboard…",
  painting: "Stiamo creando le texture dei materiali…",
  retry: "Riprova",
  errorGeneric: "Non siamo riusciti a completare la moodboard. Riprova tra qualche istante.",
  errorBusy: "Hai creato molte moodboard in poco tempo. Riprova più tardi.",
  errorUnavailable: "La moodboard non è disponibile in questo momento.",
  noStyle: "Salva qualche prodotto nella tua collezione per scoprire il tuo stile e creare la tua moodboard.",
  paletteHeading: "Palette",
  materialsHeading: "Materiali",
  inspiredBy: "Ispirata a",
  pdfSubtitle: "La mia moodboard",
  dateLocale: "it-IT",
};

export const STRINGS_ES: MoodboardStrings = {
  dialogLabel: "Tu moodboard",
  title: "Tu moodboard",
  styleLabel: "Tu estilo",
  close: "Cerrar",
  downloadPdf: "Descargar PDF",
  goTo: "Llévame",
  composing: "Estamos componiendo tu moodboard…",
  painting: "Estamos creando las texturas de los materiales…",
  retry: "Reintentar",
  errorGeneric: "No pudimos completar el moodboard. Inténtalo de nuevo en unos instantes.",
  errorBusy: "Has creado muchos moodboards en poco tiempo. Inténtalo más tarde.",
  errorUnavailable: "El moodboard no está disponible en este momento.",
  noStyle: "Guarda algunos productos en tu colección para descubrir tu estilo y crear tu moodboard.",
  paletteHeading: "Paleta",
  materialsHeading: "Materiales",
  inspiredBy: "Inspirado en",
  pdfSubtitle: "Mi moodboard",
  dateLocale: "es-ES",
};

export const STRINGS_EN: MoodboardStrings = {
  dialogLabel: "Your moodboard",
  title: "Your moodboard",
  styleLabel: "Your style",
  close: "Close",
  downloadPdf: "Download PDF",
  goTo: "Take me there",
  composing: "Composing your moodboard…",
  painting: "Creating the material textures…",
  retry: "Try again",
  errorGeneric: "We couldn't complete your moodboard. Please try again in a moment.",
  errorBusy: "You've created many moodboards in a short time. Please try again later.",
  errorUnavailable: "The moodboard isn't available right now.",
  noStyle: "Save a few products to your collection to discover your style and create your moodboard.",
  paletteHeading: "Palette",
  materialsHeading: "Materials",
  inspiredBy: "Inspired by",
  pdfSubtitle: "My moodboard",
  dateLocale: "en-GB",
};
