import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  deleteLocalModel,
  downloadLocalModel,
  getLocalAiStatus,
  isOnDeviceAiNative,
  listenToLocalModelDownload,
  type LocalAiProgress,
  type LocalAiStatus,
} from "@/lib/lumo/local-ai";

const emptyStatus: LocalAiStatus = {
  available: false,
  downloaded: false,
  modelName: "",
  sizeBytes: 0,
  downloadInProgress: false,
  engineInitialized: false,
  license: "",
};

function formatMiB(bytes: number) {
  return `${Math.round(bytes / (1024 * 1024))} MiB`;
}

export function LocalAiSettings() {
  const native = isOnDeviceAiNative();
  const [status, setStatus] = useState(emptyStatus);
  const [progress, setProgress] = useState<LocalAiProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!native) return;
    let active = true;
    let listener: { remove: () => Promise<void> } | undefined;
    void getLocalAiStatus()
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : "Could not read local-model status.");
      });
    void listenToLocalModelDownload((value) => {
      if (!active) return;
      setProgress(value);
      setStatus((current) => ({ ...current, downloadInProgress: true }));
    })
      .then((handle) => {
        if (active) listener = handle;
        else void handle.remove();
      })
      .catch(() => {});
    return () => {
      active = false;
      void listener?.remove();
    };
  }, [native]);

  const download = async () => {
    setBusy(true);
    setError("");
    setProgress({ receivedBytes: 0, totalBytes: status.sizeBytes, percent: 0 });
    try {
      const next = await downloadLocalModel();
      setStatus(next);
      setProgress(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The model download failed. Check Wi-Fi and try again.",
      );
      const next = await getLocalAiStatus().catch(() => emptyStatus);
      setStatus(next);
    } finally {
      setBusy(false);
    }
  };

  const removeModel = async () => {
    setBusy(true);
    setError("");
    try {
      setStatus(await deleteLocalModel());
      setProgress(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The model could not be removed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section local-ai-settings">
      <div className="settings-section-title">
        <Sparkles aria-hidden="true" />
        <h2>On-device AI</h2>
      </div>
      {!native ? (
        <div className="setting-row">
          <span>
            <strong>Android app required</strong>
            <small>
              Local inference runs in the Android APK. The browser preview does not run a model.
            </small>
          </span>
        </div>
      ) : (
        <>
          <div className="setting-row">
            <span>
              <strong>{status.modelName || "Google AI Edge · Qwen3 0.6B"}</strong>
              <small>
                Download once over Wi-Fi (~475 MiB). Afterward, prompts and answers stay on this
                phone and chat works offline. No OpenAI key, account, VPS, or AI API billing.
              </small>
            </span>
            <span className="preview-chip">
              {status.downloaded ? "Installed" : "Not installed"}
            </span>
          </div>
          {progress && (
            <div className="local-ai-download-progress" role="status" aria-live="polite">
              <div
                className="local-ai-progress-track"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.percent}
                role="progressbar"
              >
                <span style={{ width: `${progress.percent}%` }} />
              </div>
              <small>
                Downloading model: {progress.percent}% · {formatMiB(progress.receivedBytes)} of{" "}
                {formatMiB(progress.totalBytes || status.sizeBytes)}
              </small>
            </div>
          )}
          <div className="local-ai-actions">
            {!status.downloaded ? (
              <Button type="button" disabled={busy} onClick={() => void download()}>
                {busy ? "Downloading model…" : "Download model"}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => void removeModel()}
              >
                {busy ? "Please wait…" : "Delete model to free storage"}
              </Button>
            )}
            {status.downloaded && <span className="preview-chip">Ready · Apache-2.0</span>}
          </div>
          <p className="metadata local-ai-privacy">
            First download needs an internet connection. LUMO verifies the file checksum before use.
            The model runs on the phone's CPU; speed and battery use depend on device conditions.
            The small local model is less capable than a large cloud model and may make mistakes.
          </p>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </section>
  );
}
