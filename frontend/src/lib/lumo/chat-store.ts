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
let conversations = initial;
const listeners = new Set<() => void>();
const publish = (next: ChatConversation[]) => {
  conversations = next;
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
