import { normalizeFault } from "./normalize";

export const safeErrorMessage = (error: unknown, requestId?: string) =>
  normalizeFault(error, { requestId }).userMessage;
