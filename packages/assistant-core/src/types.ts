export interface NavTarget {
  media_name: string;
  yaw: number;
  pitch: number;
  fov: number;
  hotspot_name: string | null;
}

/**
 * A PROPOSAL card only — always rendered with "Llévame"/"Ver alternativas"
 * buttons. Cards never represent "you're already here": once the agent
 * actually navigates (`navigate_to_product`), the backend returns a
 * separate top-level `navigate` target instead (see ChatResponseBody),
 * carrying no card/button at all. Mixing the two was a real bug a user
 * caught live — the button used to only appear *after* the camera had
 * already moved there, which made it pointless.
 */
export interface ProductCard {
  product_id: string;
  name: string;
  description: string;
  image_url: string;
  section: string;
  detail_url: string | null;
  navTarget: NavTarget;
  /** Whether to render "Ver alternativas" for this card — false for cards
   * that already ARE an alternatives reveal (see server's tools.ts). */
  alternativesAvailable: boolean;
}

/**
 * Public, lightweight per-product record the wishlist layer's hotspot
 * overlay fetches once from `<assetsBaseUrl>/catalog-manifest.json`
 * (built alongside the widget bundle — see build-tour-bundle.mjs). Just
 * enough to project a hotspot to screen coordinates and render a saved
 * item's thumbnail — never descriptions/keywords/synonyms/materials/etc.
 */
export interface HotspotManifestEntry {
  product_id: string;
  name: string;
  media_name: string;
  yaw: number;
  pitch: number;
  fov: number;
  image_url: string;
  detail_url: string | null;
  /** Needed to match a currently-open NATIVE tour hotspot preview back to a
   * catalog product (see native-preview-detector.ts) — same "BOX nnn -
   * B_nnn" label the catalog scrape captured, not something derived here. */
  hotspot_name: string | null;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards: ProductCard[];
  createdAt: number;
}

export interface ChatResponseBody {
  reply: string;
  product_cards: ProductCard[];
  /** Present only when the agent itself navigated this turn — apply immediately. */
  navigate: NavTarget | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    latency_ms: number;
  };
}
