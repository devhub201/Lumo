import { describe, expect, it, vi } from "vitest";
import { createContextManager } from "./manager";
import type { ContextBudget } from "./contracts";
import type { LumoMemory } from "../contracts";
import type { ToolResult } from "../tools/contracts";

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const personality = {
  name: "LUMO" as const,
  ownerName: "Peter" as const,
  traits: ["calm"],
  responseStyle: ["clear"],
  boundaries: ["honest"],
};
const memory = (id: string, content: string, importance = 50): LumoMemory => ({
  id,
  ownerKey: "peter",
  kind: "project",
  content,
  tags: null,
  importance,
  isActive: 1,
  metadata: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});
const toolResult: ToolResult = {
  success: true,
  toolId: "future.example",
  data: { answer: "structured tool data" },
  error: null,
  metadata: { requestId: "req-1", durationMs: 2 },
};
const base = {
  currentRequest: "What is the LUMO project?",
  personality,
  systemContext: ["Stable LUMO system rules."],
  userContext: ["Peter prefers precise explanations."],
  recentMessages: [
    { role: "user" as const, content: "We were discussing gardening." },
    { role: "assistant" as const, content: "Gardening is unrelated here." },
    { role: "user" as const, content: "Tell me about the LUMO project." },
  ],
  conversationSummary: "Peter is building the LUMO project.",
  relevantMemories: [
    memory("project", "Peter's project is called LUMO", 90),
    memory("garden", "Peter likes gardening", 90),
  ],
};

describe("Phase 6 Context Manager", () => {
  it("includes system context, current request, recent messages, summary, and relevant memory", () => {
    const context = createContextManager(logger).build(base);
    expect(context.currentRequest).toBe(base.currentRequest);
    expect(context.messages.at(-1)).toMatchObject({
      role: "user",
      content: base.currentRequest,
    });
    expect(context.messages[0].content).toContain("Stable LUMO system rules.");
    expect(context.messages[0].content).toContain(
      "Peter is building the LUMO project."
    );
    expect(context.messages[0].content).toContain(
      "Peter's project is called LUMO"
    );
    expect(context.messages[0].content).not.toContain("Peter likes gardening");
    expect(context.metadata.memoryCount).toBe(1);
  });

  it("selects only the configured recent message window", () => {
    const context = createContextManager(logger).build({
      ...base,
      budget: { maxRecentMessages: 1 },
    });
    expect(context.recentMessages).toEqual([
      { role: "user", content: "Tell me about the LUMO project." },
    ]);
  });

  it("uses configurable priorities and removes lower-priority context first", () => {
    const budget: Partial<ContextBudget> = {
      maxContextTokens: 10,
      maxSummaryLength: 1000,
    };
    const context = createContextManager(logger).build({
      ...base,
      systemContext: ["Required system instruction."],
      conversationSummary: "Historical summary ".repeat(80),
      recentMessages: Array.from({ length: 8 }, (_, index) => ({
        role: "assistant" as const,
        content: `Historical message ${index} about the LUMO project.`,
      })),
      budget,
    });
    expect(context.currentRequest).toBe(base.currentRequest);
    expect(context.messages[0].content).toContain(
      "Required system instruction."
    );
    expect(context.messages.at(-1)?.content).toBe(base.currentRequest);
    expect(context.metadata.truncated).toBe(true);
    expect(context.metadata.omittedSources.length).toBeGreaterThan(0);
  });

  it("preserves normalized tool results as bounded context without bypassing validation", () => {
    const context = createContextManager(logger).build({
      ...base,
      toolResults: [toolResult, { toolId: "malformed" } as ToolResult],
    });
    expect(context.toolResults).toHaveLength(1);
    expect(context.messages[0].content).toContain("future.example");
    expect(context.messages[0].content).toContain("structured tool data");
  });

  it("uses a safe estimation fallback for invalid token-estimation settings", () => {
    const context = createContextManager(logger).build({
      ...base,
      budget: { estimateCharsPerToken: 0 },
    });
    expect(Number.isFinite(context.metadata.estimatedTokens)).toBe(true);
  });

  it("handles missing summaries and memory retrieval failures as available-context fallbacks", () => {
    const context = createContextManager(logger).build({
      ...base,
      conversationSummary: null,
      relevantMemories: [],
    });
    expect(context.conversationSummary).toBeNull();
    expect(context.relevantMemories).toEqual([]);
    expect(context.messages.at(-1)?.content).toBe(base.currentRequest);
  });

  it("returns a safe fallback when the context input is invalid", () => {
    const context = createContextManager(logger).build({
      ...base,
      currentRequest: "   ",
    });
    expect(context.messages).toEqual([
      { role: "user", content: "Please continue the conversation." },
    ]);
    expect(context.metadata.truncated).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      "context.build.failed",
      expect.anything()
    );
  });

  it("emits metadata-only lifecycle diagnostics", () => {
    createContextManager(logger).build(base);
    expect(logger.info).toHaveBeenCalledWith(
      "context.build.started",
      expect.anything()
    );
    expect(logger.info).toHaveBeenCalledWith(
      "context.messages.selected",
      expect.objectContaining({ count: expect.any(Number) })
    );
    expect(logger.info).toHaveBeenCalledWith(
      "context.memories.selected",
      expect.objectContaining({ count: expect.any(Number) })
    );
    expect(logger.info).toHaveBeenCalledWith(
      "context.build.completed",
      expect.anything()
    );
  });
});
