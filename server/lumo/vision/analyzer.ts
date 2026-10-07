import { nanoid } from "nanoid";
import { normalizeFault } from "../faults/normalize";
import { LumoError } from "../errors";
import type { VisionMode, VisionProvider, VisionResult } from "./contracts";
import { visionInputAdapter } from "./input";

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new LumoError(
            "provider_timeout",
            "Vision analysis timed out",
            "Image analysis took too long. You can retry.",
            true
          )
        ),
      timeoutMs
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
const safeConfidence = (value: unknown) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  value >= 0 &&
  value <= 1
    ? value
    : undefined;
const safeText = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, 4_000)
    : undefined;
const normalizedError = (error: unknown, requestId: string) => {
  const fault = normalizeFault(error, {
    requestId,
    category: "provider",
    retryable: true,
  });
  return {
    code: fault.code,
    message: fault.userMessage,
    retryable: fault.retryable,
  };
};

export const analyzeVision = async (input: {
  ownerKey: string;
  requestId?: string;
  source:
    | { kind: "managed_file"; fileId: string }
    | { kind: "upload" | "camera"; dataUrl: string };
  mode: VisionMode;
  prompt?: string;
  provider: VisionProvider;
  timeoutMs?: number;
}): Promise<VisionResult> => {
  const requestId = input.requestId || nanoid(12);
  const started = Date.now();
  try {
    const adapted =
      input.source.kind === "managed_file"
        ? await visionInputAdapter.fromManagedFile(
            input.ownerKey,
            input.source.fileId,
            input.mode,
            input.prompt
          )
        : await visionInputAdapter.fromDataUrl(
            input.source.dataUrl,
            input.source.kind,
            input.source.kind,
            input.mode,
            input.prompt
          );
    adapted.requestId = requestId;
    const response = await withTimeout(
      input.provider.analyze(adapted),
      input.timeoutMs ?? 45_000
    );
    return {
      requestId,
      source: adapted.source,
      description: safeText(response.description) ?? null,
      objects: Array.isArray(response.objects)
        ? response.objects.slice(0, 100)
        : [],
      text: Array.isArray(response.text) ? response.text.slice(0, 100) : [],
      observations: Array.isArray(response.observations)
        ? response.observations.slice(0, 100)
        : [],
      confidence: safeConfidence(response.confidence) ?? null,
      provider: {
        name: input.provider.name,
        model: safeText(response.model) ?? null,
      },
      diagnostics: { durationMs: Date.now() - started, truncated: false },
      error: null,
      contentTrust: "untrusted_visual_data",
    };
  } catch (error) {
    const fault = normalizedError(error, requestId);
    return {
      requestId,
      source: {
        kind: input.source.kind,
        identity:
          input.source.kind === "managed_file"
            ? input.source.fileId
            : input.source.kind,
        mimeType: "unknown",
        byteLength: 0,
      },
      description: null,
      objects: [],
      text: [],
      observations: [],
      confidence: null,
      provider: { name: input.provider.name, model: null },
      diagnostics: { durationMs: Date.now() - started, truncated: false },
      error: fault,
      contentTrust: "untrusted_visual_data",
    };
  }
};

export const assertVisionSucceeded = (result: VisionResult) => {
  if (result.error)
    throw new LumoError(
      result.error.code as never,
      result.error.code,
      result.error.message,
      result.error.retryable
    );
  return result;
};
