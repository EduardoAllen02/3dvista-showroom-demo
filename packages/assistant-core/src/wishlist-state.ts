import type { ProductCard } from "./types.js";

const STORAGE_KEY = "3dvista-assistant:wishlist";

export type WishlistListener = (items: ProductCard[]) => void;

function loadFromStorage(): ProductCard[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ProductCard[]) : [];
  } catch {
    return [];
  }
}

/**
 * The visitor's saved "wishlist" — persisted in localStorage (survives a
 * reload, unlike ChatState's in-memory message list) so a returning visitor
 * doesn't lose their collection. Stores full ProductCard snapshots, not
 * just ids, so the panel can render immediately without a refetch — the
 * tradeoff is a saved card can go stale if that product's real data later
 * changes, acceptable for a wishlist (visual reference, not a live order).
 */
export class WishlistState {
  private items: ProductCard[];
  private listeners = new Set<WishlistListener>();

  constructor() {
    this.items = loadFromStorage();
  }

  getAll(): ProductCard[] {
    return this.items;
  }

  has(productId: string): boolean {
    return this.items.some((i) => i.product_id === productId);
  }

  /** Adds or removes `card` depending on its current state. Returns the new saved state. */
  toggle(card: ProductCard): boolean {
    if (this.has(card.product_id)) {
      this.items = this.items.filter((i) => i.product_id !== card.product_id);
      this.persistAndEmit();
      return false;
    }
    this.items = [...this.items, card];
    this.persistAndEmit();
    return true;
  }

  remove(productId: string): void {
    this.items = this.items.filter((i) => i.product_id !== productId);
    this.persistAndEmit();
  }

  subscribe(listener: WishlistListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persistAndEmit(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    } catch {
      // localStorage unavailable (e.g. restrictive iframe sandbox) — the
      // wishlist still works for the rest of this page load, just won't
      // survive a reload. Same fallback posture as session.ts.
    }
    for (const listener of this.listeners) listener(this.items);
  }
}
