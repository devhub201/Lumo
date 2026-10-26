import { describe, expect, it } from "vitest";
import { chatStore, demoReply, messageText } from "@/lib/lumo/chat-store";

describe("Visit-only Chat history", () => {
  it("keeps messages and drafts isolated between conversations", () => {
    const first = chatStore.create();
    const second = chatStore.create();
    chatStore.update(first, {
      draft: "A draft",
      messages: [
        { id: "user-1", role: "user", parts: [{ type: "text", text: "First conversation" }] },
      ],
    });
    expect(chatStore.get().find((c) => c.id === first)?.draft).toBe("A draft");
    expect(chatStore.get().find((c) => c.id === second)?.messages).toEqual([]);
    expect(
      messageText(
        chatStore.get().find((c) => c.id === first)?.messages[0] ?? {
          id: "",
          role: "user",
          parts: [],
        },
      ),
    ).toBe("First conversation");
    chatStore.remove(first);
    expect(chatStore.get().some((c) => c.id === first)).toBe(false);
    expect(chatStore.get().some((c) => c.id === second)).toBe(true);
  });
  it("labels the sample honestly without claiming inference", () => {
    expect(demoReply()).toContain("not an AI-generated answer");
    expect(demoReply()).toContain("No AI request was made.");
  });
});
