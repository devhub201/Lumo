export class VoiceError extends Error {
  constructor(
    public code:
      | "unsupported"
      | "permission_denied"
      | "microphone_error"
      | "speech_error",
    message: string
  ) {
    super(message);
    this.name = "VoiceError";
  }
}
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

export type VoiceListenOptions = {
  /** Keep capturing after a result instead of stopping after one phrase. */
  continuous?: boolean;
  /** Surface partial (not-yet-final) transcripts, for live captions. */
  interimResults?: boolean;
  onInterim?: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (error: VoiceError) => void;
  /** Fires whenever the underlying recognizer actually starts/stops capturing audio. */
  onStateChange?: (state: "listening" | "stopped") => void;
};

/**
 * Errors the browser throws when recognition is restarted immediately,
 * or when it times out from silence — not real failures for an
 * always-on session, so they're swallowed and the session is restarted
 * instead of being surfaced to the user as a microphone error.
 */
const RECOVERABLE_ERRORS = new Set(["no-speech", "aborted"]);

export const createVoiceInput = () => {
  let recognition: Recognition | null = null;
  let muted = true;
  let destroyed = false;
  let activeOptions: VoiceListenOptions | null = null;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  const clearRestart = () => {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
  };

  const spawn = (options: VoiceListenOptions) => {
    const Speech =
      (globalThis as any).SpeechRecognition ||
      (globalThis as any).webkitSpeechRecognition;
    if (!Speech) {
      options.onError?.(
        new VoiceError(
          "unsupported",
          "Always-on voice isn't supported in this browser."
        )
      );
      return;
    }
    const current = new Speech() as Recognition;
    recognition = current;
    current.lang = "en-IN";
    current.continuous = options.continuous ?? true;
    current.interimResults = options.interimResults ?? true;
    current.onstart = () => options.onStateChange?.("listening");
    current.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = (result[0]?.transcript || "").trim();
        if (!text) continue;
        if (result.isFinal) options.onFinal(text);
        else options.onInterim?.(text);
      }
    };
    current.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        muted = true;
        recognition = null;
        options.onStateChange?.("stopped");
        options.onError?.(
          new VoiceError(
            "permission_denied",
            "Microphone permission was denied. Grant mic access to turn Lumo back on."
          )
        );
        return;
      }
      if (!RECOVERABLE_ERRORS.has(event.error)) {
        options.onError?.(
          new VoiceError(
            "microphone_error",
            event.error || "Microphone input failed."
          )
        );
      }
      // onend fires right after onerror for most browsers; the restart
      // there picks the session back up.
    };
    current.onend = () => {
      recognition = null;
      options.onStateChange?.("stopped");
      if (destroyed || muted) return;
      // The browser auto-stops recognition after a pause of silence even
      // in continuous mode. Restart immediately so the mic is effectively
      // always on for as long as the app is open and not muted.
      clearRestart();
      restartTimer = setTimeout(() => {
        if (!destroyed && !muted) spawn(options);
      }, 250);
    };
    current.start();
  };

  return {
    /** Starts (or resumes) the always-on session. Prompts for mic permission once. */
    start: async (options: VoiceListenOptions) => {
      activeOptions = options;
      if (navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          stream.getTracks().forEach(track => track.stop());
        } catch {
          throw new VoiceError(
            "permission_denied",
            "Microphone permission was not granted."
          );
        }
      }
      destroyed = false;
      muted = false;
      clearRestart();
      spawn(options);
    },
    /** Mutes without tearing down the session's intent to resume. */
    mute: () => {
      muted = true;
      clearRestart();
      recognition?.stop();
    },
    /** Resumes a previously muted session using the last options. */
    unmute: () => {
      if (!activeOptions || destroyed) return;
      muted = false;
      if (!recognition) spawn(activeOptions);
    },
    isMuted: () => muted,
    /** Full teardown — call on unmount. */
    stop: () => {
      destroyed = true;
      muted = true;
      clearRestart();
      recognition?.stop();
      recognition = null;
    },
    cancel: () => {
      destroyed = true;
      muted = true;
      clearRestart();
      recognition?.abort();
      recognition = null;
    },
  };
};

export const createSpeechOutput = () => {
  let utterance: SpeechSynthesisUtterance | null = null;
  return {
    speak: async (text: string, onComplete?: () => void) => {
      if (!(globalThis as any).speechSynthesis)
        throw new VoiceError(
          "unsupported",
          "Speech output is not supported; text response remains available."
        );
      await new Promise<void>((resolve, reject) => {
        utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => {
          onComplete?.();
          resolve();
        };
        utterance.onerror = () =>
          reject(
            new VoiceError(
              "speech_error",
              "Speech playback failed; text response remains available."
            )
          );
        speechSynthesis.speak(utterance);
      });
    },
    pause: () => speechSynthesis?.pause(),
    resume: () => speechSynthesis?.resume(),
    stop: () => {
      speechSynthesis?.cancel();
      utterance = null;
    },
  };
};
