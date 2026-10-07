import { describe, expect, it, vi } from "vitest";
import { buildContextMessages, createLumoCore, titleFromMessage } from "./core";
import { DEFAULT_PERSONALITY } from "./memory";
import type { LumoMemory, LumoProvider, LumoStorage } from "./contracts";

const makeMemory = (
  id: string,
  content: string,
  kind: LumoMemory["kind"] = "knowledge"
): LumoMemory => ({
  id,
  ownerKey: "peter",
  kind,
  content,
  tags: null,
  importance: 80,
  isActive: 1,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const makeStorage = (
  options: { memories?: LumoMemory[]; failMemoryRead?: boolean } = {}
): LumoStorage => {
  const conversation = {
    id: "conversation-1",
    ownerKey: "peter",
    title: "Black holes",
    depthLevel: 1,
    depthTopic: "Black holes",
    summary: null as string | null,
    summaryUpdatedAt: null as Date | null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
  };
  const messages: any[] = [];
  const memories = [...(options.memories ?? [])];
  const settings = new Map<string, string>();
  return {
    createConversation: vi.fn(async () => conversation),
    getConversation: vi.fn(async () => conversation),
    listConversations: vi.fn(async () => [conversation]),
    listMessages: vi.fn(async () => messages),
    appendTurn: vi.fn(async input => {
      const now = new Date();
      const userMessage = {
        id: `user-${messages.length + 1}`,
        conversationId: input.conversationId,
        sequence: messages.length + 1,
        role: "user" as const,
        content: input.userContent,
        metadata: null,
        createdAt: now,
      };
      const assistantMessage = {
        id: `assistant-${messages.length + 2}`,
        conversationId: input.conversationId,
        sequence: messages.length + 2,
        role: "assistant" as const,
        content: input.assistantContent,
        metadata: null,
        createdAt: now,
      };
      messages.push(userMessage, assistantMessage);
      return { userMessage, assistantMessage };
    }),
    updateConversation: vi.fn(async input => {
      conversation.depthLevel = input.depthLevel;
      conversation.summary = input.summary ?? conversation.summary;
      conversation.summaryUpdatedAt = input.summary
        ? new Date()
        : conversation.summaryUpdatedAt;
    }),
    listMemories: vi.fn(async () => memories),
    searchMemories: vi.fn(async (_owner, query, limit) => {
      if (options.failMemoryRead) throw new Error("memory unavailable");
      return memories
        .filter(memory =>
          query
            .toLowerCase()
            .split(/\s+/)
            .some(token => memory.content.toLowerCase().includes(token))
        )
        .slice(0, limit);
    }),
    createMemory: vi.fn(async input => {
      const created = makeMemory(
        `memory-${memories.length + 1}`,
        input.content,
        input.kind
      );
      memories.push(created);
      return created;
    }),
    deactivateMemory: vi.fn(async (_owner, id) => {
      const memory = memories.find(item => item.id === id);
      if (memory) memory.isActive = 0;
    }),
    getSetting: vi.fn(async (_owner, key) => settings.get(key) ?? null),
    setSetting: vi.fn(async (_owner, key, value) => {
      settings.set(key, value);
    }),
  };
};

const makeCore = (storage: LumoStorage, provider: LumoProvider) =>
  createLumoCore({
    provider,
    storage,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    ownerKey: "peter",
  });

describe("LUMO Phase 2 core", () => {
  it("creates a short stable title from the first message", () => {
    expect(titleFromMessage("  Explain black holes with intuition  ")).toBe(
      "Explain black holes with intuition"
    );
    expect(titleFromMessage("a ".repeat(50)).length).toBeLessThanOrEqual(68);
  });

  it("assembles personality, summary, relevant memory, and style cues into bounded context", () => {
    const messages = buildContextMessages({
      recentMessages: [{ role: "user", content: "What is an event horizon?" }],
      memories: [
        {
          kind: "preference",
          content: "Peter prefers technical detail",
          tags: "explanations",
        },
      ],
      userText: "Explain that like I'm 10",
      depthLevel: 2,
      depthTopic: "Black holes",
      summary:
        "Peter was learning the intuition behind gravity and black holes.",
      personality: DEFAULT_PERSONALITY,
    });
    const system = String(messages[0].content);
    expect(system).toContain("Peter prefers technical detail");
    expect(system).toContain("Relevant conversation summary");
    expect(system).toContain("ten-year-old");
    expect(system).toContain("personal AI companion");
    expect(messages.at(-1)).toMatchObject({
      role: "user",
      content: "Explain that like I'm 10",
    });
  });

  it("continues a topic at a deeper level and persists a rolling summary", async () => {
    const storage = makeStorage();
    const provider: LumoProvider = {
      complete: vi.fn(async () => ({
        content: "Continuing deeper.",
        model: "test-provider",
      })),
    };
    const result = await makeCore(storage, provider).sendMessage({
      conversationId: "conversation-1",
      text: "Go deeper",
    });
    expect(result.diagnostics.depthLevel).toBe(2);
    expect(result.conversation.summary).toContain("Go deeper");
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it("stores explicit memory commands and can recall them without a model call", async () => {
    const storage = makeStorage();
    const provider: LumoProvider = {
      complete: vi.fn(async () => ({ content: "ack", model: "test-provider" })),
    };
    const core = makeCore(storage, provider);
    await core.sendMessage({
      conversationId: "conversation-1",
      text: "Remember that my project is called LUMO.",
    });
    const recalled = await core.sendMessage({
      conversationId: "conversation-1",
      text: "What do you remember about me?",
    });
    expect(recalled.assistantMessage.content).toContain(
      "my project is called LUMO"
    );
    expect(storage.createMemory).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "project", source: "explicit" })
    );
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it("infers a durable project memory only after a successful response", async () => {
    const storage = makeStorage();
    const provider: LumoProvider = {
      complete: vi.fn(async () => ({
        content: "Got it.",
        model: "test-provider",
      })),
    };
    await makeCore(storage, provider).sendMessage({
      conversationId: "conversation-1",
      text: "My project is called LUMO.",
    });
    expect(storage.createMemory).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "project", source: "inferred" })
    );
  });

  it("keeps chat working when memory retrieval fails", async () => {
    const storage = makeStorage({ failMemoryRead: true });
    const provider: LumoProvider = {
      complete: vi.fn(async () => ({
        content: "Still here.",
        model: "test-provider",
      })),
    };
    const result = await makeCore(storage, provider).sendMessage({
      text: "Hi LUMO.",
    });
    expect(result.assistantMessage.content).toBe("Still here.");
    expect(result.diagnostics.memoryWrite).toBe("failed");
  });
});
