import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { ArrowUp, Paperclip, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSessionIntegrations, type VoiceSessionState } from "@/lib/lumo/integrations";
import { Orb } from "./orb";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  usePromptInputAttachments,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";

function VoiceOrbControl({
  onTranscript,
  unavailable,
}: {
  onTranscript: (transcript: string) => void;
  unavailable: boolean;
}) {
  const [state, setState] = useState<VoiceSessionState | "connecting" | "unavailable">("unavailable");
  const voice = useRef<ReturnType<typeof getSessionIntegrations>["voice"] | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    voice.current = getSessionIntegrations().voice;
    setState(voice.current ? "idle" : "unavailable");
    return () => {
      controller.current?.abort();
      voice.current?.stop();
    };
  }, []);

  const stop = () => {
    controller.current?.abort();
    controller.current = null;
    voice.current?.stop();
    setState(voice.current ? "idle" : "unavailable");
  };

  const toggle = () => {
    if (state === "connecting" || state === "listening" || state === "processing" || state === "speaking") {
      stop();
      return;
    }
    const adapter = voice.current;
    if (!adapter) {
      setState("unavailable");
      return;
    }
    const nextController = new AbortController();
    controller.current = nextController;
    setState("connecting");
    void adapter
      .start(
        (event) => {
          if (nextController.signal.aborted) return;
          setState(event.state);
          if (event.final && event.transcript?.trim()) onTranscript(event.transcript.trim());
        },
        nextController.signal,
      )
      .catch(() => {
        if (!nextController.signal.aborted) setState("unavailable");
      });
  };

  const orbState = state === "connecting" || state === "processing" ? "thinking" : state;
  const label = unavailable
    ? "Voice unavailable while LUMO is responding"
    : state === "unavailable"
      ? "Voice unavailable"
      : state === "idle"
        ? "Start voice input"
        : state === "connecting"
          ? "Connecting to voice · stop"
          : "Stop voice input";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="chat-voice-orb-button"
      aria-label={label}
      title={label}
      disabled={unavailable || state === "unavailable"}
      onClick={toggle}
    >
      <Orb mini state={orbState} />
    </Button>
  );
}

function AttachmentControls({
  loading,
  onTranscript,
}: {
  loading: boolean;
  onTranscript: (transcript: string) => void;
}) {
  const attachments = usePromptInputAttachments();
  return (
    <>
      <div className="chat-attachments">
        {attachments.files.map((file) => (
          <span key={file.id}>
            <Paperclip size={12} />
            <span>{file.filename || "Attachment"}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`Remove ${file.filename}`}
              title={`Remove ${file.filename}`}
              onClick={() => attachments.remove(file.id)}
            >
              <X />
            </Button>
          </span>
        ))}
      </div>
      <PromptInputFooter className="chat-composer-footer">
        <div className="chat-composer-tools">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={loading}
            aria-label="Attach files"
            title="Attach files"
            onClick={() => attachments.openFileDialog()}
          >
            <Paperclip />
          </Button>
          <span className="chat-composer-caption">Attachments · local preview only</span>
        </div>
        <div className="chat-send-tools">
          <VoiceOrbControl onTranscript={onTranscript} unavailable={loading} />
          <SubmitControl />
        </div>
      </PromptInputFooter>
    </>
  );
}
// Submit is composed below to keep chat status on the AI Elements submit primitive.
const SubmitContext = createContext({ loading: false, enabled: false, stop: () => {} });
function SubmitControl() {
  const { loading, enabled, stop } = useContext(SubmitContext);
  return (
    <PromptInputSubmit
      status={loading ? "submitted" : "ready"}
      onStop={stop}
      disabled={!loading && !enabled}
      aria-label={loading ? "Stop response" : "Send message"}
      title={loading ? "Stop response" : "Send message"}
    >
      {loading ? <Square /> : <ArrowUp />}
    </PromptInputSubmit>
  );
}
export function ChatComposer({
  draft,
  setDraft,
  loading,
  onSend,
  stop,
  onError,
}: {
  draft: string;
  setDraft: (draft: string) => void;
  loading: boolean;
  onSend: (message: PromptInputMessage) => void;
  stop: () => void;
  onError: (message: string) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  useEffect(() => {
    if (!document.querySelector('[role="dialog"], [role="menu"]'))
      textarea.current?.focus({ preventScroll: true });
  }, [loading]);
  return (
    <SubmitContext.Provider value={{ loading, enabled: !!draft.trim(), stop }}>
      <PromptInput
        className="chat-composer"
        multiple
        maxFiles={5}
        maxFileSize={10 * 1024 * 1024}
        onError={(error) => onError(error.message)}
        onSubmit={(message) => {
          if (loading || !message.text.trim()) return;
          onSend(message);
          setDraft("");
          textarea.current?.focus({ preventScroll: true });
        }}
      >
        <PromptInputTextarea
          ref={textarea}
          aria-label="Message LUMO"
          placeholder="What’s on your mind?"
          value={draft}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value)}
          rows={2}
          onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing &&
              window.matchMedia("(pointer: coarse)").matches
            ) {
              e.preventDefault();
              const start = e.currentTarget.selectionStart;
              const end = e.currentTarget.selectionEnd;
              setDraft(draft.slice(0, start) + "\n" + draft.slice(end));
              requestAnimationFrame(() =>
                textarea.current?.setSelectionRange(start + 1, start + 1),
              );
            }
          }}
        />
        <AttachmentControls
          loading={loading}
          onTranscript={(transcript) =>
            setDraft([draftRef.current.trim(), transcript].filter(Boolean).join(" "))
          }
        />
      </PromptInput>
    </SubmitContext.Provider>
  );
}
