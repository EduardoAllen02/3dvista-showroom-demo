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
