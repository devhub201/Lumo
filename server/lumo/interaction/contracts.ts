import { z } from "zod";
export const interactionModeSchema = z.enum([
  "text",
  "voice",
  "camera",
  "teaching",
  "blueprint",
]);
export type InteractionMode = z.infer<typeof interactionModeSchema>;
export const voiceStateSchema = z.enum([
  "idle",
  "requesting_permission",
  "listening",
  "processing",
  "speaking",
  "paused",
  "stopping",
  "error",
]);
export type VoiceState = z.infer<typeof voiceStateSchema>;
export type VoiceStatus = {
  mode: InteractionMode;
  state: VoiceState;
  message: string | null;
  requestId?: string;
};
export type VoiceInputProvider = {
  startListening: (onResult: (text: string) => void) => Promise<void>;
  stopListening: () => void;
  cancel: () => void;
};
export type SpeechOutputProvider = {
  speak: (text: string, onComplete?: () => void) => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
};
export const modeCommandSchema = z.enum([
  "voice",
  "text",
  "camera",
  "teaching",
  "blueprint",
]);
