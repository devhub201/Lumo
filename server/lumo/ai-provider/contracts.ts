import { z } from "zod";

export const aiProviderModeSchema = z.enum(["managed", "vps"]);
export type AiProviderMode = z.infer<typeof aiProviderModeSchema>;

export const vpsConfigSchema = z.object({
  baseUrl: z
    .string()
    .url()
    .max(300)
    .refine(
      value => ["http:", "https:"].includes(new URL(value).protocol),
      "VPS address must be an http(s) URL"
    ),
  apiKey: z.string().max(400).optional(),
  model: z.string().max(200).optional(),
});
export type VpsConfig = z.infer<typeof vpsConfigSchema>;

export const aiProviderSettingsInputSchema = z.object({
  mode: aiProviderModeSchema,
  vps: vpsConfigSchema.optional(),
});
export type AiProviderSettingsInput = z.infer<typeof aiProviderSettingsInputSchema>;

export type AiProviderStatus = {
  mode: AiProviderMode;
  vps: {
    baseUrl: string;
    model?: string;
    apiKeySet: boolean;
    apiKeyMasked?: string;
    connected: boolean;
    lastCheckedAt: number | null;
    lastError: string | null;
  } | null;
  /** True once a vps-mode request has actually had to fall back to the managed backend. */
  fallbackActive: boolean;
  lastProviderUsed: "vps" | "managed" | null;
};
