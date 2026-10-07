import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";
import { LumoError } from "./errors";
import type {
  LumoProvider,
  ProviderRequest,
  ProviderResponse,
} from "./contracts";

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TOKENS = 1_200;

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number) => {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error("LUMO provider timed out")),
      timeoutMs
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
};

export class ManagedLumoProvider implements LumoProvider {
  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      throw new LumoError(
        "provider_not_configured",
        "MANUS_API_URL or MANUS_API_KEY is missing",
        "The AI provider is not configured on the server yet."
      );
    }

    try {
      const result = await withTimeout(
        invokeLLM({
          messages: request.messages,
          model: request.model || ENV.lumoModel || undefined,
          maxTokens: request.maxTokens ?? ENV.lumoMaxTokens,
        }),
        request.timeoutMs
      );
      const rawContent = result.choices?.[0]?.message?.content;
      const content = Array.isArray(rawContent)
        ? rawContent
            .filter(
              (part): part is { type: "text"; text: string } =>
                part.type === "text"
            )
            .map(part => part.text)
            .join("\n")
            .trim()
        : String(rawContent ?? "").trim();

      if (!content) {
        throw new LumoError(
          "empty_provider_response",
          "The provider returned no message content",
          "LUMO received an empty response. You can retry the same message.",
          true
        );
      }

      return {
        content,
        model:
          result.model || request.model || ENV.lumoModel || "platform-default",
        usage: result.usage
          ? {
              promptTokens: result.usage.prompt_tokens,
              completionTokens: result.usage.completion_tokens,
              totalTokens: result.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof LumoError) throw error;
      if (error instanceof Error && error.message.includes("timed out")) {
        throw new LumoError(
          "provider_timeout",
          error.message,
          "LUMO took too long to respond. Your message is still available to retry.",
          true,
          { cause: error }
        );
      }
      throw new LumoError(
        "provider_failed",
        error instanceof Error ? error.message : "Unknown provider error",
        "LUMO could not reach the AI provider. Your message is still available to retry.",
        true,
        { cause: error }
      );
    }
  }
}

export const defaultProviderSettings = {
  timeoutMs: ENV.lumoTimeoutMs || DEFAULT_TIMEOUT_MS,
  maxTokens: ENV.lumoMaxTokens || DEFAULT_MAX_TOKENS,
};
