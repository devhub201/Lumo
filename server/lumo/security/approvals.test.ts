import { describe, expect, it } from "vitest";
import { ApprovalError, ApprovalService, hashPayload } from "./approvals";
import { AuditLog } from "./audit";
import { requireSensitiveAuthorization } from "./safety";
import { LUMO_LEGACY_OWNER_KEY, ownerKeyForUser } from "./owner";
import { PermissionManager } from "./permissions";
import { ManagedToolPermissions } from "./tool-permissions";

const mail = {
  to: ["a@example.com"],
  subject: "Hi",
  body: "Hello",
  idempotencyKey: "k1",
};

const setup = () => {
  let now = 1_000_000;
  const audit = new AuditLog();
  const service = new ApprovalService({ now: () => now, audit });
  return {
    service,
    audit,
    advance: (ms: number) => {
      now += ms;
    },
  };
};

const expectCode = (fn: () => unknown, code: string) => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ApprovalError);
    expect((error as ApprovalError).code).toBe(code);
    return;
  }
  throw new Error(`expected ApprovalError ${code}`);
};

describe("ApprovalService", () => {
  it("issues a server-built authorization only for an approved, matching approval", () => {
    const { service } = setup();
    const approval = service.request("owner-1", {
      action: "gmail.send",
      summary: "Send email",
      payload: mail,
    });
    service.decide("owner-1", approval.id, "approve");
    const authorization = service.consume(
      "owner-1",
      approval.id,
      "gmail.send",
      mail
    );
    expect(requireSensitiveAuthorization(authorization, "gmail.send")).toBe(true);
  });

  it("rejects a request that was never approved or was denied", () => {
    const { service } = setup();
    const pending = service.request("owner-1", {
      action: "gmail.send",
      summary: "x",
      payload: mail,
    });
    expectCode(
      () => service.consume("owner-1", pending.id, "gmail.send", mail),
      "approval_not_approved"
    );
    service.decide("owner-1", pending.id, "deny");
    expectCode(
      () => service.consume("owner-1", pending.id, "gmail.send", mail),
      "approval_not_approved"
    );
  });

  it("is single use", () => {
    const { service } = setup();
    const approval = service.request("owner-1", {
      action: "gmail.send",
      summary: "x",
      payload: mail,
    });
    service.decide("owner-1", approval.id, "approve");
    service.consume("owner-1", approval.id, "gmail.send", mail);
    expectCode(
      () => service.consume("owner-1", approval.id, "gmail.send", mail),
      "approval_already_used"
    );
  });

  it("is bound to the exact payload (one changed byte invalidates it)", () => {
    const { service } = setup();
    const approval = service.request("owner-1", {
      action: "gmail.send",
      summary: "x",
      payload: mail,
    });
    service.decide("owner-1", approval.id, "approve");
    expectCode(
      () =>
        service.consume("owner-1", approval.id, "gmail.send", {
          ...mail,
          body: "Hello!",
        }),
      "approval_mismatch"
    );
  });

  it("is bound to the action name", () => {
    const { service } = setup();
    const approval = service.request("owner-1", {
      action: "gmail.send",
      summary: "x",
      payload: mail,
    });
    service.decide("owner-1", approval.id, "approve");
    expectCode(
      () => service.consume("owner-1", approval.id, "runtime_command", mail),
      "approval_mismatch"
    );
  });

  it("cannot be used or decided by a different owner, and does not leak existence", () => {
    const { service } = setup();
    const approval = service.request("owner-1", {
      action: "gmail.send",
      summary: "x",
      payload: mail,
    });
    expectCode(
      () => service.decide("owner-2", approval.id, "approve"),
      "approval_invalid"
    );
    service.decide("owner-1", approval.id, "approve");
    expectCode(
      () => service.consume("owner-2", approval.id, "gmail.send", mail),
      "approval_invalid"
    );
    expectCode(
      () => service.consume("owner-1", "does-not-exist", "gmail.send", mail),
      "approval_invalid"
    );
  });

  it("expires", () => {
    const { service, advance } = setup();
    const approval = service.request("owner-1", {
      action: "gmail.send",
      summary: "x",
      payload: mail,
    });
    service.decide("owner-1", approval.id, "approve");
    advance(6 * 60_000);
    expectCode(
      () => service.consume("owner-1", approval.id, "gmail.send", mail),
      "approval_expired"
    );
  });

  it("limits open approvals per owner", () => {
    const service = new ApprovalService({ maxPerOwner: 2, audit: new AuditLog() });
    for (let i = 0; i < 2; i += 1)
      service.request("owner-1", { action: "gmail.send", summary: "x", payload: { i } });
    expectCode(
      () =>
        service.request("owner-1", {
          action: "gmail.send",
          summary: "x",
          payload: { i: 3 },
        }),
      "approval_limit"
    );
  });

  it("records metadata-only audit events without payload content", () => {
    const { service, audit } = setup();
    const approval = service.request("owner-1", {
      action: "gmail.send",
      summary: "x",
      payload: mail,
    });
    service.decide("owner-1", approval.id, "approve");
    service.consume("owner-1", approval.id, "gmail.send", mail);
    const types = audit.recent("owner-1").map(event => event.type);
    expect(types).toEqual([
      "approval.consumed",
      "approval.approved",
      "approval.requested",
    ]);
    expect(JSON.stringify(audit.recent("owner-1"))).not.toContain("Hello");
    expect(audit.recent("owner-2")).toEqual([]);
  });

  it("hashes independent of key order", () => {
    expect(hashPayload("a", { x: 1, y: [1, { b: 2, a: 1 }] })).toBe(
      hashPayload("a", { y: [1, { a: 1, b: 2 }], x: 1 })
    );
    expect(hashPayload("a", { x: 1 })).not.toBe(hashPayload("b", { x: 1 }));
  });
});

describe("owner identity", () => {
  it("derives owner keys from the session user, never a fixed value", () => {
    expect(ownerKeyForUser({ id: 7, openId: "o-7" }, "")).toBe("user_7");
    expect(ownerKeyForUser({ id: 8, openId: "o-8" }, "")).toBe("user_8");
  });

  it("maps only the configured legacy owner to the legacy key", () => {
    expect(ownerKeyForUser({ id: 1, openId: "me" }, "me")).toBe(
      LUMO_LEGACY_OWNER_KEY
    );
    expect(ownerKeyForUser({ id: 2, openId: "someone-else" }, "me")).toBe(
      "user_2"
    );
  });

  it("refuses to derive a key from an invalid user", () => {
    expect(() => ownerKeyForUser({ id: 0, openId: "x" }, "")).toThrow();
  });
});

describe("default tool permissions", () => {
  it("apply to any owner without a hardcoded owner grant, and explicit deny wins", () => {
    const manager = new PermissionManager();
    const permissions = new ManagedToolPermissions(manager, ["network", "files"]);
    expect(manager.evaluate("user_5", "web_access").allowed).toBe(true);
    expect(manager.evaluate("user_5", "terminal_runtime").allowed).toBe(false);
    manager.deny("user_5", "web_access", "user turned it off");
    expect(manager.evaluate("user_5", "web_access").allowed).toBe(false);
    expect(permissions).toBeDefined();
  });
});
