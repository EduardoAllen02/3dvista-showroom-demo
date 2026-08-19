/**
 * Lowercase + strip diacritics + naive Spanish plural stemming, used only for
 * matching. Never used for display — display always uses the original field value.
 */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

export function stem(word: string): string {
  const n = normalize(word);
  if (n.endsWith("ces")) return n.slice(0, -3) + "z";
  if (n.length > 4 && (n.endsWith("es") || n.endsWith("as") || n.endsWith("os"))) {
    return n.slice(0, -2);
  }
  if (n.length > 3 && n.endsWith("s")) return n.slice(0, -1);
  return n;
}

export function tokenize(input: string): string[] {
  return normalize(input)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
