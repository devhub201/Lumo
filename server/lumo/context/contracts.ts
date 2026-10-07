import type { Message } from "../../_core/llm";
import type { LumoMemory, LumoPersonality } from "../contracts";
import type { ToolResult } from "../tools/contracts";

export type ContextSourceName =
  | "currentRequest"
  | "systemContext"
  | "recentConversation"
  | "relevantMemory"
  | "conversationSummary"
  | "toolResult";

export type ContextPriorities = Record<ContextSourceName, number>;

export type ContextBudget = {
  maxRecentMessages: number;
  maxMemoryItems: number;
  maxSummaryLength: number;
  maxToolResultChars: number;
  maxContextTokens: number;
  maxSystemChars: number;
  estimateCharsPerToken: number;
};

export type ContextMessage = {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
};

export type ContextDiagnostics = {
  estimatedTokens: number;
  estimatedCharacters: number;
  messageCount: number;
  memoryCount: number;
  summaryCharacters: number;
  toolResultCharacters: number;
  truncated: boolean;
  omittedSources: ContextSourceName[];
  priorities: ContextPriorities;
};

export type NormalizedContext = {
  systemContext: string[];
  userContext: string[];
  conversationSummary: string | null;
  recentMessages: ContextMessage[];
  relevantMemories: LumoMemory[];
  toolResults: Array<ToolResult<unknown>>;
  currentRequest: string;
  messages: Message[];
  metadata: ContextDiagnostics;
};

export type ContextBuildInput = {
  requestId?: string;
  currentRequest: string;
  personality: LumoPersonality;
  systemContext?: string[];
  userContext?: string[];
  recentMessages?: ContextMessage[];
  conversationSummary?: string | null;
  relevantMemories?: LumoMemory[];
  toolResults?: Array<ToolResult<unknown>>;
  budget?: Partial<ContextBudget>;
  priorities?: Partial<ContextPriorities>;
};

export type ContextManager = {
  build(input: ContextBuildInput): NormalizedContext;
};

export const DEFAULT_CONTEXT_BUDGET: ContextBudget = {
  maxRecentMessages: 12,
  maxMemoryItems: 5,
  maxSummaryLength: 1400,
  maxToolResultChars: 2000,
  maxContextTokens: 6000,
  maxSystemChars: 12000,
  estimateCharsPerToken: 4,
};

export const DEFAULT_CONTEXT_PRIORITIES: ContextPriorities = {
  currentRequest: 100,
  systemContext: 90,
  recentConversation: 80,
  relevantMemory: 70,
  conversationSummary: 60,
  toolResult: 75,
};
