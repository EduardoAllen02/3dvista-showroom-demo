export interface PrintableMoodboard {
  brand: string;
  subtitle: string;
  date: string;
  title: string;
  styleLabel: string;
  style: string;
  motto: string[];
  description: string;
  palette: Array<{ hex: string; name: string }>;
  anchors: Array<{ name: string; src: string | null }>;
  textures: Array<{ material: string; src: string | null; fallbackHex: string }>;
  inspiredBy: string;
  accent: string;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/**
 * Opens a print-ready copy of the moodboard and triggers the browser's print
 * dialog ("Save as PDF" is a print destination everywhere): a real PDF
 * without shipping a PDF library, same approach as the wishlist's own PDF.
 * Unlike that one, it waits for the images: a moodboard printed before its
 * textures load is just empty boxes. Every text is escaped: motto,
 * description and names come from a model and from the catalog.
 */
export function printMoodboard(m: PrintableMoodboard): void {
  const win = window.open("", "_blank");
  if (!win) return;
  const accent = /^#[0-9a-f]{6}$/i.test(m.accent) ? m.accent : "#E20613";
  const heroes = m.anchors
    .map((a) =>
      a.src
        ? `<figure><img src="${esc(a.src)}" alt=""><figcaption>${esc(a.name)}</figcaption></figure>`
        : `<figure class="card"><span>${esc(a.name)}</span></figure>`
    )
    .join("");
  const textures = m.textures
    .map(
      (t) =>
        `<figure>${t.src ? `<img src="${esc(t.src)}" alt="">` : `<div class="swatch" style="background:${esc(t.fallbackHex)}"></div>`}<figcaption>${esc(t.material)}</figcaption></figure>`
    )
    .join("");
  const palette = m.palette
    .map((c) => `<li><span style="background:${esc(c.hex)}"></span>${esc(c.name)}</li>`)
    .join("");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.subtitle)} · ${esc(m.brand)}</title><style>
    * { box-sizing: border-box; }
    @page { size: A4 landscape; margin: 12mm; }
    body { margin: 0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0A0C06; background: #FBFAF6; }
    header { display: flex; justify-content: space-between; align-items: baseline; padding: 0 0 10px; border-bottom: 2px solid ${accent}; }
    header .brand { font-size: 13px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: ${accent}; }
    header .meta { font-size: 11px; color: #5C5C55; }
    .head { display: flex; justify-content: space-between; gap: 24px; margin: 18px 0 14px; }
    h1 { margin: 0; font-size: 26px; letter-spacing: .04em; text-transform: uppercase; }
    .style { margin: 6px 0 0; font-size: 14px; color: #5C5C55; }
    .style strong { color: ${accent}; text-transform: uppercase; letter-spacing: .04em; }
    blockquote { margin: 0; max-width: 45%; text-align: right; font: italic 15px/1.5 Georgia, "Times New Roman", serif; color: #5C5C55; }
    .grid { display: grid; grid-template-columns: 1.62fr 1fr; gap: 8px; height: 92mm; }
    .hero { display: grid; grid-template-columns: repeat(${Math.max(1, m.anchors.length)}, 1fr); gap: 8px; min-height: 0; }
    .tex { display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 8px; min-height: 0; }
    figure { position: relative; margin: 0; overflow: hidden; border-radius: 3px; background: #F1EFE8; min-height: 0; }
    figure img, .swatch { display: block; width: 100%; height: 100%; object-fit: cover; }
    figcaption { position: absolute; left: 0; right: 0; bottom: 0; padding: 14px 8px 6px; font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #fff; background: linear-gradient(transparent, rgba(0,0,0,.55)); }
    .card { display: flex; align-items: center; justify-content: center; padding: 12px; text-align: center; font-size: 15px; letter-spacing: .06em; text-transform: uppercase; }
    .foot { display: flex; gap: 24px; align-items: center; margin-top: 14px; }
    ul { display: flex; gap: 14px; margin: 0; padding: 0; list-style: none; }
    li { width: 58px; font-size: 9.5px; line-height: 1.3; text-align: center; color: #5C5C55; }
    li span { display: block; width: 34px; height: 34px; margin: 0 auto 5px; border-radius: 50%; border: 1px solid rgba(0,0,0,.12); }
    .desc { margin: 0; font-size: 13px; line-height: 1.6; max-width: 60ch; }
    .inspired { margin: 12px 0 0; font-size: 11px; color: #5C5C55; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  </style></head><body>
    <header><span class="brand">${esc(m.brand)}</span><span class="meta">${esc(m.subtitle)} · ${esc(m.date)}</span></header>
    <div class="head">
      <div><h1>${esc(m.title)}</h1><p class="style">${esc(m.styleLabel)}: <strong>${esc(m.style)}</strong></p></div>
      <blockquote>“${m.motto.map(esc).join("<br>")}”</blockquote>
    </div>
    <div class="grid"><div class="hero">${heroes}</div><div class="tex">${textures}</div></div>
    <div class="foot"><ul>${palette}</ul><p class="desc">${esc(m.description)}</p></div>
    <p class="inspired">${esc(m.inspiredBy)}: ${m.anchors.map((a) => esc(a.name)).join(" · ")}</p>
  </body></html>`);
  win.document.close();

  let printed = false;
  const print = (): void => {
    if (printed) return;
    printed = true;
    win.focus();
    win.print();
  };
  const pending = Array.from(win.document.images).filter((img) => !img.complete);
  let left = pending.length;
  if (left === 0) print();
  for (const img of pending) {
    const done = (): void => {
      left -= 1;
      if (left === 0) print();
    };
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", done, { once: true });
  }
  // Never leave the visitor waiting on a stuck image.
  win.setTimeout(print, 6000);
}
