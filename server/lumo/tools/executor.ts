import { nanoid } from "nanoid";
import type { LumoLogger } from "../logger";
import { normalizeFault } from "../faults/normalize";
import { toolError, toolSuccess } from "./results";
import type {
  ToolPermissionChecker,
  ToolRegistry,
  ToolResult,
} from "./contracts";
import { requireSensitiveAuthorization } from "../security/safety";

export class ToolExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly permissions: ToolPermissionChecker,
    private readonly logger: LumoLogger
  ) {}

  async execute<TOutput = unknown>(input: {
    toolId: string;
    arguments: unknown;
    ownerKey: string;
    requestId?: string;
    authorization?: {
      authorized: boolean;
      action: string;
      reason: string;
      issuedAt: number;
    };
  }): Promise<ToolResult<TOutput>> {
    const requestId = input.requestId ?? nanoid(12);
    const startedAt = Date.now();
    this.logger.info("tool_requested", {
      toolId: input.toolId,
      requestId,
      ownerKey: input.ownerKey,
    });

    const tool = this.registry.get(input.toolId);
    if (!tool) {
      return this.fail<TOutput>(input.toolId, requestId, startedAt, {
        code: "unknown_tool",
        message: "The requested tool is not registered.",
        retryable: false,
      });
    }
    if (!tool.enabled) {
      return this.fail<TOutput>(tool.id, requestId, startedAt, {
        code: "tool_disabled",
        message: "The requested tool is currently disabled.",
        retryable: false,
      });
    }

    const parsed = tool.inputSchema.safeParse(input.arguments);
    if (!parsed.success) {
      this.logger.warn("tool_validation_failed", {
        toolId: tool.id,
        requestId,
        issueCount: parsed.error.issues.length,
      });
      return this.fail<TOutput>(tool.id, requestId, startedAt, {
        code: "invalid_arguments",
        message: "The tool arguments are invalid.",
        retryable: false,
      });
    }

    for (const permission of tool.permissions) {
      const allowed = await this.permissions.canUse(input.ownerKey, permission);
      if (!allowed) {
        this.logger.warn("tool_permission_denied", {
          toolId: tool.id,
          requestId,
          permission,
        });
        return this.fail<TOutput>(tool.id, requestId, startedAt, {
          code: "permission_denied",
          message: "The required permission for this tool was not granted.",
          retryable: false,
        });
      }
    }

    if (
      tool.sensitiveAction &&
      !requireSensitiveAuthorization(input.authorization, tool.sensitiveAction)
    ) {
      return this.fail<TOutput>(tool.id, requestId, startedAt, {
        code: "authorization_required",
        message: "Explicit authorization is required for this action.",
        retryable: false,
      });
    }

    this.logger.info("tool_execution_started", { toolId: tool.id, requestId });
    try {
      const output = await tool.handler(parsed.data, {
        ownerKey: input.ownerKey,
        requestId,
        logger: this.logger,
        authorization: input.authorization,
      });
      const parsedOutput = tool.outputSchema.safeParse(output);
      if (!parsedOutput.success) {
        this.logger.error("tool_execution_failed", {
          toolId: tool.id,
          requestId,
          errorCode: "invalid_output",
        });
        return this.fail<TOutput>(tool.id, requestId, startedAt, {
          code: "invalid_output",
          message: "The tool returned an invalid result.",
          retryable: false,
        });
      }
      const durationMs = Date.now() - startedAt;
      this.logger.info("tool_execution_completed", {
        toolId: tool.id,
        requestId,
        durationMs,
      });
      return toolSuccess<TOutput>(
        tool.id,
        requestId,
        durationMs,
        parsedOutput.data as TOutput
      );
    } catch (error) {
      const fault = normalizeFault(error, {
        category: "tool",
        requestId,
      });
      this.logger.error("tool_execution_failed", {
        toolId: tool.id,
        requestId,
        errorCode: fault.code,
        faultCategory: fault.category,
      });
      const normalizedCodes = new Set([
        "network_error",
        "provider_error",
        "timeout_error",
        "rate_limit_error",
        "validation_error",
      ]);
      return this.fail<TOutput>(tool.id, requestId, startedAt, {
        code: normalizedCodes.has(fault.code)
          ? (fault.code as NonNullable<
              ReturnType<typeof toolError>["error"]
            >["code"])
          : "execution_failed",
        message: "The tool could not complete safely.",
        retryable: fault.retryable,
      });
    }
  }

  private fail<TOutput>(
    toolId: string,
    requestId: string,
    startedAt: number,
    error: NonNullable<ReturnType<typeof toolError>["error"]>
  ): ToolResult<TOutput> {
    return toolError<TOutput>(toolId, requestId, Date.now() - startedAt, error);
  }
}
