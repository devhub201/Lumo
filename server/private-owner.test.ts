import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import { registerOAuthRoutes } from "./_core/oauth";
import { sdk } from "./_core/sdk";
import * as db from "./db";
import type { TrpcContext } from "./_core/context";
import {
  COOKIE_NAME,
  encodeOAuthState,
  OAUTH_STATE_COOKIE,
} from "../shared/const";

type TestUser = NonNullable<TrpcContext["user"]>;

const user = (id: number, openId = `user-${id}`): TestUser => ({
  id,
  openId,
  name: `User ${id}`,
  email: `${openId}@example.test`,
  loginMethod: "test",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
});

const context = (currentUser: TestUser | null): TrpcContext => ({
  user: currentUser,
  req: { headers: {} } as TrpcContext["req"],
  res: {} as TrpcContext["res"],
});

describe("private owner authorization", () => {
  const previousOwnerOpenId = process.env.OWNER_OPEN_ID;

  beforeEach(() => {
    process.env.OWNER_OPEN_ID = "user-1";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousOwnerOpenId === undefined) delete process.env.OWNER_OPEN_ID;
    else process.env.OWNER_OPEN_ID = previousOwnerOpenId;
  });

  it("allows the configured owner and rejects another authenticated identity", async () => {
    await expect(
      appRouter.createCaller(context(user(1))).lumo.diagnostics()
    ).resolves.toMatchObject({ ownerKey: "user:1" });
    await expect(
      appRouter.createCaller(context(user(2))).lumo.diagnostics()
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects an unauthorized session before database user synchronization", async () => {
    vi.spyOn(sdk, "verifySession").mockResolvedValue({
      openId: "user-2",
      appId: "test-app",
      name: "Unauthorized",
    });
    const lookup = vi.spyOn(db, "getUserByOpenId");

    await expect(
      sdk.authenticateRequest({
        path: "/api/trpc",
        headers: { cookie: `${COOKIE_NAME}=session-token` },
      } as never)
    ).rejects.toThrow("Private owner access is not authorized");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("rejects a non-owner Manus OAuth callback before creating a user or session", async () => {
    const handlers = new Map<
      string,
      (req: any, res: any) => Promise<void> | void
    >();
    const app = {
      get(path: string, handler: (req: any, res: any) => Promise<void> | void) {
        handlers.set(path, handler);
      },
      post(
        path: string,
        handler: (req: any, res: any) => Promise<void> | void
      ) {
        handlers.set(path, handler);
      },
    };
    registerOAuthRoutes(app as never);

    vi.spyOn(sdk, "exchangeCodeForToken").mockResolvedValue({
      accessToken: "provider-access-token",
    } as never);
    vi.spyOn(sdk, "getUserInfo").mockResolvedValue({
      openId: "user-2",
      name: "Unauthorized",
      email: "unauthorized@example.test",
    } as never);
    const upsert = vi.spyOn(db, "upsertUser");
    const createSession = vi.spyOn(sdk, "createSessionToken");
    const response = {
      statusCode: 200,
      body: undefined as unknown,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(value: unknown) {
        this.body = value;
        return this;
      },
      clearCookie() {},
      cookie() {},
      redirect() {},
    };
    const state = encodeOAuthState({
      redirectUri: "https://lumo.test/api/oauth/callback",
      nonce: "nonce",
    });

    await handlers.get("/api/oauth/callback")?.(
      {
        query: { code: "authorization-code", state },
        headers: { cookie: `${OAUTH_STATE_COOKIE}=nonce` },
      },
      response
    );

    expect(response.statusCode).toBe(403);
    expect(response.body).toEqual({ error: "private_owner_only" });
    expect(upsert).not.toHaveBeenCalled();
    expect(createSession).not.toHaveBeenCalled();
  });
});
