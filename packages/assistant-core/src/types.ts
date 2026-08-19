export interface NavTarget {
  media_name: string;
  yaw: number;
  pitch: number;
  fov: number;
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
