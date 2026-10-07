import { createContextManager } from "../../context/manager";
import type {
  ContextBuildInput,
  NormalizedContext,
} from "../../context/contracts";
import type { LumoLogger } from "../../logger";
import type { ToolResult } from "../contracts";

export const buildUtilityContext = (
  logger: LumoLogger,
  input: Omit<ContextBuildInput, "toolResults"> & {
    utilityResult: ToolResult<unknown>;
  }
): NormalizedContext =>
  createContextManager(logger).build({
    ...input,
    toolResults: [input.utilityResult],
    priorities: { toolResult: 78, ...(input.priorities ?? {}) },
  });
