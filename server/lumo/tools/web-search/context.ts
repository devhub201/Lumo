import type { LumoLogger } from "../../logger";
import { createContextManager } from "../../context/manager";
import type {
  ContextBuildInput,
  NormalizedContext,
} from "../../context/contracts";
import type { ToolResult } from "../contracts";
import type { WebSearchOutput } from "./contracts";

export const buildWebSearchContext = (
  logger: LumoLogger,
  input: Omit<ContextBuildInput, "toolResults"> & {
    searchResult: ToolResult<WebSearchOutput>;
  }
): NormalizedContext =>
  createContextManager(logger).build({
    ...input,
    toolResults: [input.searchResult],
    priorities: { toolResult: 78, ...(input.priorities ?? {}) },
  });
