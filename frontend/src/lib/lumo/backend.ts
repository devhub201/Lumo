import type { LumoIntegrations } from "./integrations";

const backendOrigin = () =>
  (import.meta.env["VITE_LUMO_BACKEND_ORIGIN"] as string | undefined)?.trim().replace(/\/$/, "") ||
  "";

export function isLumoBackendConfigured() {
  if (backendOrigin()) return true;
  return (
    typeof window !== "undefined" &&
    (window.location.protocol === "https:" || window.location.protocol === "http:")
  );
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
