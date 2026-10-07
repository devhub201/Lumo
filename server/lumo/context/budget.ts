import type {
  ContextMessage,
  ContextBudget,
  ContextDiagnostics,
  ContextPriorities,
  ContextSourceName,
} from "./contracts";
import type { LumoMemory } from "../contracts";
import type { ToolResult } from "../tools/contracts";

export const estimateTokens = (value: string, charsPerToken: number) =>
  Math.max(1, Math.ceil(value.length / Math.max(1, charsPerToken)));

export const truncateText = (value: string, maxLength: number) =>
  value.length <= maxLength
    ? value
    : `${value.slice(0, Math.max(0, maxLength - 1))}…`;

export const formatMemory = (memory: LumoMemory) =>
  `- [${memory.kind}] ${memory.content}${memory.tags ? ` (${memory.tags})` : ""}`;

export const formatToolResult = (result: ToolResult<unknown>) => {
  if (result.success)
    return `[${result.toolId}] ${JSON.stringify(result.data)}`;
  return `[${result.toolId}] Tool failed: ${result.error?.message ?? "unknown error"}`;
};

export const estimateContext = (input: {
  systemContext: string[];
  userContext: string[];
  summary: string | null;
  recentMessages: ContextMessage[];
  memories: LumoMemory[];
  toolResults: Array<ToolResult<unknown>>;
  budget: ContextBudget;
  priorities: ContextPriorities;
  currentRequest: string;
}): ContextDiagnostics => {
  const charsPerToken =
    Number.isFinite(input.budget.estimateCharsPerToken) &&
    input.budget.estimateCharsPerToken > 0
      ? input.budget.estimateCharsPerToken
      : 4;
  const estimatedCharacters = [
    ...input.systemContext,
    ...input.userContext,
    input.summary ?? "",
    ...input.recentMessages.map(message => message.content),
    ...input.memories.map(formatMemory),
    ...input.toolResults.map(formatToolResult),
    input.currentRequest,
  ].join("\n").length;
  return {
    estimatedTokens: Math.max(
      1,
      Math.ceil(estimatedCharacters / charsPerToken)
    ),
    estimatedCharacters,
    messageCount: input.recentMessages.length,
    memoryCount: input.memories.length,
    summaryCharacters: input.summary?.length ?? 0,
    toolResultCharacters: input.toolResults.reduce(
      (total, result) => total + formatToolResult(result).length,
      0
    ),
    truncated: false,
    omittedSources: [],
    priorities: input.priorities,
  };
};

export const reduceToBudget = (input: {
  systemContext: string[];
  userContext: string[];
  summary: string | null;
  recentMessages: ContextMessage[];
  memories: LumoMemory[];
  toolResults: Array<ToolResult<unknown>>;
  currentRequest: string;
  budget: ContextBudget;
  priorities: ContextPriorities;
}) => {
  let systemContext = input.systemContext.map(value =>
    truncateText(value, input.budget.maxSystemChars)
  );
  let userContext = [...input.userContext];
  let summary = input.summary
    ? truncateText(input.summary, input.budget.maxSummaryLength)
    : null;
  let recentMessages = input.recentMessages.slice(
    -input.budget.maxRecentMessages
  );
  let memories = input.memories.slice(0, input.budget.maxMemoryItems);
  let toolResults = input.toolResults.map(result => {
    if (!result.success || !result.data) return result;
    return {
      ...result,
      data: truncateText(
        JSON.stringify(result.data),
        input.budget.maxToolResultChars
      ),
    };
  });
  const omittedSources: ContextSourceName[] = [];
  let truncated = false;

  const calculate = () =>
    estimateContext({
      systemContext,
      userContext,
      summary,
      recentMessages,
      memories,
      toolResults,
      budget: input.budget,
      priorities: input.priorities,
      currentRequest: input.currentRequest,
    });
  let diagnostics = calculate();
  const removeOne = (source: ContextSourceName) => {
    if (source === "recentConversation" && recentMessages.length > 0)
      recentMessages = recentMessages.slice(1);
    else if (source === "relevantMemory" && memories.length > 0)
      memories = memories.slice(0, -1);
    else if (source === "conversationSummary" && summary) summary = null;
    else if (source === "toolResult" && toolResults.length > 0)
      toolResults = toolResults.slice(0, -1);
    else if (source === "systemContext" && systemContext.length > 1)
      systemContext = systemContext.slice(0, -1);
    else return false;
    truncated = true;
    if (!omittedSources.includes(source)) omittedSources.push(source);
    return true;
  };

  const removable = (Object.keys(input.priorities) as ContextSourceName[])
    .filter(source => source !== "currentRequest")
    .sort((a, b) => input.priorities[a] - input.priorities[b]);
  let guard = 0;
  while (
    diagnostics.estimatedTokens > input.budget.maxContextTokens &&
    guard < 1000
  ) {
    guard += 1;
    const source = removable.find(candidate =>
      candidate === "recentConversation"
        ? recentMessages.length > 0
        : candidate === "relevantMemory"
          ? memories.length > 0
          : candidate === "conversationSummary"
            ? Boolean(summary)
            : candidate === "toolResult"
              ? toolResults.length > 0
              : candidate === "systemContext"
                ? systemContext.length > 1
                : false
    );
    if (!source || !removeOne(source)) break;
    diagnostics = calculate();
  }
  diagnostics.truncated = truncated;
  diagnostics.omittedSources = omittedSources;
  return {
    systemContext,
    userContext,
    summary,
    recentMessages,
    memories,
    toolResults,
    diagnostics,
  };
};
