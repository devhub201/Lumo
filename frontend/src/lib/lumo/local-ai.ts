import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface LocalAiStatus {
  available: boolean;
  downloaded: boolean;
  modelName: string;
  sizeBytes: number;
  downloadInProgress: boolean;
  engineInitialized: boolean;
  license: string;
}

export interface LocalAiProgress {
  receivedBytes: number;
  totalBytes: number;
  percent: number;
}

interface LocalAiPlugin {
  getStatus(): Promise<LocalAiStatus>;
  downloadModel(): Promise<LocalAiStatus>;
  deleteModel(): Promise<LocalAiStatus>;
  generate(options: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  }): Promise<{ text: string }>;
  addListener(
    eventName: "downloadProgress",
    listenerFunc: (progress: LocalAiProgress) => void,
  ): Promise<PluginListenerHandle>;
}

const NativeLocalAi = registerPlugin<LocalAiPlugin>("LumoLocalAi");
const androidBuildMode = import.meta.env["VITE_LUMO_ANDROID_BUILD_MODE"] as string | undefined;

export function isOnDeviceAiNative() {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === "android" &&
    androidBuildMode !== "tailscale"
  );
}

export function getLocalAiStatus() {
  if (!isOnDeviceAiNative()) {
    return Promise.resolve({
      available: false,
      downloaded: false,
      modelName: "",
      sizeBytes: 0,
      downloadInProgress: false,
      engineInitialized: false,
      license: "",
    } satisfies LocalAiStatus);
  }
  return NativeLocalAi.getStatus();
}

export function listenToLocalModelDownload(listener: (progress: LocalAiProgress) => void) {
  if (!isOnDeviceAiNative()) return Promise.resolve({ remove: async () => {} });
  return NativeLocalAi.addListener("downloadProgress", listener);
}

export const downloadLocalModel = () => NativeLocalAi.downloadModel();
export const deleteLocalModel = () => NativeLocalAi.deleteModel();

export async function localOnDeviceChat(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  signal: AbortSignal,
) {
  if (!isOnDeviceAiNative())
    throw new Error("On-device AI is available in the standalone Android app only.");
  if (signal.aborted) throw new DOMException("Stopped", "AbortError");
  const result = await NativeLocalAi.generate({ messages });
  if (signal.aborted) throw new DOMException("Stopped", "AbortError");
  return result.text;
}
