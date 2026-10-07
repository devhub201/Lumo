import { Streamdown } from "streamdown";
import {
  AlertTriangle,
  BrainCircuit,
  Camera,
  CameraOff,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  ScanEye,
  Send,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { BlueprintCanvas } from "@/components/BlueprintCanvas";
import { VisualOverlay } from "@/components/VisualOverlay";
import { trpc } from "@/lib/trpc";
import {
  CameraError,
  openCameraPreview,
  type CameraSession,
} from "@/lib/camera";
import type { VisionResult } from "../../../server/lumo/vision/contracts";
import type { Blueprint } from "../../../server/lumo/blueprints/contracts";
import type { OverlayModel } from "../../../server/lumo/overlays/contracts";

type MemoryKind = "preference" | "fact" | "project" | "summary" | "knowledge";

const WORKBENCH_BLUEPRINT: Blueprint = {
  id: "workbench-context-flow",
  title: "LUMO context flow",
  nodes: [
    { id: "input", label: "User input", x: 20, y: 120, width: 140, height: 60 },
    {
      id: "context",
      label: "Context Manager",
      x: 260,
      y: 120,
      width: 160,
      height: 60,
    },
    {
      id: "response",
      label: "LUMO response",
      x: 520,
      y: 120,
      width: 140,
      height: 60,
    },
  ],
  edges: [
    { id: "input-context", from: "input", to: "context" },
    { id: "context-response", from: "context", to: "response" },
  ],
  groups: [],
  trust: "untrusted_blueprint_data",
};

type Message = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  createdAt: Date;
};

const formatTime = (value: Date | string) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const formatDate = (value: Date | string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(value)
  );

export default function Home() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [lastDiagnostics, setLastDiagnostics] = useState<{
    requestId: string;
    model: string;
    elapsedMs: number;
    contextMessageCount: number;
    retrievedMemoryCount: number;
    depthLevel: number;
  } | null>(null);
  const [memoryKind, setMemoryKind] = useState<MemoryKind>("fact");
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryStatus, setMemoryStatus] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string | null>(null);
  const [visionSnapshot, setVisionSnapshot] = useState<VisionResult | null>(
    null
  );
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [overlayModel, setOverlayModel] = useState<OverlayModel | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(
    null
  );
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraSessionRef = useRef<CameraSession | null>(null);

  const conversationsQuery = trpc.lumo.listConversations.useQuery();
  const diagnosticsQuery = trpc.lumo.diagnostics.useQuery();
  const memoriesQuery = trpc.lumo.listMemories.useQuery();
  const conversationQuery = trpc.lumo.getConversation.useQuery(
    { id: selectedId ?? "" },
    { enabled: Boolean(selectedId) }
  );
  const utils = trpc.useUtils();
  const sendMutation = trpc.lumo.send.useMutation();
  const memoryMutation = trpc.lumo.createMemory.useMutation();
  const runVisionMutation = trpc.lumo.runVision.useMutation();

  const messages = (conversationQuery.data?.messages ?? []) as Message[];
  const activeConversation = conversationQuery.data?.conversation;
  const displayTitle = activeConversation?.title ?? "New conversation";
  const sortedMemories = useMemo(
    () => (memoriesQuery.data ?? []).slice(0, 8),
    [memoriesQuery.data]
  );

  const selectConversation = (id: string) => {
    setSelectedId(id);
    setDraft("");
    setErrorText(null);
    setFailedText(null);
    setPendingText(null);
    setLastDiagnostics(null);
    setVisionSnapshot(null);
    setCapturedImage(null);
    setOverlayModel(null);
    setSelectedOverlayId(null);
    setCameraStatus(null);
  };

  const startNewConversation = () => {
    setSelectedId(null);
    setDraft("");
    setErrorText(null);
    setFailedText(null);
    setPendingText(null);
    setLastDiagnostics(null);
    setVisionSnapshot(null);
    setCapturedImage(null);
    setOverlayModel(null);
    setSelectedOverlayId(null);
    setCameraStatus(null);
  };

  useEffect(
    () => () => {
      cameraSessionRef.current?.stop();
      cameraSessionRef.current = null;
    },
    []
  );

  const openCamera = async () => {
    if (cameraSessionRef.current || !cameraVideoRef.current) return;
    setCameraStatus("Requesting camera permission…");
    try {
      const session = await openCameraPreview(cameraVideoRef.current, {
        facingMode: "environment",
      });
      cameraSessionRef.current = session;
      setCameraOpen(true);
      setCameraStatus(
        "Camera is live. Point it at something, then capture a frame."
      );
    } catch (error) {
      setCameraStatus(
        error instanceof CameraError
          ? error.message
          : "The camera could not be opened."
      );
      setCameraOpen(false);
    }
  };

  const closeCamera = () => {
    cameraSessionRef.current?.stop();
    cameraSessionRef.current = null;
    setCameraOpen(false);
    setCameraStatus("Camera stopped. No frames are uploaded continuously.");
  };

  const captureAndAnalyze = async () => {
    const session = cameraSessionRef.current;
    if (!session || runVisionMutation.isPending) return;
    setCameraStatus(
      "Capturing one frame and sending it to LUMO’s vision pipeline…"
    );
    try {
      const frame = await session.capture();
      session.stop();
      cameraSessionRef.current = null;
      setCameraOpen(false);
      const response = await runVisionMutation.mutateAsync({
        toolId: "camera_capture",
        arguments: { dataUrl: frame.dataUrl, mode: "understand" },
      });
      const result = response.result as {
        success: boolean;
        data?: VisionResult;
        error?: { message?: string } | null;
      };
      if (!result.success || !result.data) {
        throw new Error(
          result.error?.message || "LUMO could not analyze that frame."
        );
      }
      setVisionSnapshot(result.data);
      setCapturedImage(frame.dataUrl);
      setOverlayModel(
        (response as { overlay?: OverlayModel | null }).overlay ?? null
      );
      setCameraStatus(
        "Frame analyzed. Ask LUMO a question about what it sees."
      );
    } catch (error) {
      setCameraStatus(
        error instanceof Error
          ? error.message
          : "The camera frame could not be analyzed."
      );
    }
  };

  const submitText = (text: string) => {
    const cleanText = text.trim();
    if (!cleanText || sendMutation.isPending) return;
    if (
      /^(?:lumo[,:]?\s*)?(?:camera kholo|open camera|start camera)$/i.test(
        cleanText
      )
    ) {
      setDraft("");
      void openCamera();
      return;
    }
    setErrorText(null);
    setFailedText(null);
    setPendingText(cleanText);
    sendMutation.mutate(
      {
        conversationId: selectedId ?? undefined,
        text: cleanText,
        visionResult: visionSnapshot ?? undefined,
        visionSelection:
          selectedOverlayId && visionSnapshot
            ? {
                overlayId: selectedOverlayId,
                sourceIdentity: visionSnapshot.source.identity,
              }
            : undefined,
      },
      {
        onSuccess: result => {
          setSelectedId(result.conversation.id);
          setPendingText(null);
          setDraft("");
          setLastDiagnostics(result.diagnostics);
          void Promise.all([
            utils.lumo.listConversations.invalidate(),
            utils.lumo.getConversation.invalidate({
              id: result.conversation.id,
            }),
          ]);
        },
        onError: error => {
          setPendingText(null);
          setDraft(cleanText);
          setFailedText(cleanText);
          setErrorText(error.message);
        },
      }
    );
  };

  const handleSend = (event: FormEvent) => {
    event.preventDefault();
    submitText(draft);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submitText(draft);
    }
  };

  const addMemory = (event: FormEvent) => {
    event.preventDefault();
    const content = memoryDraft.trim();
    if (!content || memoryMutation.isPending) return;
    setMemoryStatus(null);
    memoryMutation.mutate(
      { kind: memoryKind, content, importance: 60 },
      {
        onSuccess: () => {
          setMemoryDraft("");
          setMemoryStatus("Saved to Peter’s local memory store.");
          void utils.lumo.listMemories.invalidate();
        },
        onError: error => setMemoryStatus(error.message),
      }
    );
  };

  return (
    <div className="lumo-shell">
      <header className="lumo-topbar">
        <div className="lumo-brand">
          <span className="lumo-mark" aria-hidden="true">
            <CircleDot size={18} />
          </span>
          <div>
            <div className="lumo-wordmark">LUMO</div>
            <div className="lumo-kicker">
              personal intelligence / testing build
            </div>
          </div>
        </div>
        <div className="lumo-topbar-meta">
          <span className="status-pill">
            <span className="status-dot" /> core online
          </span>
          <span className="mono">owner: Peter</span>
        </div>
      </header>

      <div className="lumo-workbench">
        <aside className="lumo-sidebar" aria-label="Conversation history">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">workspace</p>
              <h2>Conversations</h2>
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={startNewConversation}
              aria-label="New conversation"
              title="New conversation"
            >
              <Plus size={16} />
            </Button>
          </div>
          <Button
            className="new-conversation-button"
            variant="secondary"
            onClick={startNewConversation}
          >
            <Plus size={15} /> New conversation
          </Button>
          <div className="conversation-list">
            {conversationsQuery.isLoading && (
              <div className="empty-note">
                <Loader2 className="spin" size={15} /> loading history
              </div>
            )}
            {!conversationsQuery.isLoading &&
              !conversationsQuery.data?.length && (
                <div className="empty-note">
                  No saved conversations yet. Start with a question.
                </div>
              )}
            {conversationsQuery.data?.map(conversation => (
              <button
                type="button"
                key={conversation.id}
                className={`conversation-row ${selectedId === conversation.id ? "selected" : ""}`}
                onClick={() => selectConversation(conversation.id)}
              >
                <span className="conversation-row-copy">
                  <strong>{conversation.title}</strong>
                  <span>
                    {formatDate(conversation.updatedAt)} · depth{" "}
                    {conversation.depthLevel}
                  </span>
                </span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
          <div className="sidebar-footer">
            <div className="footer-line">
              <Database size={14} /> managed persistence
            </div>
            <div className="footer-line">
              <ShieldCheck size={14} /> server-only provider key
            </div>
          </div>
        </aside>

        <main className="lumo-main">
          <div className="conversation-header">
            <div>
              <p className="eyebrow">
                conversation / {selectedId ? selectedId.slice(0, 8) : "unsaved"}
              </p>
              <h1>{displayTitle}</h1>
            </div>
            <div className="conversation-header-actions">
              {activeConversation && (
                <span className="mono muted">
                  depth {activeConversation.depthLevel}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void conversationQuery.refetch()}
                disabled={!selectedId || conversationQuery.isFetching}
              >
                <RefreshCw
                  size={14}
                  className={conversationQuery.isFetching ? "spin" : ""}
                />{" "}
                Refresh
              </Button>
            </div>
          </div>

          <div className="message-stage">
            {!selectedId && !pendingText && (
              <div className="welcome-card">
                <div className="welcome-icon">
                  <BrainCircuit size={22} />
                </div>
                <p className="eyebrow">LUMO core ready</p>
                <h2>Start a focused test.</h2>
                <p>
                  Try a normal question, add a memory in the diagnostics panel,
                  or ask “Go deeper.” after an explanation to test context
                  continuity.
                </p>
                <div className="test-steps">
                  <span>
                    <Check size={14} /> one provider
                  </span>
                  <span>
                    <Check size={14} /> structured memory
                  </span>
                  <span>
                    <Check size={14} /> persistent turns
                  </span>
                </div>
              </div>
            )}
            {messages.map(message => (
              <article
                className={`message-row ${message.role}`}
                key={message.id}
              >
                <div className="message-meta">
                  <span>
                    {message.role === "assistant" ? "LUMO" : message.role}
                  </span>
                  <span>{formatTime(message.createdAt)}</span>
                </div>
                <div className="message-bubble">
                  {message.role === "assistant" ? (
                    <Streamdown>{message.content}</Streamdown>
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>
              </article>
            ))}
            {pendingText && (
              <>
                <article className="message-row user pending-message">
                  <div className="message-meta">
                    <span>user</span>
                    <span>sending</span>
                  </div>
                  <div className="message-bubble">
                    <p>{pendingText}</p>
                  </div>
                </article>
                <article className="message-row assistant pending-message">
                  <div className="message-meta">
                    <span>LUMO</span>
                    <span>
                      <Loader2 size={13} className="spin" /> thinking
                    </span>
                  </div>
                  <div className="message-bubble thinking-bubble">
                    <span className="thinking-bar" />
                    <span className="thinking-bar short" />
                  </div>
                </article>
              </>
            )}
            {conversationQuery.isLoading && selectedId && !pendingText && (
              <div className="empty-note centered">
                <Loader2 className="spin" size={15} /> loading conversation
              </div>
            )}
          </div>

          {errorText && (
            <div className="error-banner" role="alert">
              <AlertTriangle size={16} />
              <span>{errorText}</span>
              {failedText && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => submitText(failedText)}
                  disabled={sendMutation.isPending}
                >
                  Retry
                </Button>
              )}
            </div>
          )}

          <section className="camera-panel" aria-label="LUMO camera">
            <div className="camera-panel-header">
              <div>
                <p className="eyebrow">visual input</p>
                <strong>Camera to LUMO</strong>
              </div>
              <Camera size={16} className="muted" />
            </div>
            <video
              ref={cameraVideoRef}
              className={`camera-preview ${cameraOpen ? "visible" : ""}`}
              autoPlay
              muted
              playsInline
              aria-label="Live camera preview"
            />
            <div className="camera-controls">
              {!cameraOpen ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void openCamera()}
                  disabled={runVisionMutation.isPending}
                >
                  <Camera size={14} /> Open camera
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void captureAndAnalyze()}
                    disabled={runVisionMutation.isPending}
                  >
                    {runVisionMutation.isPending ? (
                      <Loader2 size={14} className="spin" />
                    ) : (
                      <ScanEye size={14} />
                    )}
                    Capture & analyze
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={closeCamera}
                    disabled={runVisionMutation.isPending}
                  >
                    <CameraOff size={14} /> Stop
                  </Button>
                </>
              )}
            </div>
            {cameraStatus && <p className="camera-status">{cameraStatus}</p>}
            {visionSnapshot && (
              <div className="vision-snapshot">
                <span className="memory-kind">current visual context</span>
                <p>
                  {visionSnapshot.description ||
                    "Frame analyzed. Ask a question below."}
                </p>
                <button
                  type="button"
                  className="camera-clear"
                  onClick={() => {
                    setVisionSnapshot(null);
                    setCapturedImage(null);
                    setOverlayModel(null);
                  }}
                >
                  Clear visual context
                </button>
                {capturedImage &&
                  overlayModel &&
                  overlayModel.overlays.length > 0 && (
                    <VisualOverlay
                      imageSrc={capturedImage}
                      model={overlayModel}
                      onSelect={overlay => {
                        setSelectedOverlayId(overlay.id);
                        setCameraStatus(
                          `Selected visual target: ${overlay.label}`
                        );
                      }}
                    />
                  )}
              </div>
            )}
          </section>

          <form className="composer" onSubmit={handleSend}>
            <Textarea
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder="Message LUMO…"
              rows={3}
              disabled={sendMutation.isPending}
              aria-label="Message LUMO"
            />
            <div className="composer-footer">
              <span className="composer-hint">
                Cmd/Ctrl + Enter to send · input is kept on failure
              </span>
              <Button
                type="submit"
                disabled={!draft.trim() || sendMutation.isPending}
              >
                {sendMutation.isPending ? (
                  <Loader2 size={15} className="spin" />
                ) : (
                  <Send size={15} />
                )}{" "}
                Send
              </Button>
            </div>
          </form>
        </main>

        <aside className="lumo-inspector" aria-label="LUMO diagnostics">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">instrumentation</p>
              <h2>Diagnostics</h2>
            </div>
            <Terminal size={17} className="muted" />
          </div>

          <section className="inspector-section">
            <div className="section-label">
              <span>runtime</span>
              <span className="mono">safe view</span>
            </div>
            <div className="diagnostic-list">
              <DiagnosticRow
                label="provider"
                value={diagnosticsQuery.data?.provider ?? "loading"}
              />
              <DiagnosticRow
                label="api"
                value={
                  diagnosticsQuery.data?.apiConfigured
                    ? "configured"
                    : "not configured"
                }
                tone={diagnosticsQuery.data?.apiConfigured ? "good" : "warn"}
              />
              <DiagnosticRow
                label="database"
                value={
                  diagnosticsQuery.data?.databaseConfigured
                    ? "configured"
                    : "not configured"
                }
                tone={
                  diagnosticsQuery.data?.databaseConfigured ? "good" : "warn"
                }
              />
              <DiagnosticRow
                label="model"
                value={diagnosticsQuery.data?.model ?? "loading"}
              />
              <DiagnosticRow
                label="timeout"
                value={
                  diagnosticsQuery.data
                    ? `${Math.round(diagnosticsQuery.data.timeoutMs / 1000)}s`
                    : "—"
                }
              />
            </div>
          </section>

          <section className="inspector-section">
            <div className="section-label">
              <span>last turn</span>
              <Clock3 size={14} />
            </div>
            {lastDiagnostics ? (
              <div className="diagnostic-list">
                <DiagnosticRow
                  label="request"
                  value={lastDiagnostics.requestId}
                  mono
                />
                <DiagnosticRow
                  label="elapsed"
                  value={`${lastDiagnostics.elapsedMs}ms`}
                  mono
                />
                <DiagnosticRow
                  label="context"
                  value={`${lastDiagnostics.contextMessageCount} messages`}
                />
                <DiagnosticRow
                  label="memory"
                  value={`${lastDiagnostics.retrievedMemoryCount} retrieved`}
                />
                <DiagnosticRow
                  label="depth"
                  value={`level ${lastDiagnostics.depthLevel}`}
                />
              </div>
            ) : (
              <p className="empty-note">
                Send a message to inspect the assembled context.
              </p>
            )}
          </section>

          <section className="inspector-section memory-section">
            <div className="section-label">
              <span>memory test</span>
              <Save size={14} />
            </div>
            <form onSubmit={addMemory} className="memory-form">
              <select
                value={memoryKind}
                onChange={event =>
                  setMemoryKind(event.target.value as MemoryKind)
                }
                aria-label="Memory type"
              >
                <option value="fact">fact</option>
                <option value="preference">preference</option>
                <option value="project">project</option>
                <option value="summary">summary</option>
                <option value="knowledge">knowledge</option>
              </select>
              <Textarea
                value={memoryDraft}
                onChange={event => setMemoryDraft(event.target.value)}
                placeholder="Add a useful memory for Peter…"
                rows={3}
              />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={!memoryDraft.trim() || memoryMutation.isPending}
              >
                {memoryMutation.isPending ? (
                  <Loader2 size={14} className="spin" />
                ) : (
                  <Save size={14} />
                )}{" "}
                Save memory
              </Button>
            </form>
            {memoryStatus && <p className="memory-status">{memoryStatus}</p>}
            <div className="memory-list">
              {!sortedMemories.length && (
                <p className="empty-note">No stored memories yet.</p>
              )}
              {sortedMemories.map(memory => (
                <div className="memory-item" key={memory.id}>
                  <div>
                    <span className="memory-kind">{memory.kind}</span>
                    <span className="mono muted">
                      {" "}
                      importance {memory.importance}
                    </span>
                  </div>
                  <p>{memory.content}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="inspector-section blueprint-section">
            <div className="section-label">
              <span>blueprint workspace</span>
              <span className="mono">safe view</span>
            </div>
            <BlueprintCanvas blueprint={WORKBENCH_BLUEPRINT} />
          </section>
        </aside>
      </div>
    </div>
  );
}

function DiagnosticRow({
  label,
  value,
  tone = "neutral",
  mono = false,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "good" | "warn";
  mono?: boolean;
}) {
  return (
    <div className="diagnostic-row">
      <span>{label}</span>
      <strong className={`${tone} ${mono ? "mono" : ""}`}>{value}</strong>
    </div>
  );
}
