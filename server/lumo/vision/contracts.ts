import { z } from "zod";

export const VISION_IMAGE_TYPES = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
] as const;
export type VisionImageType = (typeof VISION_IMAGE_TYPES)[number];
export const MAX_VISION_IMAGE_BYTES = 5_000_000;
export const MAX_VISION_PROMPT_CHARS = 1_000;

export const visionModeSchema = z.enum([
  "understand",
  "describe",
  "objects",
  "ocr",
  "scene",
  "question",
]);
export type VisionMode = z.infer<typeof visionModeSchema>;

export type VisionSource = {
  kind: "managed_file" | "upload" | "camera";
  identity: string;
  mimeType: string;
  byteLength: number;
  dimensions?: { width: number; height: number };
};
export type VisionRegion = {
  label: string;
  confidence?: number;
  box?: { x: number; y: number; width: number; height: number };
};
export type VisionTextObservation = {
  text: string;
  confidence?: number;
  region?: VisionRegion["box"];
};
export type VisionObservation = {
  label: string;
  value: string;
  confidence?: number;
};

export type VisionResult = {
  requestId: string;
  source: VisionSource;
  description: string | null;
  objects: VisionRegion[];
  text: VisionTextObservation[];
  observations: VisionObservation[];
  confidence: number | null;
  provider: { name: string; model: string | null };
  diagnostics: { durationMs: number; truncated: boolean };
  error: { code: string; message: string; retryable: boolean } | null;
  contentTrust: "untrusted_visual_data";
};

export type VisionProviderInput = {
  requestId: string;
  dataUrl: string;
  mimeType: string;
  prompt: string;
  mode: VisionMode;
};
export type VisionProviderResponse = {
  description?: string;
  objects?: VisionRegion[];
  text?: VisionTextObservation[];
  observations?: VisionObservation[];
  confidence?: number;
  model?: string;
};
export interface VisionProvider {
  analyze(input: VisionProviderInput): Promise<VisionProviderResponse>;
  name: string;
}

export const visionAnalyzeInputSchema = z.object({
  source: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("managed_file"),
      fileId: z.string().regex(/^file_[a-zA-Z0-9_-]{10,40}$/),
    }),
    z.object({ kind: z.literal("upload"), dataUrl: z.string().max(7_000_000) }),
  ]),
  mode: visionModeSchema.default("understand"),
  prompt: z.string().trim().max(MAX_VISION_PROMPT_CHARS).optional(),
});
export const cameraCaptureInputSchema = z.object({
  dataUrl: z.string().max(7_000_000),
  mode: visionModeSchema.default("understand"),
  prompt: z.string().trim().max(MAX_VISION_PROMPT_CHARS).optional(),
});

export const visionResultSchema = z.object({
  requestId: z.string(),
  source: z.object({
    kind: z.enum(["managed_file", "upload", "camera"]),
    identity: z.string(),
    mimeType: z.string(),
    byteLength: z.number(),
    dimensions: z.object({ width: z.number(), height: z.number() }).optional(),
  }),
  description: z.string().nullable(),
  objects: z.array(
    z.object({
      label: z.string(),
      confidence: z.number().optional(),
      box: z
        .object({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        })
        .optional(),
    })
  ),
  text: z.array(
    z.object({
      text: z.string(),
      confidence: z.number().optional(),
      region: z
        .object({
          x: z.number(),
          y: z.number(),
          width: z.number(),
          height: z.number(),
        })
        .optional(),
    })
  ),
  observations: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      confidence: z.number().optional(),
    })
  ),
  confidence: z.number().nullable(),
  provider: z.object({ name: z.string(), model: z.string().nullable() }),
  diagnostics: z.object({ durationMs: z.number(), truncated: z.boolean() }),
  error: z
    .object({ code: z.string(), message: z.string(), retryable: z.boolean() })
    .nullable(),
  contentTrust: z.literal("untrusted_visual_data"),
});
