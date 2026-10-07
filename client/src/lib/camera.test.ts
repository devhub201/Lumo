import { describe, expect, it } from "vitest";
import { captureCameraFrame } from "./camera";

describe("camera capability boundary", () => {
  it("rejects unsupported non-browser environments without attempting access", async () => {
    await expect(captureCameraFrame()).rejects.toMatchObject({
      code: "unsupported",
    });
  });
});
