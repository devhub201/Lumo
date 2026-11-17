import {
  AlertTriangle,
  Camera,
  CameraOff,
  Check,
  ChevronRight,
  CircleDot,
  Database,
  Fingerprint,
  Loader2,
  LockKeyhole,
  Mic,
  MicOff,
  ScanEye,
  ShieldCheck,
  Sparkles,
  Activity,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LumoOrb, type LumoOrbState } from "@/components/LumoOrb";
import { trpc } from "@/lib/trpc";
import {
  CameraError,
  openCameraPreview,
  type CameraSession,
} from "@/lib/camera";
import type { VisionResult } from "../../../server/lumo/vision/contracts";
import { detectModeCommand } from "../../../server/lumo/interaction/commands";
import {
  createSpeechOutput,
  createVoiceInput,
  VoiceError,
} from "@/lib/voice";
import {
  getBiometricAvailability,
  verifyBiometric,
  type BiometricAvailability,
} from "@/lib/biometric";
import { Capacitor } from "@capacitor/core";
import "@/lumo-voice.css";

const SECURE_VAULT_KEY = "lumo.secure-vault.v1";

type SecureEntry = { id: string; note: string; savedAt: string };

const loadSecureVault = (): SecureEntry[] => {
  try {
    const raw = localStorage.getItem(SECURE_VAULT_KEY);
    return raw ? (JSON.parse(raw) as SecureEntry[]) : [];
  } catch {
    return [];
  }
};

const saveSecureVault = (entries: SecureEntry[]) => {
  try {
    localStorage.setItem(SECURE_VAULT_KEY, JSON.stringify(entries));
  } catch {
    // best-effort; secure vault staying in-memory only is an acceptable fallback
  }
};

export default function Home() {
  const nativePlatform = Capacitor.isNativePlatform();
  const [authState, setAuthState] = useState<
    "checking" | "ready" | "authenticated" | "success" | "failed" | "recovery"
  >(nativePlatform ? "checking" : "authenticated");
  const [biometricAvailability, setBiometricAvailability] =
    useState<BiometricAvailability | null>(null);
  const [authMessage, setAuthMessage] = useState(
    "Identity verification required to continue."
  );

  // conversation / voice turn state
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const [lastExchange, setLastExchange] = useState<{
    heard: string;
    reply: string;
  } | null>(null);
  const [interimText, setInterimText] = useState("");

  // always-on mic state
  const [micMuted, setMicMuted] = useState(true);
  const [micStatus, setMicStatus] = useState("starting up…");
  const [speaking, setSpeaking] = useState(false);
  const [liveCaptions, setLiveCaptions] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const sessionStart = useRef(Date.now());
  const [sessionElapsed, setSessionElapsed] = useState(0);

  // secure, never-spoken input
  const [secureVault, setSecureVault] = useState<SecureEntry[]>([]);
  const [secureDraft, setSecureDraft] = useState("");

  // camera / vision quick action
  const [visionOpen, setVisionOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<string | null>(null);
  const [visionSnapshot, setVisionSnapshot] = useState<VisionResult | null>(
    null
  );
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraSessionRef = useRef<CameraSession | null>(null);

  const [securityStatus, setSecurityStatus] = useState(
    "native biometric ready when supported"
  );

  const voiceInputRef = useRef<ReturnType<typeof createVoiceInput> | null>(
    null
  );
  const speechOutputRef = useRef<ReturnType<typeof createSpeechOutput> | null>(
    null
  );
  const autoSpeakRef = useRef(autoSpeak);
  autoSpeakRef.current = autoSpeak;
  const liveCaptionsRef = useRef(liveCaptions);
  liveCaptionsRef.current = liveCaptions;

  const diagnosticsQuery = trpc.lumo.diagnostics.useQuery();
  const memoriesQuery = trpc.lumo.listMemories.useQuery();
  const utils = trpc.useUtils();
  const sendMutation = trpc.lumo.send.useMutation();
  const runVisionMutation = trpc.lumo.runVision.useMutation();

  const sortedMemories = useMemo(
    () => (memoriesQuery.data ?? []).slice(0, 4),
    [memoriesQuery.data]
  );

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
    setSecureVault(loadSecureVault());
  }, []);

  useEffect(() => {
    const id = setInterval(
      () => setSessionElapsed(Date.now() - sessionStart.current),
      1000
    );
    return () => clearInterval(id);
  }, []);

  const submitText = (text: string) => {
    const cleanText = text.trim();
    if (!cleanText || sendMutation.isPending) return;

    const modeCommand = detectModeCommand(cleanText);
    if (modeCommand) {
      if (modeCommand.mode === "text") {
        muteMic();
        return;
      }
      if (modeCommand.mode === "voice") {
        unmuteMic();
        return;
      }
      if (modeCommand.mode === "camera") {
        void openCamera();
        return;
      }
      setMicStatus(`"${modeCommand.mode}" mode isn't wired up yet`);
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
      },
      {
        onSuccess: result => {
          setSelectedId(result.conversation.id);
          setPendingText(null);
          setLastDiagnostics(result.diagnostics);
          setLastExchange({
            heard: cleanText,
            reply: result.assistantMessage.content,
          });
          if (autoSpeakRef.current) {
            setSpeaking(true);
            void speechOutputRef.current
              ?.speak(result.assistantMessage.content, () =>
                setSpeaking(false)
              )
              .catch(() => setSpeaking(false));
          }
          void utils.lumo.listMemories.invalidate();
        },
        onError: error => {
          setPendingText(null);
          setFailedText(cleanText);
          setErrorText(error.message);
        },
      }
    );
  };

  const muteMic = () => {
    voiceInputRef.current?.mute();
    setMicMuted(true);
    setMicStatus("muted");
    setInterimText("");
  };
  const unmuteMic = () => {
    voiceInputRef.current?.unmute();
    setMicMuted(false);
  };

  // Always-on microphone: starts once the page mounts and keeps itself
  // alive across the whole session, independent of which screen is shown.
  useEffect(() => {
    speechOutputRef.current = createSpeechOutput();
    const input = createVoiceInput();
    voiceInputRef.current = input;

    void input
      .start({
        continuous: true,
        interimResults: true,
        onInterim: text => {
          if (liveCaptionsRef.current) setInterimText(text);
        },
        onFinal: text => {
          setInterimText("");
          submitText(text);
        },
        onError: error => {
          setMicMuted(true);
          setMicStatus(
            error.code === "permission_denied"
              ? "microphone permission denied"
              : error.code === "unsupported"
                ? "not supported in this browser"
                : error.message
          );
        },
        onStateChange: state => {
          setMicStatus(state === "listening" ? "listening" : "reconnecting…");
        },
      })
      .then(() => setMicMuted(false))
      .catch((error: unknown) => {
        setMicMuted(true);
        setMicStatus(
          error instanceof VoiceError
            ? error.message
            : "microphone permission was not granted"
        );
      });

    return () => {
      input.stop();
      speechOutputRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Space bar toggles mute, matching the on-screen hint.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== "Space") return;
      const target = event.target as HTMLElement | null;
      if (target && ["TEXTAREA", "INPUT"].includes(target.tagName)) return;
      event.preventDefault();
      if (micMuted) unmuteMic();
      else muteMic();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micMuted]);

  useEffect(
    () => () => {
      cameraSessionRef.current?.stop();
      cameraSessionRef.current = null;
    },
    []
  );

  const openCamera = async () => {
    setVisionOpen(true);
    if (cameraSessionRef.current || !cameraVideoRef.current) return;
    setCameraStatus("Requesting camera permission…");
    try {
      const session = await openCameraPreview(cameraVideoRef.current, {
        facingMode: "environment",
      });
      cameraSessionRef.current = session;
      setCameraOpen(true);
      setCameraStatus("Camera is live. Capture a frame when you're ready.");
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
    setCameraStatus("Camera stopped.");
  };

  const captureAndAnalyze = async () => {
    const session = cameraSessionRef.current;
    if (!session || runVisionMutation.isPending) return;
    setCameraStatus("Analyzing the frame…");
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
      setCameraStatus("Frame analyzed — ask about what it saw.");
    } catch (error) {
      setCameraStatus(
        error instanceof Error
          ? error.message
          : "The camera frame could not be analyzed."
      );
    }
  };

  const addSecureEntry = () => {
    const note = secureDraft.trim();
    if (!note) return;
    const next = [
      { id: crypto.randomUUID(), note, savedAt: new Date().toISOString() },
      ...secureVault,
    ].slice(0, 20);
    setSecureVault(next);
    saveSecureVault(next);
    setSecureDraft("");
  };

  const removeSecureEntry = (id: string) => {
    const next = secureVault.filter(entry => entry.id !== id);
    setSecureVault(next);
    saveSecureVault(next);
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
      setAuthMessage("Identity verified for this session.");
      setAuthState("success");
      window.setTimeout(() => setAuthState("authenticated"), 750);
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

  const orbState: LumoOrbState = micMuted
    ? "muted"
    : pendingText
      ? "thinking"
      : speaking
        ? "speaking"
        : "listening";

  const statusCopy = micMuted
    ? "Muted — tap to resume"
    : pendingText
      ? "Thinking…"
      : speaking
        ? "Speaking…"
        : micStatus === "listening"
          ? "Listening — go ahead, Peter"
          : micStatus;

  const sessionLabel = (() => {
    const totalSeconds = Math.floor(sessionElapsed / 1000);
    const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const ss = String(totalSeconds % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  })();

  return (
    <div className="lv-shell">
      <div className="lv-glow" />

      <div className="lv-top">
        <div className="lv-brand">
          <svg viewBox="0 0 24 24" fill="none" stroke="url(#lv-g1)" strokeWidth={1.6}>
            <defs>
              <linearGradient id="lv-g1" x1="0" x2="1">
                <stop offset="0" stopColor="#33d6ff" />
                <stop offset="1" stopColor="#a566ff" />
              </linearGradient>
            </defs>
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="3" fill="url(#lv-g1)" />
          </svg>
          LUMO <small>Personal AI</small>
        </div>
        <div className="lv-top-right">
          <span className={`lv-pill ${micMuted ? "lv-mic-off" : "lv-mic-on"}`}>
            {micMuted ? <MicOff /> : <Mic />}
            {micMuted ? "Muted" : "Always listening"}
          </span>
          <span className="lv-pill">
            <i />
            {diagnosticsQuery.data?.apiConfigured ? "Online" : "Degraded"}
          </span>
          <span className="lv-av">P</span>
        </div>
      </div>

      <div className="lv-tabs">
        <button type="button" className="lv-tab lv-on">
          <CircleDot /> Home
        </button>
        {["Study", "Coding", "Browser", "Files", "Vision", "Blueprint", "Settings"].map(
          label => (
            <button type="button" className="lv-tab" key={label} disabled>
              {label}
              <span className="lv-tab-soon">soon</span>
            </button>
          )
        )}
      </div>

      <div className="lv-rail lv-left">
        <div className="lv-card">
          <h4>Voice settings</h4>
          <div className="lv-mode-row">
            Live captions
            <button
              type="button"
              className={`lv-sw ${liveCaptions ? "lv-on" : ""}`}
              onClick={() => setLiveCaptions(v => !v)}
            >
              <i />
              <b />
            </button>
          </div>
          <div className="lv-mode-row">
            Auto-speak replies
            <button
              type="button"
              className={`lv-sw ${autoSpeak ? "lv-on" : ""}`}
              onClick={() => setAutoSpeak(v => !v)}
            >
              <i />
              <b />
            </button>
          </div>
        </div>
        <div className="lv-card">
          <h4>System</h4>
          <div className="lv-mode-row">
            Core{" "}
            <b style={{ color: "#4ade80", fontWeight: 600 }}>
              {diagnosticsQuery.data ? "Stable" : "Checking…"}
            </b>
          </div>
          <div className="lv-mode-row">
            Provider{" "}
            <b style={{ color: "#e6e6ea", fontWeight: 600 }}>
              {diagnosticsQuery.data?.provider ?? "—"}
            </b>
          </div>
        </div>
        <div className="lv-card lv-secure-card">
          <div className="lv-secure-title">
            <LockKeyhole />
            <span>Secure input</span>
          </div>
          <div className="lv-secure-note">
            For passwords, API keys, tokens — anything you can't say out
            loud. Stored on this device only; never spoken, never sent to
            the model.
          </div>
          <textarea
            className="lv-secure-box"
            placeholder="Type a secret or sensitive note…"
            value={secureDraft}
            onChange={event => setSecureDraft(event.target.value)}
            rows={3}
          />
          <div className="lv-secure-actions">
            <span className="lv-lock-hint">
              <LockKeyhole />
              local only
            </span>
            <button
              type="button"
              className="lv-secure-send"
              disabled={!secureDraft.trim()}
              onClick={addSecureEntry}
            >
              Save securely
            </button>
          </div>
          {secureVault.length > 0 && (
            <div className="lv-secure-list">
              {secureVault.slice(0, 3).map(entry => (
                <div className="lv-secure-item" key={entry.id}>
                  <span>{"•".repeat(Math.min(entry.note.length, 18))}</span>
                  <button type="button" onClick={() => removeSecureEntry(entry.id)}>
                    remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="lv-rail lv-right">
        <div className="lv-card">
          <h4>Recent</h4>
          {sortedMemories.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--lv-mut)" }}>
              Nothing saved yet — it'll show up here as Lumo learns things.
            </p>
          )}
          {sortedMemories.map(memory => (
            <div className="lv-log-row" key={memory.id}>
              <div className="lv-log-ico">
                <Database />
              </div>
              <div>
                <b>{memory.kind.replace(/_/g, " ")}</b>
                <span>{memory.content.slice(0, 56)}</span>
                <time>
                  {new Date(memory.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="lv-stage">
        <div className={`lv-kicker ${micMuted ? "lv-muted-kicker" : ""}`}>
          <i />
          {micMuted ? "Voice link paused" : "Voice link active"}
        </div>

        <LumoOrb state={orbState} size={220} />

        <div className="lv-wordmark">
          L<span>.</span>U<span>.</span>M<span>.</span>O
        </div>
        <div className={`lv-status-line ${micMuted ? "lv-muted" : ""}`}>
          <i />
          {statusCopy}
        </div>

        <div className={`lv-wave ${micMuted || pendingText ? "lv-idle" : ""}`}>
          {Array.from({ length: 7 }).map((_, index) => (
            <i key={index} style={{ animationDelay: `${index * 0.07}s` }} />
          ))}
        </div>

        {liveCaptions && interimText && !micMuted && (
          <div className="lv-interim">&ldquo;{interimText}&hellip;&rdquo;</div>
        )}

        {lastExchange && (
          <div className="lv-transcript">
            &ldquo;{lastExchange.heard}&rdquo;
            <br />
            <b>{lastExchange.reply}</b>
          </div>
        )}

        <button
          type="button"
          className={`lv-talk ${micMuted ? "lv-talk-muted" : ""}`}
          onClick={() => (micMuted ? unmuteMic() : muteMic())}
        >
          {micMuted ? <Mic /> : <MicOff />}
          {micMuted ? "Resume listening" : "Mute microphone"}
        </button>
        <div className="lv-talk-hint">
          always on &mdash; follows you across every screen &nbsp;&middot;&nbsp;{" "}
          <kbd>Space</kbd> to {micMuted ? "resume" : "mute"}
        </div>

        <button
          type="button"
          className="lv-vision-toggle"
          onClick={() => (visionOpen ? setVisionOpen(false) : void openCamera())}
        >
          <Camera />
          {visionOpen ? "Hide vision" : "Show Lumo what you see"}
        </button>

        {visionOpen && (
          <div className="lv-vision-panel">
            <video
              ref={cameraVideoRef}
              className={`lv-vision-video ${cameraOpen ? "lv-visible" : ""}`}
              autoPlay
              muted
              playsInline
            />
            <div className="lv-vision-body">
              <div className="lv-vision-actions">
                {!cameraOpen ? (
                  <button
                    type="button"
                    className="lv-vbtn"
                    onClick={() => void openCamera()}
                  >
                    <Camera /> Open camera
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      className="lv-vbtn"
                      onClick={() => void captureAndAnalyze()}
                      disabled={runVisionMutation.isPending}
                    >
                      {runVisionMutation.isPending ? (
                        <Loader2 className="spin" />
                      ) : (
                        <ScanEye />
                      )}
                      Capture &amp; analyze
                    </button>
                    <button type="button" className="lv-vbtn" onClick={closeCamera}>
                      <CameraOff /> Stop
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="lv-vbtn"
                  onClick={() => void authenticateSensitiveAction()}
                >
                  <Fingerprint /> Secure
                </button>
              </div>
              {cameraStatus && <span>{cameraStatus}</span>}
              {visionSnapshot?.description && (
                <span>{visionSnapshot.description}</span>
              )}
              <span style={{ opacity: 0.7 }}>{securityStatus}</span>
            </div>
          </div>
        )}

        {errorText && (
          <div className="lv-error-banner" role="alert">
            <AlertTriangle />
            <span>{errorText}</span>
            {failedText && (
              <button
                type="button"
                onClick={() => submitText(failedText)}
                disabled={sendMutation.isPending}
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      <div className="lv-stats">
        <div className="lv-stat">
          <div className="lv-l">Memory</div>
          <b>{memoriesQuery.data?.length ?? 0}</b>
          <div className="lv-s">records stored</div>
        </div>
        <div className="lv-stat">
          <div className="lv-l">Latency</div>
          <b>{lastDiagnostics ? `${lastDiagnostics.elapsedMs}ms` : "—"}</b>
          <div className="lv-s">response time</div>
        </div>
        <div className="lv-stat">
          <div className="lv-l">Session</div>
          <b>{sessionLabel}</b>
          <div className="lv-s">time active</div>
        </div>
      </div>
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
  state: "checking" | "ready" | "success" | "failed" | "recovery";
  availability: BiometricAvailability | null;
  message: string;
  onAuthenticate: () => void;
  onRecovery: () => void;
}) {
  const busy = state === "checking";
  const verifiedCapability = availability?.supported === true;
  const capabilityLoading = availability === null;
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
          <div
            className={`auth-energy-orb auth-energy-${state}`}
            aria-hidden="true"
          >
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
              <Sparkles size={14} /> Voice
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
            className={`auth-biometric-visual auth-orb-${state} ${busy ? "auth-pulsing" : ""} ${state === "failed" || state === "recovery" ? "auth-unavailable" : ""}`}
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
            ) : state === "success" ? (
              <Check size={18} />
            ) : (
              <Fingerprint size={18} />
            )}
            {busy
              ? "CHECKING DEVICE…"
              : state === "success"
                ? "IDENTITY VERIFIED"
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
          {capabilityLoading ? (
            <div
              className="auth-status-card auth-skeleton-card"
              aria-label="Loading security capability"
            >
              <span className="auth-skeleton auth-skeleton-icon" />
              <div className="auth-skeleton-copy">
                <span className="auth-skeleton auth-skeleton-line wide" />
                <span className="auth-skeleton auth-skeleton-line" />
              </div>
            </div>
          ) : (
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
          )}
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
