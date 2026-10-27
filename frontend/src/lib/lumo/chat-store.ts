import { useSyncExternalStore } from "react";
import type { UIMessage } from "ai";

export type ChatMessage = UIMessage & {
  demo?: boolean;
  attachments?: string[];
  music?: { query: string; state?: import("./integrations").MusicState | undefined };
};
export interface ChatConversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  draft: string;
}
const initial: ChatConversation[] = [
  { id: "first", title: "New conversation", messages: [], draft: "" },
];
const storageKey = "lumo:on-device-conversations:v1";
function loadConversations(): ChatConversation[] {
  if (typeof window === "undefined") return initial;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(storageKey) ?? "null");
    if (!Array.isArray(parsed)) return initial;
    const valid = parsed.filter(
      (item): item is ChatConversation =>
        Boolean(item) &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        Array.isArray(item.messages) &&
        typeof item.draft === "string",
    );
    return valid.length ? valid : initial;
  } catch {
    return initial;
  }
}
let conversations = loadConversations();
const listeners = new Set<() => void>();
const publish = (next: ChatConversation[]) => {
  conversations = next;
  if (typeof window !== "undefined") {
    try {
      const persisted = next.slice(-20).map((conversation) => ({
        ...conversation,
        messages: conversation.messages.slice(-80),
      }));
      window.localStorage.setItem(storageKey, JSON.stringify(persisted));
    } catch {
      // Keep the current session usable when device storage is full or disabled.
    }
  }
  listeners.forEach((listener) => listener());
};
export const chatStore = {
  get: () => conversations,
  create: () => {
    const id = crypto.randomUUID();
    publish([...conversations, { id, title: "New conversation", messages: [], draft: "" }]);
    return id;
  },
  update: (id: string, patch: Partial<ChatConversation>) =>
    publish(conversations.map((c) => (c.id === id ? { ...c, ...patch } : c))),
  remove: (id: string) => {
    publish(conversations.filter((c) => c.id !== id));
    return conversations[0]?.id ?? chatStore.create();
  },
};
export function useConversations() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    chatStore.get,
    () => initial,
  );
}
export function messageText(message: ChatMessage) {
  return message.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}
/** A fixed, clearly identified layout sample — no inference or attachment analysis. */
export function demoReply(): string {
  return "This is a **demonstration response**, not an AI-generated answer.\n\nYour message is visible in this conversation. A connected AI provider is required for a real answer.\n\n### A little structure\n- Gather the context.\n- Explore the possibilities.\n- Choose a next step.\n\n```text\nLUMO · conversation preview\nNo AI request was made.\n```";
}
