import { LumoError } from "../errors";
import type { LumoProvider, ProviderRequest, ProviderResponse } from "../contracts";
import type { VpsConfig } from "./contracts";

/**
 * Talks to Peter's own VPS as an OpenAI-compatible chat-completions
 * backend (the shape every common self-hosted inference server — vLLM,
 * Ollama's OpenAI-compat mode, LocalAI, text-generation-webui, llama.cpp's
 * server — speaks). A real network call, no mock response: if the VPS is
 * down, this throws, and the caller (AiProviderManager) is what decides to
 * fall back to the managed backend.
 */
export class VpsLumoProvider implements LumoProvider {
  constructor(private readonly config: VpsConfig) {}

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const response = await fetch(this.endpoint("/chat/completions"), {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({
          model: request.model || this.config.model || "default",
          messages: request.messages,
          max_tokens: request.maxTokens,
          stream: false,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new LumoError(
          "provider_failed",
          `VPS provider returned ${response.status}: ${body.slice(0, 300)}`,
          "Your VPS AI backend returned an error.",
          true
        );
      }
      const data = (await response.json()) as {
        model?: string;
        choices?: Array<{ message?: { content?: unknown } }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };
      const rawContent = data.choices?.[0]?.message?.content;
      const content = Array.isArray(rawContent)
        ? rawContent
            .filter(
              (part): part is { type: string; text: string } =>
                typeof part === "object" &&
                part !== null &&
                (part as { type?: string }).type === "text"
            )
            .map(part => part.text)
            .join("\n")
            .trim()
        : String(rawContent ?? "").trim();
      if (!content)
        throw new LumoError(
          "empty_provider_response",
          "VPS provider returned no message content",
          "Your VPS AI backend returned an empty response.",
          true
        );
      return {
        content,
        model: data.model || this.config.model || "vps-model",
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      if (error instanceof LumoError) throw error;
      if (error instanceof Error && error.name === "AbortError")
        throw new LumoError(
          "provider_timeout",
          "VPS provider timed out",
          "Your VPS AI backend took too long to respond.",
          true,
          { cause: error }
        );
      throw new LumoError(
        "provider_failed",
        error instanceof Error ? error.message : "Unknown VPS provider error",
        "Could not reach your VPS AI backend.",
        true,
        { cause: error }
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /** Cheap real reachability check — no generation, just "is it up". */
  async ping(timeoutMs = 6000): Promise<{ ok: boolean; error?: string; latencyMs: number }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const started = Date.now();
    try {
      const response = await fetch(this.endpoint("/models"), {
        headers: this.headers(),
        signal: controller.signal,
      });
      // A 404 on /models still proves the host is up and speaking HTTP —
      // not every OpenAI-compatible server implements that route.
      const ok = response.ok || response.status === 404 || response.status === 401;
      return { ok, latencyMs: Date.now() - started, error: ok ? undefined : `HTTP ${response.status}` };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        error: error instanceof Error ? error.message : "Unreachable",
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
    };
  }

  private endpoint(suffix: "/chat/completions" | "/models") {
    const base = this.config.baseUrl.replace(/\/+$/, "");
    if (base.endsWith(suffix)) return base;
    const withoutKnownSuffix = base.replace(/\/(chat\/completions|models)$/, "");
    return `${withoutKnownSuffix}${suffix}`;
  }
}
