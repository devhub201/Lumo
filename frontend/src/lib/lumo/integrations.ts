import { getBackendIntegrations } from "./backend";
import { isOnDeviceAiNative, localOnDeviceChat } from "./local-ai";

/** Native/API adapters are injected by the host or the configured LUMO backend. */
export interface MusicTrack {
  id: string;
  uri?: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  durationMs: number;
}
export interface MusicState {
  track: MusicTrack;
  positionMs: number;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: boolean;
  queue: MusicTrack[];
}
export type MusicAction = "toggle" | "next" | "previous" | "shuffle" | "repeat" | "seek" | "select";
/** Implement with the Spotify Web API / SDK. Every call returns the real player state. */
export interface LumoMusicAdapter {
  play: (query: string, signal: AbortSignal) => Promise<MusicState>;
  control: (action: MusicAction, value?: number | string) => Promise<MusicState>;
  /** Optional push updates from the player; returns an unsubscribe function. */
  subscribe?: (listener: (state: MusicState) => void) => () => void;
}
export interface LumoIntegrations {
  authenticate?: (signal: AbortSignal) => Promise<{ verified: boolean }>;
  recoverIdentity?: (email: string, signal: AbortSignal) => Promise<void>;
  chat?: (
    messages: Array<{ role: "user" | "assistant"; content: string }>,
    signal: AbortSignal,
    conversationKey?: string,
  ) => Promise<string>;
  analyzeImage?: (image: Blob, signal: AbortSignal) => Promise<string>;
  music?: LumoMusicAdapter;
}
export function getIntegrations(): LumoIntegrations {
  if (typeof window === "undefined") return {};
  const injected = (window as Window & { lumoIntegrations?: LumoIntegrations }).lumoIntegrations ?? {};
  if (isOnDeviceAiNative()) return { ...injected, chat: localOnDeviceChat };
  return {
    ...getBackendIntegrations(),
    ...injected,
  };
}
/** Recognises "play …" style requests until the AI provider can call a music tool itself. */
export function parseMusicRequest(text: string): string | null {
  const match = text
    .trim()
    .match(
      /^(?:hey lumo,?\s*)?(?:please\s+)?(?:play|put on|start playing|listen to)\s+(.+?)[.!?]*$/i,
    );
  return match?.[1]?.trim() || null;
}

/* ---- Workspace & account adapters (host-provided; absent = unavailable) ---- */
export interface TerminalResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}
export interface LumoTerminalAdapter {
  run: (command: string, signal: AbortSignal) => Promise<TerminalResult>;
}
export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  changes: Array<{ path: string; status: string }>;
}
export interface LumoGitAdapter {
  status: (signal: AbortSignal) => Promise<GitStatus>;
}
export type ConnectionId = "github" | "gmail";
export interface ConnectionStatus {
  connected: boolean;
  account?: string | undefined;
  scopes?: string[] | undefined;
  repositories?: string[] | undefined;
}
/** Backend-confirmed connection state. Tokens never reach the UI. */
export interface LumoConnectionsAdapter {
  status: (id: ConnectionId, signal: AbortSignal) => Promise<ConnectionStatus>;
  connect: (id: ConnectionId, signal: AbortSignal) => Promise<ConnectionStatus>;
  disconnect: (id: ConnectionId, signal: AbortSignal) => Promise<ConnectionStatus>;
}
export interface LumoAccountAdapter {
  current: (signal: AbortSignal) => Promise<{ email: string; name?: string | undefined } | null>;
  signIn: (
    email: string,
    password: string,
    signal: AbortSignal,
  ) => Promise<{ ok: boolean; message?: string | undefined }>;
  signUp: (
    email: string,
    password: string,
    signal: AbortSignal,
  ) => Promise<{ ok: boolean; message?: string | undefined }>;
  signOut: () => Promise<void>;
}
export interface LumoWorkspaceIntegrations {
  terminal?: LumoTerminalAdapter;
  git?: LumoGitAdapter;
  connections?: LumoConnectionsAdapter;
  account?: LumoAccountAdapter;
}
export function getWorkspaceIntegrations(): LumoWorkspaceIntegrations {
  return getIntegrations() as LumoWorkspaceIntegrations;
}

/* ---- Voice-first and AI browser sessions (host-provided; absent = unavailable) ---- */
export type VoiceSessionState = "idle" | "listening" | "processing" | "speaking";
export interface VoiceEvent {
  state: VoiceSessionState;
  transcript?: string | undefined;
  level?: number | undefined;
  final?: boolean | undefined;
}
/** Hands-free voice: the host owns microphone permission, wake/VAD, STT and TTS. */
export interface LumoVoiceAdapter {
  start: (onEvent: (event: VoiceEvent) => void, signal: AbortSignal) => Promise<void>;
  stop: () => void;
}
export type AgentBrowserStatus =
  "connecting" | "idle" | "navigating" | "working" | "completed" | "error";
export interface AgentBrowserState {
  status: AgentBrowserStatus;
  url?: string | undefined;
  title?: string | undefined;
  /** Latest live frame from the agent's browser (object/data URL or stream frame URL). */
  frame?: string | undefined;
  task?: string | undefined;
  message?: string | undefined;
}
/** The browser LUMO's agent drives. Every state comes from the real session. */
export interface LumoAgentBrowserAdapter {
  connect: (onState: (state: AgentBrowserState) => void, signal: AbortSignal) => Promise<void>;
  disconnect: () => void;
}
export function getSessionIntegrations(): {
  voice?: LumoVoiceAdapter;
  agentBrowser?: LumoAgentBrowserAdapter;
} {
  return getIntegrations() as { voice?: LumoVoiceAdapter; agentBrowser?: LumoAgentBrowserAdapter };
}
