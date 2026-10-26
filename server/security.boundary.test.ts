import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { resolveOwnerKey } from "./_core/owner";
import { PermissionManager } from "./lumo/security/permissions";
import { BrowserWorkspace } from "./lumo/browser/workspace";
import { createCodeWorkspace } from "./lumo/coding/workspace";

const user = (id: number): NonNullable<TrpcContext["user"]> => ({
  id,
  openId: `user-${id}`,
  name: `User ${id}`,
  email: `user-${id}@example.test`,
  loginMethod: "test",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
});

const context = (currentUser: TrpcContext["user"]): TrpcContext => ({
  user: currentUser,
  req: { headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});

describe("Priority 0 owner security boundary", () => {
  const previousOwnerOpenId = process.env.OWNER_OPEN_ID;

  beforeEach(() => {
    process.env.OWNER_OPEN_ID = "user-7";
  });

  afterEach(() => {
    if (previousOwnerOpenId === undefined) delete process.env.OWNER_OPEN_ID;
    else process.env.OWNER_OPEN_ID = previousOwnerOpenId;
  });

  it("rejects unauthenticated access to private LUMO procedures", async () => {
    const caller = appRouter.createCaller(context(null));
    await expect(caller.lumo.diagnostics()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("derives distinct owner keys from authenticated internal user ids", async () => {
    expect(resolveOwnerKey(user(7))).toBe("user:7");
    expect(resolveOwnerKey(user(8))).toBe("user:8");

    const first = await appRouter
      .createCaller(context(user(7)))
      .lumo.diagnostics();
    expect(first.ownerKey).toBe("user:7");
    await expect(
      appRouter.createCaller(context(user(8))).lumo.diagnostics()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects service-principal and malformed identities", () => {
    expect(() =>
      resolveOwnerKey({ ...user(1), id: -1, isCron: true, taskUid: "task-1" })
    ).toThrow("supported authenticated user identity");
    expect(() => resolveOwnerKey({ ...user(1), id: 0 })).toThrow(
      "supported authenticated user identity"
    );
  });

  it("rejects forged or nested client owner identifiers before procedure parsing", async () => {
    const caller = appRouter.createCaller(context(user(7)));
    await expect(
      caller.lumo.diagnostics({ ownerKey: "user:8" } as never)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.lumo.diagnostics({ nested: { ownerId: 8 } } as never)
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("fails closed when the private owner is not configured", async () => {
    delete process.env.OWNER_OPEN_ID;
    await expect(
      appRouter.createCaller(context(user(7))).lumo.diagnostics()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("denies cross-user browser sessions and coding projects below the router", async () => {
    const permissions = new PermissionManager();
    permissions.grant("user:7", "web_access");
    permissions.grant("user:8", "web_access");
    permissions.grant("user:7", "files");
    const browser = new BrowserWorkspace(permissions, {
      fetch: async url => ({ status: 200, body: `<title>${url}</title>ok` }),
    });
    const session = browser.createSession("user:7");
    await expect(browser.snapshot("user:8", session.id)).rejects.toThrow(
      "ownership mismatch"
    );
    await expect(
      browser.action("user:8", session.id, { type: "extract", id: "action-1" })
    ).rejects.toThrow("ownership mismatch");

    const coding = createCodeWorkspace(permissions);
    const project = await coding.createProject("user:7", "private");
    await expect(
      coding.readFile("user:8", project.id, "README.md")
    ).rejects.toThrow();
  });
});
