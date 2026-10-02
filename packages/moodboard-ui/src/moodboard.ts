import { MoodboardApiError, type MoodboardApi } from "./api-client.js";
import { printMoodboard } from "./print.js";
import { STRINGS_IT, type MoodboardStrings } from "./strings.js";
import type {
  MoodboardAnalysisView,
  MoodboardAnchor,
  MoodboardPlanResponse,
  MoodboardTextureView,
  WishlistSource,
} from "./types.js";

export interface MoodboardDeps {
  /** Where the saved products come from. assistant-core's WishlistState fits as is. */
  wishlist: WishlistSource;
  api: MoodboardApi;
  /** Byline of the board and of its PDF, e.g. "Febal Casa". */
  brandName: string;
  strings?: Partial<MoodboardStrings>;
  /** How the style is shown ("Caldo accogliente" → "Cálido y acogedor"); verbatim when omitted. */
  formatStyle?: (style: string) => string;
  /**
   * Host-specific "take me to this piece": 3DVista camera navigation in the
   * tour, a product page on the web platform. Omit it and the button isn't
   * shown. The moodboard closes itself before calling it.
   */
  onNavigate?: (anchor: MoodboardAnchor) => void;
  /** Called after the overlay closes. */
  onClose?: () => void;
}

export interface MoodboardHandle {
  element: HTMLElement;
  /** Shows the overlay and (re)loads the moodboard for the wishlist's current content. */
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
}

type Phase = "idle" | "planning" | "analyzing" | "painting" | "ready" | "no-style" | "error";
type ErrorKind = "generic" | "busy" | "unavailable";
type ReadyPlan = Extract<MoodboardPlanResponse, { available: true }>;

const TEXTURE_SLOTS = 4;
const PALETTE_SLOTS = 6;
const MOBILE_BREAKPOINT_PX = 480;

const SPARK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
  '<path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6L12 3Z" fill="currentColor"/></svg>';

let instances = 0;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Same test as assistant-ui's index.ts, duplicated to keep this package
 * dependency-free: `screen.width` rather than a media query, because
 * 3DVista rewrites the page's viewport to 0.5 scale and a phone then
 * reports a ~750px layout viewport.
 */
function isMobileDevice(): boolean {
  const w = window.screen.width || Infinity;
  const h = window.screen.height || Infinity;
  const shortSide = Math.min(w, h);
  return Number.isFinite(shortSide) && shortSide <= MOBILE_BREAKPOINT_PX;
}

/** WCAG relative luminance of "#RRGGBB", 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Above this, dark text contrasts better than white (the two ratios cross near 0.18). */
const LIGHT_BACKGROUND = 0.22;

function fadeIn(img: HTMLImageElement): void {
  const reveal = (): void => img.classList.add("tva-mb-img--loaded");
  if (img.complete && img.naturalWidth > 0) reveal();
  else img.addEventListener("load", reveal, { once: true });
}

/**
 * The wishlist's moodboard as a standalone overlay. Knows nothing about the
 * chatbot, the wishlist panel or 3DVista: it reads saved product ids from a
 * WishlistSource, talks to the backend through MoodboardApi, and hands
 * navigation back to the host. The same component can be mounted by any
 * page that provides those three things.
 *
 * Loads progressively so the visitor never stares at a spinner: the style
 * and the saved pieces appear at once (free, deterministic), then the words
 * and palette (~8 s), then the textures (~10 s). Everything is cached
 * server-side, so reopening, or another visitor with the same style and
 * pieces, is instant.
 */
export function createMoodboard(deps: MoodboardDeps): MoodboardHandle {
  const t: MoodboardStrings = { ...STRINGS_IT, ...deps.strings };
  const titleId = `tva-mb-title-${++instances}`;

  const root = el("div", "tva-mb-root");
  root.dataset.open = "false";
  root.dataset.empty = "true";
  root.setAttribute("aria-hidden", "true");

  const backdrop = el("div", "tva-mb-backdrop");
  const dialog = el("section", "tva-mb-dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", titleId);

  const bar = el("header", "tva-mb-bar");
  const barActions = el("div", "tva-mb-bar-actions");
  const pdfBtn = el("button", "tva-mb-pdf", t.downloadPdf);
  pdfBtn.type = "button";
  pdfBtn.disabled = true;
  const closeBtn = el("button", "tva-mb-close", "×");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", t.close);
  barActions.append(pdfBtn, closeBtn);
  bar.append(el("span", "tva-mb-brand", deps.brandName), barActions);

  const title = el("h2", "tva-mb-title", t.title);
  title.id = titleId;
  const spark = el("span", "tva-mb-spark");
  spark.innerHTML = SPARK_SVG;
  title.append(spark);
  const styleValue = el("strong");
  const styleLine = el("p", "tva-mb-style");
  styleLine.append(`${t.styleLabel}: `, styleValue);
  const titles = el("div", "tva-mb-titles");
  titles.append(title, styleLine);
  const motto = el("blockquote", "tva-mb-motto");
  const head = el("div", "tva-mb-head");
  head.append(titles, motto);

  const hero = el("div", "tva-mb-hero");
  const textureGrid = el("div", "tva-mb-textures");
  const grid = el("div", "tva-mb-grid");
  grid.append(hero, textureGrid);

  const palette = el("ul", "tva-mb-palette");
  palette.setAttribute("aria-label", t.paletteHeading);
  const description = el("p", "tva-mb-desc");
  const foot = el("div", "tva-mb-foot");
  foot.append(palette, description);

  const board = el("div", "tva-mb-board");
  board.append(head, grid, foot);

  const statusText = el("span", "tva-mb-status-text");
  const retryBtn = el("button", "tva-mb-retry", t.retry);
  retryBtn.type = "button";
  retryBtn.hidden = true;
  const status = el("div", "tva-mb-status");
  status.setAttribute("aria-live", "polite");
  status.append(statusText, retryBtn);

  const scroller = el("div", "tva-mb-scroll");
  scroller.append(board, status);
  dialog.append(bar, scroller);
  root.append(backdrop, dialog);

  let isOpen = false;
  let phase: Phase = "idle";
  let errorKind: ErrorKind = "generic";
  let plan: ReadyPlan | null = null;
  let analysis: MoodboardAnalysisView | null = null;
  let textures: MoodboardTextureView[] | null = null;
  let run = 0;
  let lastFocus: HTMLElement | null = null;
  let heroSignature = "";
  let textureSignature = "";
  const inflight = new Map<string, Promise<unknown>>();

  /** One request per key and stage, however many times the visitor reopens meanwhile. */
  function shared<T>(id: string, start: () => Promise<T>): Promise<T> {
    const pending = inflight.get(id);
    if (pending) return pending as Promise<T>;
    const promise = start().finally(() => inflight.delete(id));
    inflight.set(id, promise);
    return promise;
  }

  function errorMessage(): string {
    if (errorKind === "busy") return t.errorBusy;
    if (errorKind === "unavailable") return t.errorUnavailable;
    return t.errorGeneric;
  }

  function setPhase(next: Phase): void {
    phase = next;
    root.dataset.phase = next;
    const busy = next === "planning" || next === "analyzing" || next === "painting";
    statusText.textContent =
      next === "planning" || next === "analyzing"
        ? t.composing
        : next === "painting"
          ? t.painting
          : next === "no-style"
            ? t.noStyle
            : next === "error"
              ? errorMessage()
              : "";
    status.dataset.busy = String(busy);
    retryBtn.hidden = next !== "error" || errorKind === "unavailable";
    pdfBtn.disabled = next !== "ready";
    dialog.setAttribute("aria-busy", String(busy));
  }

  function paletteHex(index: number): string {
    const colors = analysis?.palette ?? [];
    return colors.length ? colors[index % colors.length].hex : "";
  }

  function skeletonLines(count: number): HTMLElement[] {
    return Array.from({ length: count }, () => el("span", "tva-mb-skel tva-mb-skel-line"));
  }

  function renderHead(): void {
    styleValue.textContent = plan ? (deps.formatStyle ?? String)(plan.style) : "";
    motto.replaceChildren();
    if (analysis) {
      const lines = analysis.motto;
      lines.forEach((line, i) => {
        const lead = i === 0 ? "“" : "";
        const tail = i === lines.length - 1 ? "”" : "";
        motto.append(el("span", "tva-mb-motto-line", `${lead}${line}${tail}`));
      });
    } else if (phase !== "error") {
      motto.append(...skeletonLines(2));
    }
  }

  function renderAnchor(anchor: MoodboardAnchor): HTMLElement {
    const figure = el("figure", "tva-mb-anchor");
    if (anchor.photo) {
      const img = el("img");
      img.alt = anchor.name;
      img.decoding = "async";
      img.src = anchor.image_url;
      fadeIn(img);
      figure.append(img);
    } else {
      // The catalog only has the brand logo for this piece: a named card in
      // the moodboard's own colour instead of a misleading picture.
      figure.classList.add("tva-mb-anchor--nophoto");
      figure.append(el("span", "tva-mb-anchor-card-name", anchor.name));
    }
    const caption = el("figcaption", "tva-mb-anchor-cap");
    caption.append(el("span", "tva-mb-anchor-name", anchor.name));
    if (deps.onNavigate) {
      const go = el("button", "tva-mb-go", t.goTo);
      go.type = "button";
      go.addEventListener("click", () => {
        close();
        deps.onNavigate?.(anchor);
      });
      caption.append(go);
    }
    figure.append(caption);
    return figure;
  }

  function renderHero(): void {
    const anchors = plan?.anchors ?? [];
    // Rebuilt only when the anchors change, so their photos never reload.
    const signature = anchors.map((a) => `${a.product_id}:${a.image_url}`).join("|");
    if (signature !== heroSignature || hero.childElementCount === 0) {
      heroSignature = signature;
      hero.replaceChildren(...(anchors.length ? anchors.map(renderAnchor) : [el("figure", "tva-mb-anchor tva-mb-skel")]));
      hero.dataset.count = String(Math.max(1, anchors.length));
    }
    // Photo-less cards take the board's dominant colour once the palette
    // exists (a dark neutral until then), with whichever ink reads on it.
    const cardHex = paletteHex(0);
    for (const card of Array.from(hero.querySelectorAll<HTMLElement>(".tva-mb-anchor--nophoto"))) {
      card.style.setProperty("--tva-mb-card", cardHex || "var(--tva-mb-muted)");
      card.dataset.ink = cardHex && luminance(cardHex) > LIGHT_BACKGROUND ? "dark" : "light";
    }
  }

  function textureCaption(name: string, detail: string | undefined): HTMLElement {
    const caption = el("figcaption", "tva-mb-texture-cap");
    caption.append(el("strong", undefined, name));
    if (detail) caption.append(el("span", undefined, detail));
    return caption;
  }

  function renderTextures(): void {
    const materials = analysis?.materials ?? [];
    const failedToLoad = phase === "error";
    const signature = [
      plan?.key ?? "",
      materials.map((m) => m.name).join(","),
      (textures ?? []).map((x) => x.url ?? "-").join(","),
      failedToLoad,
      paletteHex(0),
    ].join("|");
    if (signature === textureSignature) return;
    textureSignature = signature;

    const cells: HTMLElement[] = [];
    for (let i = 0; i < TEXTURE_SLOTS; i++) {
      const figure = el("figure", "tva-mb-texture");
      const material = materials[i];
      const texture = textures?.find((x) => x.index === i) ?? null;
      if (texture?.url) {
        const img = el("img");
        img.alt = texture.material;
        img.decoding = "async";
        img.src = deps.api.assetUrl(texture.url);
        fadeIn(img);
        figure.append(img, textureCaption(material?.name ?? texture.material, material?.description));
      } else if (analysis && (textures || failedToLoad || !material)) {
        // Couldn't paint this one (or there are fewer materials than cells):
        // a swatch of the moodboard's palette keeps the board whole.
        figure.classList.add("tva-mb-texture--swatch");
        figure.style.setProperty("--tva-mb-swatch", paletteHex(i + 1) || paletteHex(i));
        if (material) figure.append(textureCaption(material.name, material.description));
      } else {
        figure.classList.add("tva-mb-skel");
      }
      cells.push(figure);
    }
    textureGrid.replaceChildren(...cells);
  }

  function renderFoot(): void {
    palette.replaceChildren();
    if (analysis) {
      for (const color of analysis.palette) {
        const item = el("li", "tva-mb-color");
        item.title = `${color.name} · ${color.hex}`;
        const dot = el("span", "tva-mb-color-dot");
        dot.style.background = color.hex;
        item.append(dot, el("span", "tva-mb-color-name", color.name));
        palette.append(item);
      }
    } else {
      for (let i = 0; i < PALETTE_SLOTS; i++) {
        const item = el("li", "tva-mb-color");
        item.append(el("span", "tva-mb-color-dot tva-mb-skel"));
        palette.append(item);
      }
    }
    description.replaceChildren();
    if (analysis) description.textContent = analysis.description;
    else if (phase !== "error") description.append(...skeletonLines(3));
  }

  function renderAll(): void {
    root.dataset.empty = String(plan === null);
    renderHead();
    renderHero();
    renderTextures();
    renderFoot();
  }

  function clearContent(): void {
    plan = null;
    analysis = null;
    textures = null;
    renderAll();
  }

  async function load(): Promise<void> {
    const token = ++run;
    const ids = deps.wishlist.getAll().map((item) => item.product_id);
    if (ids.length === 0) {
      clearContent();
      setPhase("no-style");
      return;
    }
    if (!plan) setPhase("planning");
    let planning = true;
    try {
      const res = await deps.api.plan(ids);
      planning = false;
      if (token !== run) return;
      if (!res.available) {
        clearContent();
        setPhase("no-style");
        return;
      }
      const sameKey = plan?.key === res.key;
      plan = res;
      analysis = res.analysis ?? (sameKey ? analysis : null);
      textures = res.textures ?? (sameKey ? textures : null);
      renderAll();

      if (!analysis) {
        setPhase("analyzing");
        renderAll();
        const fresh = await shared(`analysis:${res.key}`, () => deps.api.analysis(res.key));
        if (token !== run) return;
        analysis = fresh;
        renderAll();
      }
      // Also retried when some textures failed before: only those get repainted.
      if (!textures || textures.some((x) => !x.url)) {
        setPhase("painting");
        const fresh = await shared(`textures:${res.key}`, () => deps.api.textures(res.key));
        if (token !== run) return;
        textures = fresh;
      }
      setPhase("ready");
      renderAll();
    } catch (err) {
      if (token !== run) return;
      // 503: moodboard disabled on this backend. 404 on the plan call: a
      // backend without the /moodboard routes at all. Neither is fixed by
      // retrying, unlike a network error or a failed generation.
      const status = err instanceof MoodboardApiError ? err.status : 0;
      errorKind =
        status === 429 ? "busy" : status === 503 || (planning && status === 404) ? "unavailable" : "generic";
      setPhase("error");
      renderAll();
    }
  }

  function focusables(): HTMLElement[] {
    return Array.from(dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")).filter(
      (node) => !node.hidden && node.offsetParent !== null
    );
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusables();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (!dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function open(): void {
    if (!isOpen) {
      isOpen = true;
      lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      root.dataset.mobile = String(isMobileDevice());
      root.dataset.open = "true";
      root.setAttribute("aria-hidden", "false");
      document.addEventListener("keydown", onKeydown, true);
      window.setTimeout(() => closeBtn.focus(), 0);
    }
    void load();
  }

  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    root.dataset.open = "false";
    root.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", onKeydown, true);
    lastFocus?.focus();
    deps.onClose?.();
  }

  backdrop.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  retryBtn.addEventListener("click", () => void load());
  pdfBtn.addEventListener("click", () => {
    if (!plan || !analysis) return;
    const current = analysis;
    printMoodboard({
      brand: deps.brandName,
      subtitle: t.pdfSubtitle,
      date: new Date().toLocaleDateString(t.dateLocale, { day: "numeric", month: "long", year: "numeric" }),
      title: t.title,
      styleLabel: t.styleLabel,
      style: (deps.formatStyle ?? String)(plan.style),
      motto: current.motto,
      description: current.description,
      palette: current.palette,
      anchors: plan.anchors.map((a) => ({
        name: a.name,
        src: a.photo ? new URL(a.image_url, document.baseURI).href : null,
      })),
      textures: Array.from({ length: TEXTURE_SLOTS }, (_, i) => {
        const texture = textures?.find((x) => x.index === i);
        return {
          material: current.materials[i]?.name ?? "",
          src: texture?.url ? deps.api.assetUrl(texture.url) : null,
          fallbackHex: paletteHex(i + 1) || paletteHex(i) || "#F1EFE8",
        };
      }),
      inspiredBy: t.inspiredBy,
      accent: getComputedStyle(root).getPropertyValue("--tva-mb-accent").trim(),
    });
  });

  setPhase("idle");
  renderAll();

  return { element: root, open, close, isOpen: () => isOpen };
}
