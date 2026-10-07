import type { z } from "zod";
import type { LumoLogger } from "../logger";

export type ToolCategory =
  | "productivity"
  | "data"
  | "communication"
  | "system"
  | "media"
  | "external"
  | "automation";

export type ToolPermission =
  | "camera"
  | "microphone"
  | "files"
  | "network"
  | "location"
  | "automation"
  | (string & {});

export type ToolError = {
  code:
    | "unknown_tool"
    | "tool_disabled"
    | "invalid_arguments"
    | "permission_denied"
    | "execution_failed"
    | "invalid_output"
    | "network_error"
    | "provider_error"
    | "timeout_error"
    | "rate_limit_error"
    | "validation_error";
  message: string;
  retryable: boolean;
};

export type ToolResult<TOutput = unknown> = {
  success: boolean;
  toolId: string;
  data: TOutput | null;
  error: ToolError | null;
  metadata: {
    requestId: string;
    durationMs: number;
  };
};

export type ToolExecutionContext = {
  ownerKey: string;
  requestId: string;
  logger: LumoLogger;
};

export type ToolHandler<TInput, TOutput> = (
  input: TInput,
  context: ToolExecutionContext
) => Promise<TOutput> | TOutput;

export type ToolDefinition<TInput = unknown, TOutput = unknown> = {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  permissions: ToolPermission[];
  enabled: boolean;
  handler: ToolHandler<TInput, TOutput>;
};

export type PublicToolMetadata = Pick<
  ToolDefinition,
  "id" | "name" | "description" | "category" | "permissions" | "enabled"
>;

export interface ToolPermissionChecker {
  canUse(ownerKey: string, permission: ToolPermission): Promise<boolean>;
}

export interface ToolRegistry {
  register<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void;
  get(toolId: string): ToolDefinition | undefined;
  list(): ToolDefinition[];
  listPublic(): PublicToolMetadata[];
  setEnabled(toolId: string, enabled: boolean): void;
}

export interface ToolSystem {
  execute<TOutput = unknown>(input: {
    toolId: string;
    arguments: unknown;
    ownerKey: string;
    requestId: string;
  }): Promise<ToolResult<TOutput>>;
  listTools(): PublicToolMetadata[];
}
