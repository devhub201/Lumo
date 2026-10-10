import { Streamdown } from "streamdown";
import {
  AlertTriangle,
  Activity,
  BrainCircuit,
  Camera,
  CameraOff,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Database,
  Loader2,
  Mic,
  Plus,
  RefreshCw,
  Save,
  ScanEye,
  Send,
  ShieldCheck,
  Sparkles,
  Fingerprint,
  LockKeyhole,
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
import { TeachingOverlay } from "@/components/TeachingOverlay";
import { trpc } from "@/lib/trpc";
import {
  CameraError,
  openCameraPreview,
  type CameraSession,
} from "@/lib/camera";
import type { VisionResult } from "../../../server/lumo/vision/contracts";
import type { Blueprint } from "../../../server/lumo/blueprints/contracts";
import type { OverlayModel } from "../../../server/lumo/overlays/contracts";
import { detectModeCommand } from "../../../server/lumo/interaction/commands";
import type { InteractionMode } from "../../../server/lumo/interaction/contracts";
import type { TeachingSession } from "../../../server/lumo/teaching/contracts";
import { createSpeechOutput, createVoiceInput, VoiceError } from "@/lib/voice";
import {
  getBiometricAvailability,
  verifyBiometric,
  type BiometricAvailability,
} from "@/lib/biometric";
import { Capacitor } from "@capacitor/core";

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
  const nativePlatform = Capacitor.isNativePlatform();
  const [authState, setAuthState] = useState<
    "checking" | "ready" | "authenticated" | "failed" | "recovery"
  >(nativePlatform ? "checking" : "authenticated");
  const [biometricAvailability, setBiometricAvailability] =
    useState<BiometricAvailability | null>(null);
  const [authMessage, setAuthMessage] = useState(
    "Identity verification required to continue."
  );
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
  const [teachingSession, setTeachingSession] =
    useState<TeachingSession | null>(null);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(
    null
  );
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>("text");
  const [workspacePreset, setWorkspacePreset] = useState("Peter Mode");
  const [securityStatus, setSecurityStatus] = useState(
    "native biometric ready when supported"
  );
  const [voiceStatus, setVoiceStatus] = useState("text mode");
  const voiceInputRef = useRef<ReturnType<typeof createVoiceInput> | null>(
    null
  );
  const speechOutputRef = useRef<ReturnType<typeof createSpeechOutput> | null>(
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
  const performanceSummaryQuery = trpc.lumo.performanceSummary.useQuery();
  const githubCatalogQuery = trpc.lumo.githubCatalog.useQuery();
  const gmailCatalogQuery = trpc.lumo.gmailCatalog.useQuery();

  useEffect(() => {
    if (!nativePlatform) return;
    void getBiometricAvailability().then(availability => {
      setBiometricAvailability(availability);
      setAuthState(availability.supported ? "ready" : "failed");
      setAuthMessage(
        availability.supported
          ? "Identity verification required to continue."
          : (availability.reason ?? "Biometric authentication is unavailable.")
      );
    });
  }, [nativePlatform]);

  useEffect(() => {
    voiceInputRef.current = createVoiceInput();
    speechOutputRef.current = createSpeechOutput();
    return () => {
      voiceInputRef.current?.cancel();
      speechOutputRef.current?.stop();
    };
  }, []);

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
    setTeachingSession(null);
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
    setTeachingSession(null);
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
      const nextOverlay =
        (response as { overlay?: OverlayModel | null }).overlay ?? null;
      setOverlayModel(nextOverlay);
      if (nextOverlay) {
        setTeachingSession({
          id: `teaching:${result.data.requestId}`,
          sourceIdentity: result.data.source.identity,
          annotations: nextOverlay.overlays.map((overlay, index) => ({
            id: `annotation:${overlay.id}`,
            type: "red_box" as const,
            rect: overlay.rect,
            targetId: overlay.id,
            title: overlay.label,
            explanation: `This visual target was identified with ${Math.round((overlay.confidence ?? 0) * 100)}% confidence.`,
            sequence: index + 1,
            visible: true,
          })),
          currentSequence: 1,
          active: true,
          trust: "untrusted_teaching_data",
        });
      }
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

  const startVoiceListening = async () => {
    setInteractionMode("voice");
    setVoiceStatus("requesting microphone permission");
    try {
      await voiceInputRef.current?.startListening(
        text => {
          setVoiceStatus("transcription received");
          submitText(text);
        },
        error => {
          setVoiceStatus(`${error.message} Text mode remains available.`);
          setInteractionMode("text");
        }
      );
      setVoiceStatus("listening");
    } catch (error) {
      setVoiceStatus(
        error instanceof VoiceError
          ? error.message
          : "Microphone unavailable; use text."
      );
      setInteractionMode("text");
    }
  };

  const submitText = (text: string) => {
    const cleanText = text.trim();
    if (!cleanText || sendMutation.isPending) return;
    const modeCommand = detectModeCommand(cleanText);
    if (modeCommand) {
      if (modeCommand.mode === "text") {
        voiceInputRef.current?.cancel();
        speechOutputRef.current?.stop();
      }
      setInteractionMode(modeCommand.mode);
      setVoiceStatus(`${modeCommand.mode} mode active`);
      if (modeCommand.mode === "voice") void startVoiceListening();
      return;
    }
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
          if (interactionMode === "voice") {
            setVoiceStatus("speaking");
            void speechOutputRef.current
              ?.speak(result.assistantMessage.content, () =>
                setVoiceStatus("listening")
              )
              .catch(() =>
                setVoiceStatus("speech failed; text response available")
              );
          }
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

  const authenticateSensitiveAction = async () => {
    setSecurityStatus("waiting for device biometric prompt");
    const result = await verifyBiometric();
    setSecurityStatus(
      result.verified ? "biometric verified for this session" : result.reason
    );
  };

  const authenticateEntry = async () => {
    setAuthState("checking");
    setAuthMessage("Waiting for the device biometric prompt…");
    const result = await verifyBiometric();
    if (result.verified) {
      setAuthState("authenticated");
      setAuthMessage("Identity verified for this session.");
      return;
    }
    setAuthState("failed");
    setAuthMessage(result.reason);
  };

  if (nativePlatform && authState !== "authenticated") {
    return (
      <AuthenticationScreen
        state={authState}
        availability={biometricAvailability}
        message={authMessage}
        onAuthenticate={() => void authenticateEntry()}
        onRecovery={() => {
          setAuthState("recovery");
          setAuthMessage(
            "Recovery is not configured for this installation. No password, PIN, or recovery code is accepted."
          );
        }}
      />
    );
  }

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
            <span className={`status-dot ${pendingText ? "busy" : ""}`} />
            {pendingText ? "processing" : "core online"}
          </span>
          <span className="mode-chip">{workspacePreset}</span>
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
          <section className="lumo-hud" aria-label="LUMO live workspace">
            <div className="orb-card">
              <div
                className={`lumo-orb ${pendingText ? "orb-active" : ""} ${interactionMode === "voice" ? "orb-voice" : ""}`}
                aria-hidden="true"
              >
                <span />
              </div>
              <div>
                <p className="eyebrow">live intelligence</p>
                <strong>
                  {pendingText
                    ? "Processing request"
                    : interactionMode === "voice"
                      ? voiceStatus
                      : "Ready for direction"}
                </strong>
                <span className="hud-subtitle">
                  {cameraOpen
                    ? "camera session active"
                    : "single-user secure workspace"}
                </span>
              </div>
            </div>
            <div className="hud-metrics">
              <div>
                <span>turns</span>
                <strong>{conversationsQuery.data?.length ?? 0}</strong>
              </div>
              <div>
                <span>telemetry</span>
                <strong>{performanceSummaryQuery.data?.count ?? 0}</strong>
              </div>
              <div>
                <span>latency</span>
                <strong>
                  {lastDiagnostics ? `${lastDiagnostics.elapsedMs}ms` : "—"}
                </strong>
              </div>
            </div>
            <div className="hud-actions">
              <button
                type="button"
                onClick={() => setDraft("Summarize my current workspace")}
              >
                <Sparkles size={13} /> Quick brief
              </button>
              <button
                type="button"
                onClick={() => void openCamera()}
                disabled={cameraOpen}
              >
                <Camera size={13} /> Vision
              </button>
              <select
                value={workspacePreset}
                onChange={event => setWorkspacePreset(event.target.value)}
                aria-label="Workspace preset"
              >
                <option>Peter Mode</option>
                <option>Study</option>
                <option>Coding</option>
                <option>Creator</option>
                <option>Gaming</option>
              </select>
              <button
                type="button"
                onClick={() => void authenticateSensitiveAction()}
                title="Verify sensitive actions"
              >
                <Fingerprint size={13} /> Secure
              </button>
            </div>
          </section>
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

          <section className="workspace-grid" aria-label="Live Workspace">
            <div className="live-workspace-card">
              <div className="workspace-card-heading">
                <div>
                  <p className="eyebrow">live workspace</p>
                  <strong>
                    {pendingText
                      ? "Executing LUMO task"
                      : "Workspace standing by"}
                  </strong>
                </div>
                <span className="workspace-live-indicator">
                  <span /> {pendingText ? "active" : "ready"}
                </span>
              </div>
              <div className="task-progress-track" aria-label="Task progress">
                <span style={{ width: pendingText ? "58%" : "100%" }} />
              </div>
              <div className="activity-timeline">
                <div className="activity-item complete">
                  <span>01</span>
                  <div>
                    <strong>Input channel</strong>
                    <small>{interactionMode} interface armed</small>
                  </div>
                </div>
                <div
                  className={`activity-item ${pendingText ? "active" : "complete"}`}
                >
                  <span>02</span>
                  <div>
                    <strong>Context assembly</strong>
                    <small>
                      {pendingText
                        ? "retrieving memory and workspace context"
                        : `${messages.length} conversation messages available`}
                    </small>
                  </div>
                </div>
                <div
                  className={`activity-item ${pendingText ? "queued" : "complete"}`}
                >
                  <span>03</span>
                  <div>
                    <strong>Response synthesis</strong>
                    <small>
                      {pendingText
                        ? "provider task in progress"
                        : "ready for the next instruction"}
                    </small>
                  </div>
                </div>
              </div>
            </div>
            <div className="quick-actions-card">
              <div className="workspace-card-heading">
                <div>
                  <p className="eyebrow">command deck</p>
                  <strong>Quick actions</strong>
                </div>
                <Sparkles size={16} />
              </div>
              <div className="quick-action-grid">
                <button
                  type="button"
                  onClick={() =>
                    setDraft(
                      "Plan my next priorities and show them as a focused checklist"
                    )
                  }
                >
                  <Check size={14} /> Plan priorities
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setDraft(
                      "Research this topic and summarize the trusted sources"
                    )
                  }
                >
                  <Activity size={14} /> Research
                </button>
                <button
                  type="button"
                  onClick={() => void startVoiceListening()}
                >
                  <Mic size={14} /> Voice input
                </button>
                <button
                  type="button"
                  onClick={() => void openCamera()}
                  disabled={cameraOpen}
                >
                  <Camera size={14} /> Live vision
                </button>
              </div>
            </div>
          </section>

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
              <Button
                type="button"
                variant={interactionMode === "voice" ? "default" : "outline"}
                size="sm"
                onClick={() => void startVoiceListening()}
              >
                <Mic size={14} />{" "}
                {interactionMode === "voice" ? "Listening" : "Voice mode"}
              </Button>
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
            <p className="camera-status">
              mode: {interactionMode} · {voiceStatus}
            </p>
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
                    setTeachingSession(null);
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
                {interactionMode === "teaching" &&
                  capturedImage &&
                  teachingSession && (
                    <TeachingOverlay
                      imageSrc={capturedImage}
                      session={teachingSession}
                      onChange={setTeachingSession}
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
              <span>connections</span>
              <Activity size={14} />
            </div>
            <div className="connection-grid">
              <DiagnosticRow
                label="GitHub"
                value={
                  githubCatalogQuery.data?.providerMode ===
                  "mock_disconnected_until_explicit_provider_connection"
                    ? "disconnected"
                    : "connected"
                }
                tone="warn"
              />
              <DiagnosticRow
                label="Gmail"
                value={
                  gmailCatalogQuery.data?.providerMode ===
                  "mock_disconnected_until_explicit_provider_connection"
                    ? "disconnected"
                    : "connected"
                }
                tone="warn"
              />
            </div>
            <p className="empty-note">
              OAuth is user-initiated and not configured in this build.
            </p>
          </section>

          <section className="inspector-section">
            <div className="section-label">
              <span>security layer</span>
              <ShieldCheck size={14} />
            </div>
            <p className="empty-note">{securityStatus}</p>
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

function AuthenticationScreen({
  state,
  availability,
  message,
  onAuthenticate,
  onRecovery,
}: {
  state: "checking" | "ready" | "failed" | "recovery";
  availability: BiometricAvailability | null;
  message: string;
  onAuthenticate: () => void;
  onRecovery: () => void;
}) {
  const busy = state === "checking";
  const verifiedCapability = availability?.supported === true;
  return (
    <div className="auth-screen">
      <header className="auth-topbar">
        <div className="auth-brand">
          <span className="auth-brand-orb">
            <span />
          </span>
          <strong>LUMO</strong>
          <i /> <span>YOUR INTELLIGENCE. YOUR WORLD.</span>
        </div>
        <span className="auth-topbar-status">
          <span /> native security boundary
        </span>
      </header>
      <div className="auth-layout">
        <section className="auth-identity-panel">
          <div className="auth-energy-orb" aria-hidden="true">
            <span />
          </div>
          <p className="auth-wordmark">LUMO</p>
          <p className="auth-tagline">YOUR INTELLIGENCE. YOUR WORLD.</p>
          <p className="auth-supporting">
            A personal intelligence workspace for thinking, creating, solving,
            and exploring — all in one place.
          </p>
          <div
            className="auth-shortcuts"
            aria-label="Available workspace areas"
          >
            <span>
              <Sparkles size={14} /> Chat
            </span>
            <span>
              <Activity size={14} /> Live Workspace
            </span>
            <span>
              <Camera size={14} /> Vision
            </span>
          </div>
        </section>
        <section className={`auth-card auth-state-${state}`} aria-live="polite">
          <p className="auth-eyebrow">— secure access —</p>
          <h1>
            WELCOME BACK, <strong>PETER</strong>
          </h1>
          <p className="auth-message">{message}</p>
          <div
            className={`auth-biometric-visual ${busy ? "auth-pulsing" : ""} ${state === "failed" || state === "recovery" ? "auth-unavailable" : ""}`}
            aria-hidden="true"
          >
            <LockKeyhole size={48} />
            <span />
          </div>
          <button
            className="auth-primary-button"
            type="button"
            onClick={onAuthenticate}
            disabled={busy || !verifiedCapability}
          >
            {busy ? (
              <Loader2 size={18} className="spin" />
            ) : (
              <Fingerprint size={18} />
            )}
            {busy
              ? "CHECKING DEVICE…"
              : verifiedCapability
                ? "AUTHENTICATE WITH BIOMETRICS"
                : "BIOMETRICS UNAVAILABLE"}
          </button>
          <button
            className="auth-recovery-button"
            type="button"
            onClick={onRecovery}
            disabled={busy}
          >
            <LockKeyhole size={16} /> USE RECOVERY METHOD{" "}
            <ChevronRight size={16} />
          </button>
          <p className="auth-privacy">
            <ShieldCheck size={14} /> Biometric data stays inside the device.
            LUMO receives only the verification result.
          </p>
        </section>
        <aside className="auth-security-panel">
          <div className="auth-panel-title">
            <ShieldCheck size={18} />
            <span>SECURITY STATUS</span>
            <b />
          </div>
          <div className="auth-status-card">
            <span className="auth-status-icon">
              <ShieldCheck size={18} />
            </span>
            <div>
              <strong>
                {busy
                  ? "Checking capability"
                  : verifiedCapability
                    ? "Awaiting verification"
                    : "Unavailable"}
              </strong>
              <small>{busy ? "Querying native device" : message}</small>
            </div>
          </div>
          <div className="auth-fact">
            <Fingerprint size={21} />
            <div>
              <span>Biometric availability</span>
              <strong>
                {busy
                  ? "checking…"
                  : verifiedCapability
                    ? "available"
                    : "unavailable"}
              </strong>
            </div>
          </div>
          <div className="auth-fact">
            <LockKeyhole size={21} />
            <div>
              <span>Protected entry</span>
              <strong>native prompt required</strong>
            </div>
          </div>
          <div className="auth-fact">
            <Activity size={21} />
            <div>
              <span>Session state</span>
              <strong>
                {state === "recovery" ? "recovery unavailable" : state}
              </strong>
            </div>
          </div>
          <div className="auth-quote">
            “Your privacy is part of the architecture.”
          </div>
        </aside>
      </div>
    </div>
  );
}
