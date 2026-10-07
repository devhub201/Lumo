import type { ToolError, ToolResult } from "./contracts";

export const toolError = <TOutput = never>(
  toolId: string,
  requestId: string,
  durationMs: number,
  error: ToolError
): ToolResult<TOutput> => ({
  success: false,
  toolId,
  data: null,
  error,
  metadata: { requestId, durationMs },
});

export const toolSuccess = <TOutput>(
  toolId: string,
  requestId: string,
  durationMs: number,
  data: TOutput
): ToolResult<TOutput> => ({
  success: true,
  toolId,
  data,
  error: null,
  metadata: { requestId, durationMs },
});
