export type VoiceState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export class VoiceError extends Error {
  constructor(
    public code:
      | "unsupported"
      | "permission_denied"
      | "microphone_error"
      | "speech_error"
      | "empty_transcript"
      | "timeout"
      | "cancelled",
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
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const VOICE_TIMEOUT_MS = 30_000;

export const createVoiceInput = () => {
  let recognition: Recognition | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let endedByUser = false;
  let receivedResult = false;
  let failed = false;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const finish = (state: VoiceState, onState?: (state: VoiceState) => void) => {
    clearTimer();
    recognition = null;
    onState?.(state);
  };

  return {
    startListening: async (
      onResult: (text: string) => void,
      onError?: (error: VoiceError) => void,
      onState?: (state: VoiceState) => void
    ) => {
      const Speech =
        (globalThis as any).SpeechRecognition ||
        (globalThis as any).webkitSpeechRecognition;
      if (!Speech)
        throw new VoiceError(
          "unsupported",
          "Voice input is not supported in this browser. Please use text."
        );
      if (typeof navigator === "undefined")
        throw new VoiceError(
          "unsupported",
          "Voice input is not available in this environment. Please use text."
        );

      const mediaDevices = navigator.mediaDevices;
      if (!mediaDevices?.getUserMedia)
        throw new VoiceError(
          "unsupported",
          "Microphone access is not supported in this browser. Please use text."
        );
      try {
        const stream = await mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
      } catch (error) {
        throw new VoiceError(
          error instanceof DOMException &&
            (error.name === "NotAllowedError" || error.name === "SecurityError")
            ? "permission_denied"
            : "microphone_error",
          "Microphone access failed. Text mode remains available."
        );
      }

      recognition?.abort();
      clearTimer();
      endedByUser = false;
      receivedResult = false;
      failed = false;
      const current = new Speech() as Recognition;
      recognition = current;
      current.lang = "en-IN";
      current.continuous = false;
      current.interimResults = false;
      current.onresult = (event: any) => {
        const text = Array.from(event.results as any)
          .map((result: any) => result[0]?.transcript || "")
          .join(" ")
          .trim();
        if (!text) return;
        receivedResult = true;
        onState?.("processing");
        onResult(text);
      };
      current.onerror = (event: any) => {
        const code = event.error === "not-allowed" ? "permission_denied" : "microphone_error";
        failed = true;
        finish("error", onState);
        onError?.(
          new VoiceError(
            code,
            event.error === "no-speech"
              ? "No speech was detected. Please try again."
              : "Microphone input failed. Text mode remains available."
          )
        );
      };
      current.onend = () => {
        const wasEmpty = !receivedResult && !endedByUser && !failed;
        if (wasEmpty) finish("error", onState);
        else {
          clearTimer();
          recognition = null;
        }
        if (wasEmpty)
          onError?.(
            new VoiceError(
              "empty_transcript",
              "No speech was detected. Please try again."
            )
          );
      };
      onState?.("listening");
      try {
        current.start();
      } catch {
        finish("error", onState);
        throw new VoiceError("microphone_error", "Voice input could not start.");
      }
      timer = setTimeout(() => {
        endedByUser = true;
        const active = recognition;
        recognition = null;
        clearTimer();
        active?.abort();
        onState?.("error");
        onError?.(
          new VoiceError("timeout", "Voice input timed out. Please try again.")
        );
      }, VOICE_TIMEOUT_MS);
    },
    stopListening: () => {
      const current = recognition;
      endedByUser = true;
      clearTimer();
      recognition = null;
      current?.stop();
    },
    cancel: () => {
      const current = recognition;
      endedByUser = true;
      clearTimer();
      recognition = null;
      current?.abort();
    },
  };
};

export const createSpeechOutput = () => {
  let utterance: SpeechSynthesisUtterance | null = null;
  let resolveActive: (() => void) | null = null;

  return {
    speak: async (text: string, onComplete?: () => void) => {
      const synth = (globalThis as any).speechSynthesis as SpeechSynthesis | undefined;
      const Utterance = (globalThis as any).SpeechSynthesisUtterance as
        | typeof SpeechSynthesisUtterance
        | undefined;
      if (!synth || !Utterance)
        throw new VoiceError(
          "unsupported",
          "Speech output is not supported; text response remains available."
        );
      if (!text.trim())
        throw new VoiceError("speech_error", "There is no response to speak.");

      resolveActive?.();
      resolveActive = null;
      utterance = null;
      synth.cancel();
      await new Promise<void>((resolve, reject) => {
        const current = new Utterance(text);
        utterance = current;
        resolveActive = resolve;
        current.onend = () => {
          if (utterance !== current) return;
          utterance = null;
          resolveActive = null;
          onComplete?.();
          resolve();
        };
        current.onerror = () => {
          if (utterance !== current) return;
          utterance = null;
          resolveActive = null;
          reject(
            new VoiceError(
              "speech_error",
              "Speech playback failed; text response remains available."
            )
          );
        };
        synth.speak(current);
      });
    },
    pause: () => (globalThis as any).speechSynthesis?.pause(),
    resume: () => (globalThis as any).speechSynthesis?.resume(),
    stop: () => {
      (globalThis as any).speechSynthesis?.cancel();
      utterance = null;
      resolveActive?.();
      resolveActive = null;
    },
  };
};
