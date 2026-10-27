import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Aperture,
  Check,
  Copy,
  Download,
  FileText,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import type { PromptInputMessage } from "@/components/ai-elements/prompt-input";
import { getIntegrations } from "@/lib/lumo/integrations";
import { parseMusicIntent } from "@/lib/lumo/music-intents";
import { MusicEmbed } from "./music-embed";
import { getMusicAdapter } from "@/lib/lumo/spotify";
import {
  chatStore,
  useConversations,
  messageText,
  demoReply,
  type ChatMessage,
} from "@/lib/lumo/chat-store";
import { Orb } from "./orb";
import { Notice, Status } from "./ui";
import { ChatComposer } from "./chat-composer";
import { CompactAgentBrowserPanel } from "./browser-workspace";
import { getLocalAiStatus, isOnDeviceAiNative } from "@/lib/lumo/local-ai";

export function ChatScreen({
  prompt = "",
  threadId = "first",
}: {
  prompt?: string;
  threadId?: string;
}) {
  const conversations = useConversations();
  const conversation = conversations.find((c) => c.id === threadId);
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [connected, setConnected] = useState(false);
  const onDeviceAi = isOnDeviceAiNative();
  const [localModelInstalled, setLocalModelInstalled] = useState(false);
  const [localModelChecked, setLocalModelChecked] = useState(!onDeviceAi);
  const abort = useRef<AbortController | null>(null);
  const layout = useRef<HTMLDivElement>(null);
  const messages = conversation?.messages ?? [];
  useEffect(() => {
    setConnected(!!getIntegrations().chat);
    const current = chatStore.get().find((c) => c.id === threadId);
    if (prompt && current && !current.draft) chatStore.update(threadId, { draft: prompt });
    return () => abort.current?.abort();
  }, [threadId, prompt]);
  useEffect(() => {
    if (!onDeviceAi) return;
    let active = true;
    setLocalModelChecked(false);
    void getLocalAiStatus()
      .then((status) => {
        if (active) setLocalModelInstalled(status.downloaded);
      })
      .catch(() => {
        if (active) setLocalModelInstalled(false);
      })
      .finally(() => {
        if (active) setLocalModelChecked(true);
      });
    return () => {
      active = false;
    };
  }, [onDeviceAi]);
  const connectionLabel = onDeviceAi
    ? !localModelChecked
      ? "Checking local AI…"
      : localModelInstalled
        ? "On-device AI ready"
        : "Download model in Settings"
    : connected
      ? "Provider connected"
      : "Demo · AI not connected";
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      const element = layout.current;
      if (!element || !viewport) return;
      const keyboardOpen = window.innerHeight - viewport.height > 120;
      if (!keyboardOpen) {
        element.style.removeProperty("height");
        return;
      }
      const top = element.getBoundingClientRect().top;
      element.style.height = `${Math.max(120, viewport.height + viewport.offsetTop - top - 12)}px`;
    };
    viewport?.addEventListener("resize", resize);
    viewport?.addEventListener("scroll", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      viewport?.removeEventListener("scroll", resize);
    };
  }, []);
  const open = (id: string) => {
    abort.current?.abort();
    void navigate({ to: "/chat/$threadId", params: { threadId: id } });
  };
  const newChat = () => open(chatStore.create());
  const stop = () => {
    abort.current?.abort();
    setLoading(false);
    setError("Response stopped.");
  };
  const request = async (next: ChatMessage[]) => {
    if (abort.current) abort.current.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    setError("");
    const provider = getIntegrations().chat;
    setConnected(!!provider);
    try {
      if (next.some((m) => m.attachments?.length)) {
        setError(
          "Files are attached locally. File analysis is unavailable; remove attachments or start a text-only conversation.",
        );
        return;
      }
      const last = next[next.length - 1];
      const musicIntent = last?.role === "user" ? parseMusicIntent(messageText(last)) : null;
      if (musicIntent) {
        const music = getMusicAdapter();
        if (!music) {
          const message =
            musicIntent.type === "play"
              ? `I can play **${musicIntent.query}** after you connect Spotify in Settings → Connected integrations.`
              : "Connect Spotify in Settings → Connected integrations before using playback controls.";
          chatStore.update(threadId, {
            messages: [
              ...next,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                parts: [{ type: "text", text: message }],
              },
            ],
          });
          return;
        }
        const state =
          musicIntent.type === "play"
            ? await music.play(musicIntent.query, controller.signal)
            : await music.control(musicIntent.action, musicIntent.value);
        if (controller.signal.aborted) return;
        const response =
          musicIntent.type === "play"
            ? `Playing **${state.track.title}** by ${state.track.artist}.`
            : musicIntent.action === "pause"
              ? "Paused Spotify playback."
              : musicIntent.action === "resume" || musicIntent.action === "play"
                ? "Resumed Spotify playback."
                : musicIntent.action === "next"
                  ? "Skipped to the next track."
                  : musicIntent.action === "previous"
                    ? "Went back to the previous track."
                    : musicIntent.action === "shuffle"
                      ? `Shuffle is ${state.shuffle ? "on" : "off"}.`
                      : musicIntent.action === "repeat"
                        ? `Repeat is ${state.repeat ? "on" : "off"}.`
                        : "Spotify playback updated.";
        chatStore.update(threadId, {
          messages: [
            ...next,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              parts: [{ type: "text", text: response }],
              music: {
                query: musicIntent.type === "play" ? musicIntent.query : state.track.title,
                state,
              },
            },
          ],
        });
        return;
      }
      if (onDeviceAi && !localModelChecked) {
        throw new Error(
          "LUMO is checking whether the local model is ready. Wait a moment and try again.",
        );
      }
      if (onDeviceAi && !localModelInstalled) {
        throw new Error(
          "First download the local AI model: open Settings → On-device AI and tap Download model while connected to Wi-Fi (about 475 MiB).",
        );
      }
      let response: string;
      if (provider)
        response = await provider(
          next
            .filter((m) => !m.demo)
            .map((m) => ({
              role: m.role === "user" ? ("user" as const) : ("assistant" as const),
              content: messageText(m),
            })),
          controller.signal,
          threadId,
        );
      else {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, 650);
          controller.signal.addEventListener(
            "abort",
            () => {
              window.clearTimeout(timer);
              reject(new DOMException("Stopped", "AbortError"));
            },
            { once: true },
          );
        });
        response = demoReply();
      }
      if (!controller.signal.aborted) {
        if (!response.trim()) throw new Error("The provider returned no response.");
        chatStore.update(threadId, {
          messages: [
            ...next,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              parts: [{ type: "text", text: response }],
              demo: !provider,
            },
          ],
        });
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "The response could not be completed.");
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setLoading(false);
      }
    }
  };
  const send = ({ text, files }: PromptInputMessage) => {
    if (!conversation || loading) return;
    const next: ChatMessage[] = [
      ...messages,
      {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: text.trim() }],
        attachments: files.map((f) => f.filename || "Attachment"),
      },
    ];
    chatStore.update(threadId, {
      messages: next,
      title: messages.length
        ? conversation.title
        : (text.trim().split("\n")[0] ?? "New conversation").slice(0, 52),
      draft: "",
    });
    void request(next);
  };
  const exportConversation = () => {
    const blob = new Blob(
      [
        messages
          .map(
            (m) =>
              `## ${m.role === "user" ? "You" : m.demo ? "LUMO (Demo)" : "LUMO"}\n\n${messageText(m)}${m.attachments?.length ? "\n\nAttachments (local only): " + m.attachments.join(", ") : ""}`,
          )
          .join("\n\n"),
      ],
      { type: "text/markdown" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lumo-conversation.md";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  if (!conversation)
    return (
      <section className="screen-page">
        <h1>Conversation unavailable</h1>
        <p>Conversation history is saved on this device when storage is available.</p>
        <Button onClick={newChat}>
          <Plus />
          New chat
        </Button>
      </section>
    );
  return (
    <div ref={layout} className="chat-layout chat-workspace">
      <aside className="conversation-nav">
        <div className="section-heading">
          <h2>Conversations</h2>
          <Button
            variant="ghost"
            size="icon"
            title="New chat"
            aria-label="New chat"
            onClick={newChat}
          >
            <Plus />
          </Button>
        </div>
        <p className="metadata">Saved on this device</p>
        <div className="conversation-list">
          {conversations.map((c) => (
            <Button
              key={c.id}
              variant="ghost"
              className={`conversation-item ${threadId === c.id ? "selected" : ""}`}
              onClick={() => open(c.id)}
            >
              <MessageSquare />
              <span>{c.title}</span>
            </Button>
          ))}
        </div>
        <div className="conversation-nav-bottom">
          <Status
            warning={!connected || (onDeviceAi && (!localModelChecked || !localModelInstalled))}
          >
            {connectionLabel}
          </Status>
          <p>History stays on this device.</p>
        </div>
      </aside>
      <section className="chat-main">
        <header className="chat-header">
          <div className="min-w-0">
            <span className="eyebrow">
              {onDeviceAi
                ? "On-device conversation"
                : connected
                  ? "Conversation"
                  : "Preview conversation"}
            </span>
            <h1 title={conversation.title}>{conversation.title}</h1>
          </div>
          <div className="chat-header-actions">
            <Button
              variant="ghost"
              size="icon"
              aria-label="New chat"
              title="New chat"
              onClick={newChat}
            >
              <Plus />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Conversation menu"
                  aria-label="Conversation menu"
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="chat-menu">
                <DropdownMenuLabel>Conversation</DropdownMenuLabel>
                <DropdownMenuItem disabled={!messages.length} onSelect={exportConversation}>
                  <Download />
                  Export conversation
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!messages.length || loading}
                  onSelect={() => {
                    stop();
                    chatStore.update(threadId, { messages: [], title: "New conversation" });
                    setError("");
                  }}
                >
                  <RotateCcw />
                  Clear messages
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={loading}
                  onSelect={() => {
                    abort.current?.abort();
                    open(chatStore.remove(threadId));
                  }}
                >
                  <Trash2 />
                  Delete conversation
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>History · this device</DropdownMenuLabel>
                {conversations.map((c) => (
                  <DropdownMenuItem key={c.id} onSelect={() => open(c.id)}>
                    <MessageSquare />
                    <span className="truncate">{c.title}</span>
                    {threadId === c.id && <Check size={12} />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <Conversation
          key={threadId}
          className="chat-transcript"
          initial="instant"
          resize="instant"
          aria-label="Conversation messages"
        >
          {(messages.length > 0 || Boolean(conversation.draft?.trim()) || loading) && (
            <div className="chat-orb-backdrop" aria-hidden="true">
              <Orb compact state={loading ? "thinking" : "idle"} />
            </div>
          )}
          <ConversationContent
            className={`chat-transcript-content ${!messages.length ? "is-empty" : ""}`}
          >
            {!messages.length ? (
              <div className="chat-empty">
                <h2>
                  Good conversations start
                  <br />
                  with a little curiosity.
                </h2>
                <p>What would you like to think through?</p>
                <span className="preview-chip">
                  {onDeviceAi
                    ? !localModelChecked
                      ? "Checking local model…"
                      : localModelInstalled
                        ? "AI runs on this phone"
                        : "Download the model in Settings"
                    : connected
                      ? "Provider connected"
                      : "Demo preview · AI not connected"}
                </span>
                {onDeviceAi && localModelChecked && !localModelInstalled && (
                  <Button asChild variant="outline" size="sm">
                    <Link to="/settings">Set up on-device AI</Link>
                  </Button>
                )}
              </div>
            ) : (
              messages.map((message, i) => (
                <Message
                  from={message.role}
                  key={message.id}
                  className={`lumo-chat-message message-${message.role}`}
                >
                  <div className="chat-message-heading">
                    <span className="chat-author-mark">
                      {message.role === "assistant" ? <Aperture size={14} /> : "Y"}
                    </span>
                    <span>{message.role === "assistant" ? "LUMO" : "You"}</span>
                    {message.demo && (
                      <span className="chat-demo-label">Demo · not AI-generated</span>
                    )}
                  </div>
                  <MessageContent className="lumo-message-content">
                    {message.parts.map((part, index) =>
                      part.type === "text" ? (
                        message.role === "assistant" ? (
                          <MessageResponse key={index} className="chat-markdown">
                            {part.text}
                          </MessageResponse>
                        ) : (
                          <div key={index} className="chat-user-text">
                            {part.text}
                          </div>
                        )
                      ) : null,
                    )}
                    {message.music && (
                      <MusicEmbed query={message.music.query} initial={message.music.state} />
                    )}
                    {message.attachments?.map((file, index) => (
                      <span className="message-file" key={index}>
                        <FileText size={14} />
                        {file}
                        <small>Local only</small>
                      </span>
                    ))}
                  </MessageContent>
                  <MessageActions className="chat-message-actions">
                    <MessageAction
                      tooltip={copied === message.id ? "Copied" : "Copy message"}
                      label="Copy message"
                      aria-label="Copy message"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(messageText(message));
                          setCopied(message.id);
                        } catch {
                          setError("Clipboard access is unavailable in this browser.");
                        }
                      }}
                    >
                      {copied === message.id ? <Check /> : <Copy />}
                    </MessageAction>
                    {i === messages.length - 1 && (
                      <MessageAction
                        tooltip={
                          message.role === "assistant" ? "Regenerate response" : "Retry response"
                        }
                        aria-label={
                          message.role === "assistant" ? "Regenerate response" : "Retry response"
                        }
                        disabled={loading}
                        onClick={() => {
                          const next =
                            message.role === "assistant" ? messages.slice(0, -1) : messages;
                          void request(next);
                        }}
                      >
                        <RotateCcw />
                      </MessageAction>
                    )}
                  </MessageActions>
                </Message>
              ))
            )}
            {loading && (
              <div
                className="chat-response-indicator"
                role="status"
                aria-label="Waiting for response"
              >
                <div className="chat-message-heading">
                  <Aperture size={14} />
                  <span>
                    {onDeviceAi
                      ? "LUMO is thinking on your phone"
                      : connected
                        ? "LUMO is responding"
                        : "Preparing demo preview"}
                  </span>
                </div>
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            )}
          </ConversationContent>
          <ConversationScrollButton aria-label="Scroll to latest message" title="Latest message" />
        </Conversation>
        <div className="chat-composition">
          {error && (
            <div className="chat-error">
              <Notice>{error}</Notice>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Dismiss notice"
                title="Dismiss notice"
                onClick={() => setError("")}
              >
                <Check />
              </Button>
            </div>
          )}
          <CompactAgentBrowserPanel />
          <ChatComposer
            key={threadId}
            draft={conversation.draft}
            setDraft={(draft) => chatStore.update(threadId, { draft })}
            loading={loading}
            canStop={!onDeviceAi}
            onSend={send}
            stop={stop}
            onError={setError}
          />
          <p className="composition-note">
            {onDeviceAi
              ? loading
                ? "LUMO is generating locally and cannot be interrupted mid-response. Keep the app open."
                : "Runs locally on this phone · after model download, chats work offline."
              : connected
                ? "Review AI-generated information."
                : "Demo responses only · History is saved on this device"}
          </p>
        </div>
      </section>
    </div>
  );
}
