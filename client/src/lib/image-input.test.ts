import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageInputError, readImageFile } from "./image-input";

const originalReader = (globalThis as any).FileReader;

afterEach(() => {
  (globalThis as any).FileReader = originalReader;
});

describe("image file input boundary", () => {
  it("rejects unsupported types and oversized files before reading", async () => {
    await expect(
      readImageFile(new File(["x"], "payload.txt", { type: "text/plain" }))
    ).rejects.toMatchObject({ code: "unsupported_type" });
    await expect(
      readImageFile(
        new File([new Uint8Array(5_000_001)], "large.png", { type: "image/png" })
      )
    ).rejects.toMatchObject({ code: "file_too_large" });
  });

  it("returns a validated data URL for a supported image", async () => {
    class FakeReader {
      result = "data:image/png;base64,aW1hZ2U=";
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      readAsDataURL = vi.fn(() => this.onload?.());
    }
    (globalThis as any).FileReader = FakeReader;
    const result = await readImageFile(
      new File(["image"], "photo.png", { type: "image/png" })
    );
    expect(result).toMatchObject({
      dataUrl: "data:image/png;base64,aW1hZ2U=",
      mimeType: "image/png",
    });
  });

  it("reports unsupported file reading when FileReader is unavailable", async () => {
    (globalThis as any).FileReader = undefined;
    await expect(
      readImageFile(new File(["image"], "photo.png", { type: "image/png" }))
    ).rejects.toEqual(expect.objectContaining({
      code: "read_failed",
    } satisfies Partial<ImageInputError>));
  });
});
