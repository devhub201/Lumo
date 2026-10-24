import { afterEach, describe, expect, it, vi } from "vitest";
import { createSpeechOutput, createVoiceInput } from "./voice";

const originalNavigator = globalThis.navigator;
const originalSpeech = (globalThis as any).SpeechRecognition;
const originalWebkitSpeech = (globalThis as any).webkitSpeechRecognition;
const originalSynth = (globalThis as any).speechSynthesis;
const originalUtterance = (globalThis as any).SpeechSynthesisUtterance;

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
  (globalThis as any).SpeechRecognition = originalSpeech;
  (globalThis as any).webkitSpeechRecognition = originalWebkitSpeech;
  (globalThis as any).speechSynthesis = originalSynth;
  (globalThis as any).SpeechSynthesisUtterance = originalUtterance;
});

describe("voice capability boundary", () => {
  it("reports unsupported recognition without claiming it started", async () => {
    (globalThis as any).SpeechRecognition = undefined;
    await expect(createVoiceInput().startListening(() => undefined)).rejects.toMatchObject({
      code: "unsupported",
    });
  });

  it("reports an empty transcript instead of routing an empty request", async () => {
    let instance: any;
    class FakeRecognition {
      start = vi.fn();
      stop = vi.fn();
      abort = vi.fn();
      constructor() {
        instance = this;
      }
    }
    (globalThis as any).SpeechRecognition = FakeRecognition;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { mediaDevices: { getUserMedia: vi.fn(async () => ({ getTracks: () => [] })) } },
    });
    const onResult = vi.fn();
    const onError = vi.fn();
    const input = createVoiceInput();
    await input.startListening(onResult, onError);
    instance.onend();
    expect(onResult).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: "empty_transcript" }));
  });

  it("stops speech playback cleanly without leaving the speak promise pending", async () => {
    let spoken: any;
    class FakeUtterance {
      text: string;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(text: string) {
        this.text = text;
        spoken = this;
      }
    }
    const synth = {
      speak: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    };
    (globalThis as any).SpeechSynthesisUtterance = FakeUtterance;
    (globalThis as any).speechSynthesis = synth;
    const output = createSpeechOutput();
    let completed = false;
    const pending = output.speak("hello", () => {
      completed = true;
    });
    output.stop();
    await expect(pending).resolves.toBeUndefined();
    expect(synth.cancel).toHaveBeenCalled();
    expect(completed).toBe(false);
    expect(spoken.text).toBe("hello");
  });
});
