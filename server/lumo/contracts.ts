import type { Message } from "../_core/llm";

export const LUMO_MESSAGE_LIMIT = 24;
export const LUMO_MEMORY_LIMIT = 5;
export const LUMO_PERSONALITY_SETTING_KEY = "personality" as const;

export type MemoryKind =
  | "user_profile"
  | "preference"
  | "important_fact"
  | "fact"
  | "project"
  | "recurring_context"
  | "conversation_summary"
  | "summary"
  | "knowledge";
export type LumoMessageRole = "user" | "assistant" | "system" | "tool";

export type LumoPersonality = {
  name: "LUMO";
  ownerName: "Peter";
  traits: string[];
  responseStyle: string[];
  boundaries: string[];
};

export type LumoConversation = {
  id: string;
  ownerKey: string;
  title: string;
  depthLevel: number;
  depthTopic: string | null;
  summary: string | null;
  summaryUpdatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
};

export type LumoMessage = {
  id: string;
  conversationId: string;
  sequence: number;
  role: LumoMessageRole;
  content: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

export type LumoMemory = {
  id: string;
  ownerKey: string;
  kind: MemoryKind;
  content: string;
  tags: string | null;
  importance: number;
  isActive: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateMemoryInput = {
  ownerKey: string;
  kind: MemoryKind;
  content: string;
  tags?: string;
  importance?: number;
  source?: "explicit" | "inferred" | "conversation_summary";
};

export type ProviderRequest = {
  messages: Message[];
  model?: string;
  maxTokens?: number;
  timeoutMs: number;
};

export type ProviderResponse = {
  content: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

export interface LumoProvider {
  complete(request: ProviderRequest): Promise<ProviderResponse>;
}

export interface LumoStorage {
  createConversation(input: {
    ownerKey: string;
    title: string;
    depthLevel?: number;
    depthTopic?: string | null;
  }): Promise<LumoConversation>;
  getConversation(
    ownerKey: string,
    conversationId: string
  ): Promise<LumoConversation | null>;
  listConversations(ownerKey: string): Promise<LumoConversation[]>;
  listMessages(
    ownerKey: string,
    conversationId: string,
    limit: number
  ): Promise<LumoMessage[]>;
  appendTurn(input: {
    ownerKey: string;
    conversationId: string;
    userContent: string;
    assistantContent: string;
    model: string;
    requestId: string;
    memoryIds: string[];
  }): Promise<{ userMessage: LumoMessage; assistantMessage: LumoMessage }>;
  updateConversation(input: {
    ownerKey: string;
    conversationId: string;
    depthLevel: number;
    depthTopic?: string | null;
    summary?: string | null;
  }): Promise<void>;
  listMemories(ownerKey: string): Promise<LumoMemory[]>;
  searchMemories(
    ownerKey: string,
    query: string,
    limit: number
  ): Promise<LumoMemory[]>;
  createMemory(input: CreateMemoryInput): Promise<LumoMemory>;
  deactivateMemory(ownerKey: string, memoryId: string): Promise<void>;
  getSetting(ownerKey: string, settingKey: string): Promise<string | null>;
  setSetting(
    ownerKey: string,
    settingKey: string,
    value: string
  ): Promise<void>;
}

export type CapabilityName =
  | "tools"
  | "files"
  | "web"
  | "vision"
  | "voice"
  | "blueprints";

export type CapabilityDefinition = {
  name: CapabilityName;
  description: string;
  enabled: boolean;
  requiresApproval?: boolean;
};

export interface PermissionChecker {
  canUse(ownerKey: string, capability: CapabilityName): Promise<boolean>;
}

export interface LumoToolBoundary {
  execute<TOutput = unknown>(input: {
    toolId: string;
    arguments: unknown;
    ownerKey: string;
    requestId: string;
  }): Promise<
    unknown & { toolId: string; success: boolean; data: TOutput | null }
  >;
  listTools(): Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    permissions: string[];
    enabled: boolean;
  }>;
}

export type LumoDiagnostics = {
  requestId: string;
  model: string;
  elapsedMs: number;
  contextMessageCount: number;
  retrievedMemoryCount: number;
  memoryWrite?: "stored" | "skipped" | "failed";
  depthLevel: number;
};

export type LumoTurnResult = {
  conversation: LumoConversation;
  userMessage: LumoMessage;
  assistantMessage: LumoMessage;
  diagnostics: LumoDiagnostics;
};
