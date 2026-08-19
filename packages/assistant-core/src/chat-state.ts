import type { ChatMessage, ProductCard } from "./types.js";

export type ChatListener = (messages: ChatMessage[]) => void;

/**
 * In-memory message history for the widget's lifetime. Since the widget is
 * injected once into the tour's persistent DOM (confirmed in Fase 0/1), this
 * state survives panorama changes without needing sessionStorage for the
 * message list itself — only the session id needs to persist across reloads.
 */
export class ChatState {
  private messages: ChatMessage[] = [];
  private listeners = new Set<ChatListener>();
  private open = false;

  isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    this.open = open;
  }

  getMessages(): ChatMessage[] {
    return this.messages;
  }

  addUserMessage(text: string): ChatMessage {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text,
      cards: [],
      createdAt: Date.now(),
    };
    this.messages.push(message);
    this.emit();
    return message;
  }

  addAssistantMessage(text: string, cards: ProductCard[]): ChatMessage {
    const message: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      text,
      cards,
      createdAt: Date.now(),
    };
    this.messages.push(message);
    this.emit();
    return message;
  }

  subscribe(listener: ChatListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.messages);
  }
}
