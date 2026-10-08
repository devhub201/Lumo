import { nanoid } from "nanoid";
import { ENV } from "../_core/env";
import type { Message } from "../_core/llm";
import { createContextManager } from "./context/manager";
import { LumoError } from "./errors";
import { withFallback } from "./faults/fallback";
import { normalizeFault } from "./faults/normalize";
import { withRetry } from "./faults/retry";
import {
  DEFAULT_PERSONALITY,
  formatRecall,
  inferDurableMemory,
  parseMemoryCommand,
  personalityPrompt,
  type MemoryCommand,
} from "./memory";
import type { LumoLogger } from "./logger";
import type { RouteRequest, RouteDecision, ToolRouter } from "./routing";
import {
  LUMO_MEMORY_LIMIT,
  LUMO_MESSAGE_LIMIT,
  LUMO_PERSONALITY_SETTING_KEY,
  type LumoToolBoundary,
  type LumoMemory,
  type LumoPersonality,
  type LumoProvider,
  type LumoStorage,
  type LumoTurnResult,
} from "./contracts";
import type { ToolResult } from "./tools/contracts";
import { buildVisionContext, visionResultToolResult } from "./vision/context";
import type { VisionResult } from "./vision/contracts";
import {
  isMemoryWriteEligible,
  rankRefinedMemories,
} from "./memory/refinement";

const BASE_IDENTITY = `You are LUMO, Peter's personal AI companion and thinking partner. Be conversational and natural rather than sounding like a customer-support bot, FAQ, or scripted assistant. Be casual when the moment is casual and technically capable when the question is technical, scientific, educational, or about programming. Do not constantly announce that you are an AI. Do not use excessive emojis or pretend to have human feelings. Address Peter naturally when it fits, but do not repeat his name in every response. Do not claim to have used tools, files, memory, web, vision, voice, or blueprints unless the system explicitly provides them.`;

const normalizeInput = (value: string) => {
  const text = value.trim();
  if (!text) {
    throw new LumoError(
      "invalid_input",
      "Message text is empty",
      "Write a message before sending."
    );
  }
  if (text.length > 4000) {
    throw new LumoError(
      "invalid_input",
      "Message text exceeds the 4000 character limit",
      "Keep the test message under 4,000 characters."
    );
  }
  return text;
};

export const titleFromMessage = (text: string) => {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > 68
    ? `${oneLine.slice(0, 65)}…`
    : oneLine || "Untitled conversation";
};

const isGoDeeper = (text: string) =>
  /\bgo deeper\b|more detail|continue deeper/i.test(text);
const isSimpleExplanation = (text: string) =>
  /like (?:i|I'm|im)\s*(?:am\s*)?10|explain (?:it|that) simply|in simple terms|beginner/i.test(
    text
  );
const isExampleRequest = (text: string) =>
  /\b(give|show|provide) me an example\b|example\?/i.test(text);

export function buildConversationSummary(
  previous: string | null,
  messages: Array<{ role: string; content: string }>
) {
  const relevant = messages
    .filter(message => message.role === "user" || message.role === "assistant")
    .slice(-6)
    .map(
      message =>
        `${message.role === "user" ? "Peter" : "LUMO"}: ${message.content.replace(/\s+/g, " ").trim().slice(0, 230)}`
    );
  const joined = [previous?.trim(), ...relevant].filter(Boolean).join("\n");
  return joined.slice(-1400) || null;
}

const buildContextInput = ({
  requestId,
  recentMessages,
  memories,
  userText,
  depthLevel,
  depthTopic,
  summary,
  personality,
  toolResults = [],
}: {
  requestId?: string;
  recentMessages: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
  }>;
  memories: Array<
    Pick<
      LumoMemory,
      | "kind"
      | "content"
      | "tags"
      | "importance"
      | "id"
      | "ownerKey"
      | "isActive"
      | "metadata"
      | "createdAt"
      | "updatedAt"
    >
  >;
  userText: string;
  depthLevel: number;
  depthTopic: string | null;
  summary: string | null;
  personality: LumoPersonality;
  toolResults?: Array<ToolResult<unknown>>;
}) => {
  const styleCue = isSimpleExplanation(userText)
    ? "Adapt the explanation for a ten-year-old: concrete language, short steps, and a simple analogy without being condescending."
    : isExampleRequest(userText)
      ? "Continue the current topic and give a concrete example; do not restart with an unrelated introduction."
      : isGoDeeper(userText)
        ? "Go deeper into the immediately preceding topic. Build on the last explanation instead of treating this as a new question."
        : "Preserve the current topic and conversational continuity.";
  return {
    requestId,
    currentRequest: userText,
    personality,
    systemContext: [
      BASE_IDENTITY,
      personalityPrompt(personality),
      `Current explanation depth: ${depthLevel}${depthTopic ? `; current topic: ${depthTopic}` : ""}.`,
      styleCue,
    ],
    recentMessages,
    conversationSummary: summary,
    relevantMemories: memories,
    toolResults,
  };
};

export const buildContextMessages = ({
  recentMessages,
  memories,
  userText,
  depthLevel,
  depthTopic,
  summary = null,
  personality = DEFAULT_PERSONALITY,
}: {
  recentMessages: Array<{
    role: "user" | "assistant" | "system" | "tool";
    content: string;
  }>;
  memories: LumoMemory[];
  userText: string;
  depthLevel: number;
  depthTopic: string | null;
  summary?: string | null;
  personality?: LumoPersonality;
}): Message[] => {
  return createContextManager({
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
  }).build(
    buildContextInput({
      requestId: undefined,
      recentMessages,
      memories,
      userText,
      depthLevel,
      depthTopic,
      summary,
      personality,
    })
  ).messages;
};

export function createLumoCore({
  provider,
  storage,
  logger,
  ownerKey,
  toolSystem,
  router,
}: {
  provider: LumoProvider;
  storage: LumoStorage;
  logger: LumoLogger;
  ownerKey: string;
  toolSystem?: LumoToolBoundary;
  router?: ToolRouter;
}) {
  const contextManager = createContextManager(logger);
  const loadPersonality = async (): Promise<LumoPersonality> => {
    try {
      const raw = await storage.getSetting(
        ownerKey,
        LUMO_PERSONALITY_SETTING_KEY
      );
      if (!raw) {
        await storage.setSetting(
          ownerKey,
          LUMO_PERSONALITY_SETTING_KEY,
          JSON.stringify(DEFAULT_PERSONALITY)
        );
        return DEFAULT_PERSONALITY;
      }
      const parsed = JSON.parse(raw) as Partial<LumoPersonality>;
      return {
        ...DEFAULT_PERSONALITY,
        ...parsed,
        traits: parsed.traits?.length
          ? parsed.traits
          : DEFAULT_PERSONALITY.traits,
        responseStyle: parsed.responseStyle?.length
          ? parsed.responseStyle
          : DEFAULT_PERSONALITY.responseStyle,
        boundaries: parsed.boundaries?.length
          ? parsed.boundaries
          : DEFAULT_PERSONALITY.boundaries,
      };
    } catch (error) {
      logger.warn("personality_storage_failed", {
        errorCode: "personality_unavailable",
      });
      return DEFAULT_PERSONALITY;
    }
  };

  const retrieveMemories = async (query: string, requestId: string) => {
    const result = await withFallback({
      primary: async () =>
        rankRefinedMemories(
          await storage.searchMemories(ownerKey, query, LUMO_MEMORY_LIMIT),
          query,
          LUMO_MEMORY_LIMIT
        ),
      fallback: () => [],
      logger,
      requestId,
    });
    return { memories: result.value, failed: result.usedFallback };
  };

  const storeMemory = async (
    input: Parameters<LumoStorage["createMemory"]>[0]
  ) => {
    if (!isMemoryWriteEligible(input.content, input.source ?? "inferred")) {
      logger.warn("memory_write_blocked", {
        reason: "sensitive_or_untrusted_content",
      });
      return { memory: null, failed: true };
    }
    try {
      const memory = await storage.createMemory(input);
      logger.info("memory_stored", {
        memoryId: memory.id,
        memoryKind: memory.kind,
      });
      return { memory, failed: false };
    } catch (error) {
      logger.warn("memory_storage_failed", {
        errorCode: "memory_write_failed",
      });
      return { memory: null, failed: true };
    }
  };

  const applyForget = async (
    command: Extract<MemoryCommand, { type: "forget" }>
  ) => {
    try {
      const matches = await storage.searchMemories(ownerKey, command.query, 1);
      if (!matches[0]) return false;
      await storage.deactivateMemory(ownerKey, matches[0].id);
      logger.info("memory_deactivated", { memoryId: matches[0].id });
      return true;
    } catch (error) {
      logger.warn("memory_forget_failed", {
        errorCode: "memory_delete_failed",
      });
      return false;
    }
  };

  return {
    routeRequest: router
      ? (input: RouteRequest): Promise<RouteDecision> => router.route(input)
      : undefined,
    executeTool: toolSystem
      ? (input: {
          toolId: string;
          arguments: unknown;
          ownerKey: string;
          requestId: string;
        }) => toolSystem.execute(input)
      : undefined,
    async sendMessage(input: {
      conversationId?: string;
      text: string;
      visionResult?: VisionResult;
      visionSelection?: { overlayId: string; sourceIdentity: string };
    }): Promise<LumoTurnResult> {
      const startedAt = Date.now();
      const requestId = nanoid(12);
      const userText = normalizeInput(input.text);
      const personality = await loadPersonality();
      const memoryCommand = parseMemoryCommand(userText);
      logger.info("turn_started", {
        requestId,
        hasConversationId: Boolean(input.conversationId),
        command: memoryCommand?.type ?? "none",
      });

      let conversation = input.conversationId
        ? await storage.getConversation(ownerKey, input.conversationId)
        : null;
      if (input.conversationId && !conversation) {
        throw new LumoError(
          "conversation_not_found",
          `Conversation ${input.conversationId} was not found for owner ${ownerKey}`,
          "That conversation is no longer available. Start a new conversation instead."
        );
      }
      if (!conversation) {
        conversation = await storage.createConversation({
          ownerKey,
          title: titleFromMessage(userText),
          depthLevel: 1,
        });
      }

      const recentMessages = await storage.listMessages(
        conversation.id,
        LUMO_MESSAGE_LIMIT
      );
      const memoryResult =
        memoryCommand?.type === "recall"
          ? await (async () => {
              const result = await withFallback({
                primary: () => storage.listMemories(ownerKey),
                fallback: () => [],
                logger,
                requestId,
              });
              return { memories: result.value, failed: result.usedFallback };
            })()
          : await retrieveMemories(userText, requestId);
      let memories = memoryResult.memories;
      let memoryWrite: LumoTurnResult["diagnostics"]["memoryWrite"] =
        memoryResult.failed ? "failed" : "skipped";

      if (memoryCommand?.type === "remember") {
        const result = await storeMemory({
          ownerKey,
          kind: memoryCommand.kind,
          content: memoryCommand.content,
          importance: 85,
          source: "explicit",
        });
        memoryWrite = result.failed ? "failed" : "stored";
        if (result.memory)
          memories = [
            result.memory,
            ...memories.filter(memory => memory.id !== result.memory!.id),
          ].slice(0, LUMO_MEMORY_LIMIT);
      }
      if (memoryCommand?.type === "forget") {
        const forgotten = await applyForget(memoryCommand);
        memoryWrite = forgotten ? "stored" : "failed";
        memories = forgotten
          ? memories.filter(
              memory =>
                !memory.content
                  .toLowerCase()
                  .includes(memoryCommand.query.toLowerCase())
            )
          : memories;
      }

      const nextDepth = isGoDeeper(userText)
        ? Math.min(conversation.depthLevel + 1, 8)
        : conversation.depthLevel;
      const normalizedContext = contextManager.build(
        buildContextInput({
          requestId,
          recentMessages: recentMessages.map(message => ({
            role: message.role,
            content: message.content,
          })),
          memories,
          userText,
          depthLevel: nextDepth,
          depthTopic: conversation.depthTopic,
          summary: conversation.summary,
          personality,
          toolResults: input.visionResult
            ? [
                buildVisionContext(
                  visionResultToolResult(
                    input.visionResult,
                    input.visionSelection
                  )
                ),
              ].filter(
                (result): result is NonNullable<typeof result> =>
                  result !== null
              )
            : [],
        })
      );
      const providerMessages = normalizedContext.messages;

      try {
        let assistantContent: string;
        let model: string;
        if (memoryCommand?.type === "recall") {
          assistantContent = formatRecall(memories);
          model = "memory-local";
        } else {
          const providerAttempt = await withRetry({
            operation: () =>
              provider.complete({
                messages: providerMessages,
                model: ENV.lumoModel || undefined,
                maxTokens: ENV.lumoMaxTokens,
                timeoutMs: ENV.lumoTimeoutMs,
              }),
            logger,
            requestId,
            policy: { maxAttempts: 2, initialDelayMs: 0, jitter: 0 },
          });
          if (!providerAttempt.value) {
            throw (
              providerAttempt.fault ??
              new LumoError(
                "provider_failed",
                "Provider retry exhausted",
                "I'm having trouble reaching the AI service right now.",
                true
              )
            );
          }
          const providerResult = providerAttempt.value;
          assistantContent = providerResult.content;
          model = providerResult.model;
        }

        const inferredMemory = memoryCommand
          ? null
          : inferDurableMemory(userText);
        if (inferredMemory) {
          const result = await storeMemory(inferredMemory);
          memoryWrite = result.failed ? "failed" : "stored";
        }
        const persisted = await storage.appendTurn({
          conversationId: conversation.id,
          userContent: userText,
          assistantContent,
          model,
          requestId,
          memoryIds: memories.map(memory => memory.id),
        });
        const summary = buildConversationSummary(conversation.summary, [
          ...recentMessages,
          persisted.userMessage,
          persisted.assistantMessage,
        ]);
        try {
          await storage.updateConversation({
            conversationId: conversation.id,
            depthLevel: nextDepth,
            depthTopic: conversation.depthTopic || titleFromMessage(userText),
            summary,
          });
        } catch (error) {
          const fault = normalizeFault(error, {
            category: "persistence",
            requestId,
            retryable: false,
          });
          logger.warn("conversation_summary_failed", {
            errorCode: fault.code,
            category: fault.category,
            severity: fault.severity,
            requestId,
          });
        }
        const refreshedConversation = await storage.getConversation(
          ownerKey,
          conversation.id
        );
        const elapsedMs = Date.now() - startedAt;
        logger.info("turn_completed", {
          requestId,
          conversationId: conversation.id,
          elapsedMs,
          contextMessageCount: normalizedContext.metadata.messageCount,
          retrievedMemoryCount: normalizedContext.metadata.memoryCount,
          memoryWrite,
        });
        return {
          conversation: refreshedConversation ?? conversation,
          ...persisted,
          diagnostics: {
            requestId,
            model,
            elapsedMs,
            contextMessageCount: normalizedContext.metadata.messageCount,
            retrievedMemoryCount: normalizedContext.metadata.memoryCount,
            memoryWrite,
            depthLevel: nextDepth,
          },
        };
      } catch (error) {
        const fault = normalizeFault(error, { requestId });
        logger.error("turn_failed", {
          requestId,
          conversationId: conversation.id,
          elapsedMs: Date.now() - startedAt,
          errorCode: fault.code,
          category: fault.category,
          severity: fault.severity,
          retryable: fault.retryable,
        });
        throw error;
      }
    },
  };
}
