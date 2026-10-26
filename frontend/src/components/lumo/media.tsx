import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  AudioLines,
  Camera,
  CameraOff,
  Download,
  Mic,
  MicOff,
  RefreshCw,
  ScanLine,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getIntegrations, getSessionIntegrations } from "@/lib/lumo/integrations";
import { Orb, type OrbState } from "./orb";
import { Notice, PageHeading, Status } from "./ui";
function mediaError(e: unknown, media: string) {
  const name = e instanceof DOMException ? e.name : "";
  return name === "NotAllowedError"
    ? `${media} permission was denied. Allow access in your browser settings, then try again.`
    : name === "NotFoundError"
      ? `No ${media.toLowerCase()} was found on this device.`
      : name === "NotReadableError"
        ? `${media} is busy or unavailable. Close other apps using it and try again.`
        : `${media} could not be started in this browser.`;
}
export function VoiceScreen() {
  const [state, setState] = useState<OrbState>("idle");
  const [error, setError] = useState("");
  const [amplitude, setAmplitude] = useState(0);
  const [permission, setPermission] = useState("Not requested");
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [usingVoiceProvider, setUsingVoiceProvider] = useState(false);
  const [transcript, setTranscript] = useState("");
  const stream = useRef<MediaStream | null>(null);
  const context = useRef<AudioContext | null>(null);
  const frame = useRef(0);
  const mounted = useRef(true);
  const busy = useRef(false);
  const voiceAbort = useRef<AbortController | null>(null);
  const voiceStop = useRef<(() => void) | null>(null);
  const voiceActive = usingVoiceProvider && !["idle", "error", "loading"].includes(state);
  const stop = () => {
    voiceAbort.current?.abort();
    voiceAbort.current = null;
    voiceStop.current?.();
    voiceStop.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    cancelAnimationFrame(frame.current);
    void context.current?.close();
    context.current = null;
    setAmplitude(0);
    setUsingVoiceProvider(false);
    setState("idle");
  };
  useEffect(() => {
    mounted.current = true;
    setSpeechAvailable(Boolean(getSessionIntegrations().voice));
    return () => {
      mounted.current = false;
      voiceAbort.current?.abort();
      voiceStop.current?.();
      stream.current?.getTracks().forEach((t) => t.stop());
      cancelAnimationFrame(frame.current);
      void context.current?.close();
    };
  }, []);
  const start = async () => {
    if (busy.current) return;
    busy.current = true;
    setError("");
    setState("loading");
    try {
      const voice = getSessionIntegrations().voice;
      if (voice) {
        const controller = new AbortController();
        voiceAbort.current = controller;
        voiceStop.current = voice.stop;
        setSpeechAvailable(true);
        setUsingVoiceProvider(true);
        await voice.start((event) => {
          if (!mounted.current || controller.signal.aborted) return;
          setState(event.state === "processing" ? "thinking" : event.state);
          if (typeof event.level === "number") {
            setAmplitude(Math.max(0, Math.min(1, event.level)));
          }
          if (event.transcript) setTranscript(event.transcript);
        }, controller.signal);
        return;
      }
      setUsingVoiceProvider(false);
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      setPermission("Granted");
      const audio = new AudioContext();
      context.current = audio;
      await audio.resume();
      const analyzer = audio.createAnalyser();
      analyzer.fftSize = 256;
      audio.createMediaStreamSource(media).connect(analyzer);
      const data = new Uint8Array(analyzer.frequencyBinCount);
      const tick = () => {
        analyzer.getByteTimeDomainData(data);
        let sum = 0;
        for (const n of data) sum += ((n - 128) / 128) ** 2;
        setAmplitude(Math.min(1, Math.sqrt(sum / data.length) * 5));
        frame.current = requestAnimationFrame(tick);
      };
      tick();
      setState("listening");
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      void context.current?.close();
      stream.current = null;
      context.current = null;
      if (mounted.current && !voiceAbort.current?.signal.aborted) {
        setState("error");
        setPermission(
          e instanceof DOMException && e.name === "NotAllowedError" ? "Denied" : "Unavailable",
        );
        setError(mediaError(e, "Microphone"));
      }
    } finally {
      busy.current = false;
    }
  };
  return (
    <div className="screen-page voice-page">
      <PageHeading
        eyebrow="A more natural connection"
        title="Voice mode"
        description="Space to speak. Room to think."
        action={
          <Button asChild variant="outline">
            <Link to="/chat" search={{ prompt: "" }}>
              <ArrowLeft />
              Back to text
            </Link>
          </Button>
        }
      />
      <div className="voice-stage">
        <div className="voice-topline">
          <Status warning={!speechAvailable || state === "error"}>
            {state === "listening"
              ? "Microphone active"
              : state === "thinking"
                ? "Processing speech"
                : state === "speaking"
                  ? "LUMO is speaking"
                  : speechAvailable
                    ? "Voice ready"
                    : "Audio preview"}
          </Status>
          <span className="metadata">
            {speechAvailable ? "Connected voice service" : "Speech processing not connected"}
          </span>
        </div>
        <Orb state={state} amplitude={amplitude} />
        <h2>
          {state === "listening"
            ? "Listening to your microphone."
            : state === "loading"
              ? "Requesting microphone access…"
              : state === "thinking"
                ? "LUMO is thinking."
                : state === "speaking"
                  ? "LUMO is speaking."
                  : state === "error"
                    ? "Let’s try that again."
                    : "A thought begins with your voice."}
        </h2>
        <p>
          {usingVoiceProvider
            ? "Voice activity is handled by your connected service."
            : state === "listening"
              ? "Live audio levels only. Audio is not recorded or sent."
              : "Microphone input is available. AI voice responses require setup."}
        </p>
        {transcript && usingVoiceProvider && (
          <p className="voice-transcript" aria-live="polite">
            {transcript}
          </p>
        )}
        <div className="voice-controls">
          <Button variant="outline" size="icon" title="Return to text" asChild>
            <Link to="/chat" search={{ prompt: "" }} aria-label="Return to text">
              <X />
            </Link>
          </Button>
          <Button
            className="mic-button"
            size="icon"
            disabled={state === "loading"}
            aria-label={voiceActive ? "Stop voice session" : "Start microphone"}
            title={voiceActive ? "Stop voice session" : "Start microphone"}
            onClick={() => (voiceActive || state === "listening" ? stop() : void start())}
          >
            {voiceActive || state === "listening" ? <MicOff /> : <Mic />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            title="Audio permissions"
            aria-label="Audio permissions"
            asChild
          >
            <Link to="/settings">
              <AudioLines />
            </Link>
          </Button>
        </div>
        <span className="metadata">
          {voiceActive
            ? "Tap to end the voice session"
            : state === "listening"
              ? "Tap to end microphone access"
              : "Tap to enable your microphone"}
        </span>
        {error && <Notice>{error}</Notice>}
      </div>
      <div className="voice-details">
        <div>
          <span className="metadata">Input</span>
          <strong>Browser microphone</strong>
        </div>
        <div>
          <span className="metadata">Permission</span>
          <strong>{permission}</strong>
        </div>
        <div>
          <span className="metadata">Processing / speaking</span>
          <strong>{speechAvailable ? "Connected" : "Requires speech integration"}</strong>
        </div>
      </div>
    </div>
  );
}
export function VisionScreen() {
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const busy = useRef(false);
  const objectUrl = useRef("");
  const abort = useRef<AbortController | null>(null);
  const [state, setState] = useState<
    "idle" | "loading" | "active" | "captured" | "analyzing" | "error"
  >("idle");
  const [error, setError] = useState("");
  const [image, setImage] = useState("");
  const [blob, setBlob] = useState<Blob | null>(null);
  const [result, setResult] = useState("");
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      abort.current?.abort();
    };
  }, []);
  const start = async () => {
    if (busy.current) return;
    busy.current = true;
    setState("loading");
    setError("");
    setImage("");
    setResult("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unavailable");
      stream.current?.getTracks().forEach((t) => t.stop());
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      if (video.current) {
        video.current.srcObject = media;
        await video.current.play();
      }
      setState("active");
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      if (mounted.current) {
        setState("error");
        setError(mediaError(e, "Camera"));
      }
    } finally {
      busy.current = false;
    }
  };
  const stop = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setState("idle");
  };
  const capture = () => {
    const v = video.current;
    if (!v || !v.videoWidth) {
      setError("The camera is not ready yet.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob(
      (value) => {
        if (!value || !mounted.current) return;
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = URL.createObjectURL(value);
        setBlob(value);
        setImage(objectUrl.current);
        stop();
        setState("captured");
      },
      "image/jpeg",
      0.9,
    );
  };
  const analyze = async () => {
    const provider = getIntegrations().analyzeImage;
    if (!provider || !blob) {
      setError("Image analysis requires a vision provider. No analysis has been performed.");
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setState("analyzing");
    setError("");
    try {
      const text = await provider(blob, controller.signal);
      if (!controller.signal.aborted) setResult(text);
    } catch {
      if (!controller.signal.aborted) setError("Image analysis failed. Try again.");
    } finally {
      if (mounted.current) setState("captured");
    }
  };
  return (
    <div className="screen-page">
      <PageHeading
        eyebrow="A new perspective"
        title="Vision"
        description="Bring the world into your workspace."
        action={<Status warning>Analysis requires setup</Status>}
      />
      <div className="vision-layout">
        <div className="camera-workspace">
          <div className="camera-preview">
            <video
              ref={video}
              muted
              playsInline
              className={state === "active" ? "camera-video active" : "camera-video"}
            />
            {image && <img src={image} alt="Your camera capture" className="captured-image" />}
            {!image && state !== "active" && (
              <div className="camera-empty">
                <div className="camera-reticle">
                  <CameraOff />
                </div>
                <h2>{state === "loading" ? "Opening your camera…" : "A closer look."}</h2>
                <p>Your camera stays off until you choose to enable it.</p>
                {state === "loading" ? (
                  <Skeleton className="h-9 w-40" />
                ) : (
                  <Button onClick={() => void start()}>
                    <Camera />
                    Enable camera
                  </Button>
                )}
              </div>
            )}
            <span className="viewfinder-corner corner-tl" />
            <span className="viewfinder-corner corner-tr" />
            <span className="viewfinder-corner corner-bl" />
            <span className="viewfinder-corner corner-br" />
            <span className="camera-preview-label">
              {state === "active" ? "Live camera" : image ? "Captured locally" : "Camera standby"}
            </span>
          </div>
          <div className="camera-controls">
            <span className="metadata">
              {image ? "Image held for this visit only" : "Browser camera · No automatic upload"}
            </span>
            <div className="flex gap-2">
              {state === "active" ? (
                <>
                  <Button variant="outline" onClick={stop}>
                    <Square />
                    Stop camera
                  </Button>
                  <Button onClick={capture}>
                    <Camera />
                    Capture
                  </Button>
                </>
              ) : image ? (
                <>
                  <Button variant="outline" onClick={() => void start()}>
                    <RefreshCw />
                    Retake
                  </Button>
                  <Button asChild variant="outline">
                    <a href={image} download="lumo-capture.jpg">
                      <Download />
                      Save
                    </a>
                  </Button>
                </>
              ) : null}
            </div>
          </div>
          {error && <Notice>{error}</Notice>}
        </div>
        <aside className="vision-results">
          <div className="section-heading">
            <h2>Observations</h2>
            <ScanLine size={17} />
          </div>
          {state === "analyzing" ? (
            <div className="response-loading" role="status">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <span>Analyzing with your provider…</span>
            </div>
          ) : result ? (
            <p className="analysis-result">{result}</p>
          ) : (
            <div className="results-empty">
              <ScanLine />
              <h3>{image ? "Your image is ready." : "Another way to see."}</h3>
              <p>
                {image
                  ? "Connect a vision provider for image insights. No objects have been identified."
                  : "Capture an image to begin. Insights appear only after a real provider analyzes it."}
              </p>
            </div>
          )}
          {image && (
            <Button
              variant="outline"
              disabled={state === "analyzing"}
              onClick={() => void analyze()}
            >
              <ScanLine />
              Analyze image
            </Button>
          )}
          <div className="privacy-caption">
            Camera access is browser-based. Native Android camera integration is not connected.
          </div>
        </aside>
      </div>
    </div>
  );
}
