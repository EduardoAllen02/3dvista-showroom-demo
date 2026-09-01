/**
 * Renders a small, SAFE subset of markdown the model sometimes uses in its
 * prose (**bold**, [text](url)) as real DOM elements, instead of showing
 * the raw syntax as plain text. Never parses a string as HTML — every
 * fragment is built via createElement/textContent/createTextNode, so no
 * markup the model (or, transitively, the catalog) produces can inject
 * real HTML. `![alt](url)` image syntax is dropped entirely rather than
 * rendered — the product card already carries the real image, and the
 * system prompt tells the model not to repeat it as text (this is just the
 * defense-in-depth backstop for when it slips through anyway).
 */
const TOKEN_RE = /!\[([^\]]*)\]\(([^)]*)\)|\[([^\]]+)\]\(([^)]+)\)|\*\*([^*]+)\*\*/g;

function isSafeHref(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
}

export function renderFormattedText(target: HTMLElement, text: string): void {
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;

  while ((match = TOKEN_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      target.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }

    const [, , , linkText, linkUrl, boldText] = match;
    if (linkText !== undefined && linkUrl !== undefined) {
      if (isSafeHref(linkUrl)) {
        const a = document.createElement("a");
        a.href = linkUrl;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "tva-bubble-link";
        a.textContent = linkText;
        target.appendChild(a);
      } else {
        target.appendChild(document.createTextNode(linkText));
      }
    } else if (boldText !== undefined) {
      const strong = document.createElement("strong");
      strong.textContent = boldText;
      target.appendChild(strong);
    }
    // else: image token — intentionally dropped, nothing appended.

    lastIndex = TOKEN_RE.lastIndex;
  }

  if (lastIndex < text.length) {
    target.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}
