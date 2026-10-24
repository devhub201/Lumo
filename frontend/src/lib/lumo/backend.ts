import type { LumoIntegrations } from "./integrations";

const backendOrigin = () =>
  (import.meta.env["VITE_LUMO_BACKEND_ORIGIN"] as string | undefined)?.trim().replace(/\/$/, "") ||
  "";

const MOBILE_CALLBACK_SCHEME = "com.devhub201.lumo:";
const MOBILE_VERIFIER_KEY = "lumo.mobile.oauth.verifier";
const MOBILE_CODE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
let mobileListenerInitialization: Promise<void> | undefined;
let processingMobileCallback = false;

export function isLumoBackendConfigured() {
  if (backendOrigin()) return true;
  return (
    typeof window !== "undefined" &&
    (window.location.protocol === "https:" || window.location.protocol === "http:")
  );
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createPkcePair() {
  const random = new Uint8Array(32);
  crypto.getRandomValues(random);
  const verifier = bytesToBase64Url(random);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: bytesToBase64Url(new Uint8Array(digest)) };
}

async function completeMobileGoogleSignIn(callbackUrl: string) {
  if (processingMobileCallback) return;
  let parsed: URL;
  try {
    parsed = new URL(callbackUrl);
  } catch {
    return;
  }
  if (
    parsed.protocol !== MOBILE_CALLBACK_SCHEME ||
    parsed.hostname !== "auth" ||
    parsed.pathname !== "/callback"
  ) {
    return;
  }
  processingMobileCallback = true;
  try {
    const code = parsed.searchParams.get("code") ?? "";
    const verifier = window.sessionStorage.getItem(MOBILE_VERIFIER_KEY) ?? "";
    if (!MOBILE_CODE_PATTERN.test(code) || !verifier) {
      throw new Error("The mobile sign-in response is invalid or expired.");
    }
    const configuredOrigin = backendOrigin();
    if (
      configuredOrigin &&
      new URL(configuredOrigin, window.location.origin).origin !== window.location.origin
    ) {
      throw new Error(
        "Mobile sign-in requires the frontend and backend to share one HTTPS origin.",
      );
    }
    const { Browser } = await import("@capacitor/browser");
    await Browser.close().catch(() => undefined);
    const response = await fetch(`${configuredOrigin}/api/auth/mobile/exchange`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, codeVerifier: verifier }),
    });
    if (!response.ok) throw new Error("The mobile sign-in exchange was rejected.");
    window.sessionStorage.removeItem(MOBILE_VERIFIER_KEY);
    window.location.replace("/");
  } catch {
    window.sessionStorage.removeItem(MOBILE_VERIFIER_KEY);
    const failure = new URL("/auth", window.location.origin);
    failure.searchParams.set("reason", "mobile_signin_failed");
    window.location.replace(failure.href);
  } finally {
    processingMobileCallback = false;
  }
}

export async function initializeMobileGoogleSignIn() {
  if (typeof window === "undefined") return;
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) return;
  if (!mobileListenerInitialization) {
    mobileListenerInitialization = (async () => {
      const { App } = await import("@capacitor/app");
      await App.addListener("appUrlOpen", ({ url }) => {
        void completeMobileGoogleSignIn(url);
      });
      const launch = await App.getLaunchUrl();
      if (launch?.url) await completeMobileGoogleSignIn(launch.url);
    })();
  }
  await mobileListenerInitialization;
}

export async function startGoogleSignIn() {
  const origin = backendOrigin();
  if (!isLumoBackendConfigured()) throw new Error("LUMO backend is unavailable in this preview.");
  const { Capacitor } = await import("@capacitor/core");
  if (Capacitor.isNativePlatform()) {
    if (origin && new URL(origin, window.location.origin).origin !== window.location.origin) {
      throw new Error(
        "Mobile sign-in requires the frontend and backend to share one HTTPS origin.",
      );
    }
    await initializeMobileGoogleSignIn();
    const { verifier, challenge } = await createPkcePair();
    window.sessionStorage.setItem(MOBILE_VERIFIER_KEY, verifier);
    const startUrl = new URL("/api/auth/google/start", window.location.origin);
    startUrl.searchParams.set("mobile", "1");
    startUrl.searchParams.set("code_challenge", challenge);
    startUrl.searchParams.set("code_challenge_method", "S256");
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url: startUrl.href });
    } catch (error) {
      window.sessionStorage.removeItem(MOBILE_VERIFIER_KEY);
      throw error;
    }
    return;
  }
  window.location.assign(`${origin}/api/auth/google/start`);
}

type TrpcEnvelope<T> = {
  result?: { data?: { json?: T } };
  error?: { json?: { message?: string } };
};

async function trpcMutation<T>(procedure: string, input: unknown, signal: AbortSignal) {
  const origin = backendOrigin();
  if (!isLumoBackendConfigured()) throw new Error("LUMO backend is unavailable in this preview.");
  const response = await fetch(`${origin}/api/trpc/${procedure}?batch=1`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 0: { json: input } }),
    signal,
  });
  let body: TrpcEnvelope<T>[] = [];
  try {
    body = (await response.json()) as TrpcEnvelope<T>[];
  } catch {
    throw new Error("LUMO backend returned an unreadable response.");
  }
  const envelope = body[0];
  if (!response.ok || envelope?.error) {
    throw new Error(
      envelope?.error?.json?.message || `LUMO backend request failed (${response.status}).`,
    );
  }
  const value = envelope?.result?.data?.json;
  if (value === undefined) throw new Error("LUMO backend returned no result.");
  return value;
}

const conversations = new Map<string, string>();

const backendChat: NonNullable<LumoIntegrations["chat"]> = async (
  messages,
  signal,
  conversationKey = "default",
) => {
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  if (!lastUser) throw new Error("Write a message before sending.");
  const result = await trpcMutation<{
    conversation: { id: string };
    assistantMessage: { content: string };
  }>(
    "lumo.send",
    { conversationId: conversations.get(conversationKey), text: lastUser.content },
    signal,
  );
  conversations.set(conversationKey, result.conversation.id);
  return result.assistantMessage.content;
};

export function getBackendIntegrations(): LumoIntegrations {
  return isLumoBackendConfigured() ? { chat: backendChat } : {};
}
