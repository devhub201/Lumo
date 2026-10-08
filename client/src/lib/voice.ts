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
  start: () => void;
  stop: () => void;
  abort: () => void;
};
export const createVoiceInput = () => {
  let recognition: Recognition | null = null;
  return {
    startListening: async (
      onResult: (text: string) => void,
      onError?: (error: VoiceError) => void
    ) => {
      const Speech =
        (globalThis as any).SpeechRecognition ||
        (globalThis as any).webkitSpeechRecognition;
      if (!Speech)
        throw new VoiceError(
          "unsupported",
          "Voice input is not supported in this browser. Please use text."
        );
      if (navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          stream.getTracks().forEach(track => track.stop());
        } catch {
          throw new VoiceError(
            "permission_denied",
            "Microphone permission was not granted. Text mode remains available."
          );
        }
      }
      const current = new Speech() as Recognition;
      recognition = current;
      current.lang = "en-IN";
      current.continuous = false;
      current.interimResults = false;
      current.onresult = (event: any) =>
        onResult(
          Array.from(event.results as any)
            .map((r: any) => r[0]?.transcript || "")
            .join(" ")
            .trim()
        );
      current.onerror = (event: any) => {
        recognition = null;
        onError?.(
          new VoiceError(
            event.error === "not-allowed"
              ? "permission_denied"
              : "microphone_error",
            event.error || "Microphone input failed."
          )
        );
      };
      current.onend = () => {
        recognition = null;
      };
      current.start();
    },
    stopListening: () => {
      const current = recognition;
      recognition = null;
      current?.stop();
    },
    cancel: () => {
      const current = recognition;
      recognition = null;
      current?.abort();
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
