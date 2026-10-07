import type { LumoLogger } from "../logger";

export const contextDiagnostics = (logger: LumoLogger) => ({
  started: (fields: Record<string, unknown> = {}) =>
    logger.info("context.build.started", fields),
  completed: (fields: Record<string, unknown> = {}) =>
    logger.info("context.build.completed", fields),
  messagesSelected: (count: number) =>
    logger.info("context.messages.selected", { count }),
  memoriesSelected: (count: number) =>
    logger.info("context.memories.selected", { count }),
  summaryUsed: (used: boolean) => logger.info("context.summary.used", { used }),
  truncated: (fields: Record<string, unknown> = {}) =>
    logger.info("context.truncated", fields),
  estimatedSize: (fields: Record<string, unknown> = {}) =>
    logger.info("context.estimated_size", fields),
  failed: (errorCode: string, fields: Record<string, unknown> = {}) =>
    logger.warn("context.build.failed", { errorCode, ...fields }),
});
