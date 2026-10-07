import { describe, expect, it } from "vitest";
import { LumoError, toPublicError } from "./errors";

describe("LUMO error boundaries", () => {
  it("maps a domain error to a retry-friendly user message", () => {
    const safe = toPublicError(
      new LumoError(
        "provider_timeout",
        "upstream token=secret timed out",
        "LUMO timed out.",
        true
      )
    );
    expect(safe).toEqual({
      code: "provider_timeout",
      message: "LUMO timed out.",
      retryable: true,
    });
    expect(JSON.stringify(safe)).not.toContain("secret");
  });

  it("hides unexpected implementation details", () => {
    const safe = toPublicError(new Error("DATABASE_URL=mysql://private"));
    expect(safe.message).toContain("could not complete");
    expect(JSON.stringify(safe)).not.toContain("mysql://private");
  });
});
