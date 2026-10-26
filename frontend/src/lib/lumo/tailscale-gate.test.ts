import { describe, expect, it } from "vitest";
import { matchesTailscaleOwner } from "./tailscale-gate";

describe("Tailscale-only access gate", () => {
  it("allows the exact configured Tailscale owner identity", () => {
    const headers = new Headers({ "Tailscale-User-Login": "FactMindES1@gmail.com" });
    expect(matchesTailscaleOwner(headers, true, "factmindes1@gmail.com")).toBe(true);
  });

  it("rejects absent, mismatched, or unconfigured identities in private mode", () => {
    expect(matchesTailscaleOwner(new Headers(), true, "factmindes1@gmail.com")).toBe(false);
    expect(
      matchesTailscaleOwner(
        new Headers({ "Tailscale-User-Login": "other@example.com" }),
        true,
        "factmindes1@gmail.com",
      ),
    ).toBe(false);
    expect(
      matchesTailscaleOwner(
        new Headers({ "Tailscale-User-Login": "factmindes1@gmail.com" }),
        true,
        undefined,
      ),
    ).toBe(false);
  });

  it("does not change development behavior when private mode is disabled", () => {
    expect(matchesTailscaleOwner(new Headers(), false, undefined)).toBe(true);
  });
});
