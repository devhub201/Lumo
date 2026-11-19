import type { LumoProvider, LumoStorage, ProviderRequest, ProviderResponse } from "../contracts";
import { ManagedLumoProvider } from "../provider";
import { VpsLumoProvider } from "./vps-provider";
import type { AiProviderMode, AiProviderStatus, VpsConfig } from "./contracts";

const SETTING_KEY = "ai_provider_config";

type PersistedConfig = {
  mode: AiProviderMode;
  vps: VpsConfig | null;
  lastCheckedAt: number | null;
  lastError: string | null;
  lastConnected: boolean;
  lastProviderUsed: "vps" | "managed" | null;
};

const DEFAULT_CONFIG: PersistedConfig = {
  mode: "managed",
  vps: null,
  lastCheckedAt: null,
  lastError: null,
  lastConnected: false,
  lastProviderUsed: null,
};

/**
 * The single live AI provider for Lumo. Reads Peter's saved choice (managed
 * vs his own VPS) fresh on every request — never frozen at server start —
 * and when he's on VPS mode, automatically falls back to the managed
 * backend if the VPS doesn't answer, exactly as he asked: "agar vps gone,
 * app khud managed pe switch ho jaye." Everything here is stored in
 * Lumo's own app database (lumo_settings), never on the VPS itself.
 */
export class AiProviderManager implements LumoProvider {
  private readonly managed = new ManagedLumoProvider();

  constructor(
    private readonly storage: LumoStorage,
    private readonly ownerKey: string
  ) {}

  private async load(): Promise<PersistedConfig> {
    const raw = await this.storage.getSetting(this.ownerKey, SETTING_KEY).catch(() => null);
    if (!raw) return { ...DEFAULT_CONFIG };
    try {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_CONFIG };
    }
  }

  private async save(config: PersistedConfig) {
    await this.storage.setSetting(this.ownerKey, SETTING_KEY, JSON.stringify(config));
  }

  async getStatus(): Promise<AiProviderStatus> {
    const config = await this.load();
    return {
      mode: config.mode,
      vps: config.vps
        ? {
            baseUrl: config.vps.baseUrl,
            model: config.vps.model,
            apiKeySet: Boolean(config.vps.apiKey),
            apiKeyMasked: config.vps.apiKey ? `••••${config.vps.apiKey.slice(-4)}` : undefined,
            connected: config.lastConnected,
            lastCheckedAt: config.lastCheckedAt,
            lastError: config.lastError,
          }
        : null,
      fallbackActive: config.mode === "vps" && config.lastProviderUsed === "managed",
      lastProviderUsed: config.lastProviderUsed,
    };
  }

  async setConfig(input: { mode: AiProviderMode; vps?: VpsConfig }): Promise<AiProviderStatus> {
    const current = await this.load();
    if (input.mode === "vps" && !input.vps && !current.vps)
      throw new Error("Your VPS address is required before Lumo can connect to it.");
    const next: PersistedConfig = {
      ...current,
      mode: input.mode,
      vps: input.vps ?? current.vps,
      // A new VPS config invalidates any previous connectivity check.
      lastConnected: input.vps ? false : current.lastConnected,
      lastError: input.vps ? null : current.lastError,
      lastCheckedAt: input.vps ? null : current.lastCheckedAt,
    };
    await this.save(next);
    return this.getStatus();
  }

  async testConnection(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const config = await this.load();
    if (!config.vps) throw new Error("No VPS is configured yet — add your VPS address first.");
    const result = await new VpsLumoProvider(config.vps).ping();
    await this.save({
      ...config,
      lastCheckedAt: Date.now(),
      lastConnected: result.ok,
      lastError: result.ok ? null : result.error ?? "Unreachable",
    });
    return result;
  }

  async complete(request: ProviderRequest): Promise<ProviderResponse> {
    const config = await this.load();
    if (config.mode !== "vps" || !config.vps) {
      if (config.lastProviderUsed !== "managed")
        await this.save({ ...config, lastProviderUsed: "managed" });
      return this.managed.complete(request);
    }
    try {
      const response = await new VpsLumoProvider(config.vps).complete(request);
      await this.save({
        ...config,
        lastProviderUsed: "vps",
        lastConnected: true,
        lastError: null,
        lastCheckedAt: Date.now(),
      });
      return response;
    } catch (error) {
      // The VPS didn't answer — fall back to managed rather than leaving
      // Peter without a reply. The failure is recorded, not hidden, so the
      // Settings screen can show the fallback actually happened.
      await this.save({
        ...config,
        lastProviderUsed: "managed",
        lastConnected: false,
        lastError: error instanceof Error ? error.message : "VPS request failed",
        lastCheckedAt: Date.now(),
      });
      return this.managed.complete(request);
    }
  }
}
