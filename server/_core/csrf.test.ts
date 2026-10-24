import { describe, expect, it } from "vitest";
import { isTrustedProductionMutationOrigin } from "./csrf";

describe("production mutation Origin policy", () => {
  it("accepts the configured HTTPS origin with canonical URL normalization", () => {
    expect(
      isTrustedProductionMutationOrigin(
        "https://lumo.example",
        "https://lumo.example/"
      )
    ).toBe(true);
    expect(
      isTrustedProductionMutationOrigin(
        "https://LUMO.example:443",
        "https://lumo.example"
      )
    ).toBe(true);
  });

  it("rejects cross-origin, absent, null, malformed, and non-HTTPS origins", () => {
    for (const origin of [
      "https://attacker.example",
      "https://lumo.example.attacker.example",
      undefined,
      "null",
      "not a URL",
      "http://lumo.example",
      "https://lumo.example/path",
    ]) {
      expect(
        isTrustedProductionMutationOrigin(origin, "https://lumo.example")
      ).toBe(false);
    }
    expect(
      isTrustedProductionMutationOrigin("https://lumo.example", undefined)
    ).toBe(false);
    expect(
      isTrustedProductionMutationOrigin(
        "https://lumo.example",
        "http://lumo.example"
      )
    ).toBe(false);
  });
});
