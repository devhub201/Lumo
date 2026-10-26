import { describe, expect, it } from "vitest";
import {
  InMemorySensitiveGrantStore,
  SensitiveGrantService,
} from "./grants";

describe("server-issued sensitive-action grants", () => {
  it("binds grants to owner, action, and exact resource", async () => {
    const service = new SensitiveGrantService(new InMemorySensitiveGrantStore());
    const issued = await service.issue("user:1", "runtime_command", "local-mock");
    expect(
      await service.consume("user:2", issued, "runtime_command", "local-mock")
    ).toBe(false);
    expect(
      await service.consume("user:1", issued, "gmail.send", "local-mock")
    ).toBe(false);
    expect(
      await service.consume("user:1", issued, "runtime_command", "other")
    ).toBe(false);
  });

  it("consumes a valid grant exactly once", async () => {
    const service = new SensitiveGrantService(new InMemorySensitiveGrantStore());
    const issued = await service.issue("user:1", "delete_workspace_file", "p:f");
    expect(
      await service.consume("user:1", issued, "delete_workspace_file", "p:f")
    ).toBe(true);
    expect(
      await service.consume("user:1", issued, "delete_workspace_file", "p:f")
    ).toBe(false);
  });

  it("rejects expired grants", async () => {
    let now = new Date("2026-10-12T00:00:00.000Z");
    const service = new SensitiveGrantService(
      new InMemorySensitiveGrantStore(),
      () => now,
      1000
    );
    const issued = await service.issue("user:1", "runtime_command", "local-mock");
    now = new Date(now.getTime() + 1001);
    expect(
      await service.consume("user:1", issued, "runtime_command", "local-mock")
    ).toBe(false);
  });

  it("rejects legacy self-asserted authorized=true payloads", async () => {
    const service = new SensitiveGrantService(new InMemorySensitiveGrantStore());
    expect(
      await service.consume(
        "user:1",
        { authorized: true, action: "runtime_command" } as never,
        "runtime_command",
        "local-mock"
      )
    ).toBe(false);
  });
});
