import type { Message } from "../../_core/llm";
import type { LumoLogger } from "../logger";
import { normalizeFault } from "../faults/normalize";
import { estimateContext, reduceToBudget } from "./budget";
import { contextDiagnostics } from "./diagnostics";
import {
  DEFAULT_CONTEXT_BUDGET,
  type ContextBuildInput,
  type ContextManager,
  type NormalizedContext,
} from "./contracts";
import {
  mergePriorities,
  selectMemories,
  selectRecentMessages,
} from "./selection";

const safeString = (value: unknown) => (typeof value === "string" ? value : "");

export const createContextManager = (logger: LumoLogger): ContextManager => ({
  build(input: ContextBuildInput): NormalizedContext {
    const diagnostics = contextDiagnostics(logger);
    diagnostics.started({ requestId: input.requestId });
    try {
      const budget = { ...DEFAULT_CONTEXT_BUDGET, ...input.budget };
      const priorities = mergePriorities(input.priorities);
      const currentRequest = safeString(input.currentRequest).trim();
      if (!currentRequest) throw new Error("current_request_missing");
      const systemContext = (input.systemContext ?? [])
        .map(safeString)
        .filter(Boolean);
      const userContext = (input.userContext ?? [])
        .map(safeString)
        .filter(Boolean);
      const recentMessages = selectRecentMessages(
        input.recentMessages ?? [],
        budget.maxRecentMessages
      );
      const relevantMemories = selectMemories(
        currentRequest,
        input.relevantMemories ?? [],
        budget.maxMemoryItems
      );
      const conversationSummary = input.conversationSummary
        ? safeString(input.conversationSummary)
        : null;
      const toolResults = (input.toolResults ?? []).filter(result =>
        Boolean(
          result &&
            typeof result.toolId === "string" &&
            typeof result.success === "boolean" &&
            result.metadata &&
            typeof result.metadata.requestId === "string"
        )
      );
      const reduced = reduceToBudget({
        systemContext,
        userContext,
        summary: conversationSummary,
        recentMessages,
        memories: relevantMemories,
        toolResults,
        currentRequest,
        budget,
        priorities,
      });
      const messages = toModelMessages({ ...reduced, currentRequest });
      const metadata = estimateContext({
        systemContext: reduced.systemContext,
        userContext: reduced.userContext,
        summary: reduced.summary,
        recentMessages: reduced.recentMessages,
        memories: reduced.memories,
        toolResults: reduced.toolResults,
        budget,
        priorities,
        currentRequest,
      });
      metadata.truncated = reduced.diagnostics.truncated;
      metadata.omittedSources = reduced.diagnostics.omittedSources;
      diagnostics.messagesSelected(metadata.messageCount);
      diagnostics.memoriesSelected(metadata.memoryCount);
      diagnostics.summaryUsed(Boolean(reduced.summary));
      diagnostics.estimatedSize({
        estimatedTokens: metadata.estimatedTokens,
        estimatedCharacters: metadata.estimatedCharacters,
        messageCount: metadata.messageCount,
        memoryCount: metadata.memoryCount,
      });
      if (metadata.truncated)
        diagnostics.truncated({
          omittedSources: metadata.omittedSources,
          estimatedTokens: metadata.estimatedTokens,
        });
      diagnostics.completed({
        estimatedTokens: metadata.estimatedTokens,
        truncated: metadata.truncated,
      });
      return {
        systemContext: reduced.systemContext,
        userContext: reduced.userContext,
        conversationSummary: reduced.summary,
        recentMessages: reduced.recentMessages,
        relevantMemories: reduced.memories,
        toolResults: reduced.toolResults,
        currentRequest,
        messages,
        metadata,
      };
    } catch (error) {
      const fault = normalizeFault(error, {
        category: "context",
        requestId: input.requestId,
        retryable: false,
      });
      diagnostics.failed(fault.code, {
        requestId: fault.requestId,
        category: fault.category,
        severity: fault.severity,
      });
      const fallbackText =
        safeString(input.currentRequest).trim() ||
        "Please continue the conversation.";
      const fallbackMessage: Message = {
        role: "user",
        content: fallbackText,
      };
      return {
        systemContext: [],
        userContext: [],
        conversationSummary: null,
        recentMessages: [],
        relevantMemories: [],
        toolResults: [],
        currentRequest: fallbackText,
        messages: [fallbackMessage],
        metadata: {
          estimatedTokens: Math.max(1, Math.ceil(fallbackText.length / 4)),
          estimatedCharacters: fallbackText.length,
          messageCount: 0,
          memoryCount: 0,
          summaryCharacters: 0,
          toolResultCharacters: 0,
          truncated: true,
          omittedSources: [
            "systemContext",
            "recentConversation",
            "relevantMemory",
            "conversationSummary",
            "toolResult",
          ],
          priorities: mergePriorities(input.priorities),
        },
      };
    }
  },
});

export const toModelMessages = (context: {
  systemContext: string[];
  userContext: string[];
  summary: string | null;
  recentMessages: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
  }>;
  memories: Array<{ kind: string; content: string; tags: string | null }>;
  toolResults: Array<{
    toolId: string;
    success: boolean;
    data: unknown;
    error: { message: string } | null;
  }>;
  currentRequest: string;
}): Message[] => {
  const systemBlock = [...context.systemContext, ...context.userContext].join(
    "\n\n"
  );
  const summaryBlock = context.summary
    ? `Relevant conversation summary:\n${context.summary}`
    : "No prior conversation summary is available.";
  const memoryBlock = context.memories.length
    ? `Relevant persistent memory:\n${context.memories.map(memory => `- [${memory.kind}] ${memory.content}${memory.tags ? ` (${memory.tags})` : ""}`).join("\n")}`
    : "No relevant persistent memory was retrieved for this turn.";
  const toolBlock = context.toolResults.length
    ? `Normalized tool context:\n${context.toolResults.map(result => `[${result.toolId}] ${result.success ? JSON.stringify(result.data) : `Tool failed: ${result.error?.message ?? "unknown error"}`}`).join("\n")}`
    : "";
  const systemContent = [systemBlock, summaryBlock, memoryBlock, toolBlock]
    .filter(Boolean)
    .join("\n\n");
  return [
    { role: "system", content: systemContent },
    ...context.recentMessages,
    { role: "user", content: context.currentRequest },
  ];
};
