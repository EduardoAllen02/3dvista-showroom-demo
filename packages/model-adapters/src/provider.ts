export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_call_id?: string;
  name?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatUsage {
  input_tokens: number;
  cached_input_tokens: number;
  reasoning_tokens: number;
  output_tokens: number;
}

export interface ChatResult {
  content: string | null;
  tool_calls: ToolCall[];
  usage: ChatUsage;
  raw: unknown;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  tools: ToolSchema[];
  /**
   * "required" forces at least one tool call this completion — used for
   * only the FIRST completion of a user turn (see orchestrator.ts), as a
   * structural backstop after a live test showed the model sometimes
   * narrating products straight from the candidate summary instead of
   * calling get_product/get_alternatives, more often as a conversation
   * grew longer. Prompt wording alone didn't reliably stop it. Left "auto"
   * (default) on every later completion within the same turn, once a real
   * tool result is already in context, so the model can still end with a
   * plain text reply instead of being forced to call something pointless.
   */
  tool_choice?: "auto" | "required";
}

/**
 * Pluggable AI provider seam. Swapping providers/models = implementing this
 * interface in a new file and pointing MODEL_ID/PROVIDER env vars at it —
 * no changes needed in the orchestrator.
 */
export interface ModelProvider {
  readonly name: string;
  chat(request: ChatRequest): Promise<ChatResult>;
}
