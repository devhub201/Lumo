import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "@shared/const";
import * as db from "../db";
import { sdk } from "./sdk";
import { registerGoogleSignInRoutes } from "./googleAuth";

type Handler = (req: any, res: any) => Promise<void> | void;
const envKeys = [
  "NODE_ENV",
  "GOOGLE_SIGNIN_CLIENT_ID",
  "GOOGLE_SIGNIN_CLIENT_SECRET",
  "GOOGLE_SIGNIN_REDIRECT_URI",
  "OWNER_OPEN_ID",
  "DATABASE_URL",
  "MANUS_PROJECT_ID",
  "MANUS_JWT_SECRET",
  "LUMO_PUBLIC_ORIGIN",
] as const;
const originalEnv = Object.fromEntries(
  envKeys.map(key => [key, process.env[key]])
);

function makeResponse() {
  const cookies = new Map<string, { value: string; options: unknown }>();
  const response: any = {
    statusCode: 200,
    body: undefined,
    redirectTo: undefined,
    cookies,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(value: unknown) {
      this.body = value;
      return this;
    },
    cookie(name: string, value: string, options: unknown) {
      cookies.set(name, { value, options });
      return this;
    },
    clearCookie() {},
    redirect(statusOrUrl: number | string, maybeUrl?: string) {
      this.statusCode = typeof statusOrUrl === "number" ? statusOrUrl : 302;
      this.redirectTo =
        typeof statusOrUrl === "number" ? maybeUrl : statusOrUrl;
      return this;
    },
  };
  return response;
}

function routes() {
  const get = new Map<string, Handler>();
  const post = new Map<string, Handler>();
  registerGoogleSignInRoutes({
    get(path: string, handler: Handler) {
      get.set(path, handler);
    },
    post(path: string, handler: Handler) {
      post.set(path, handler);
    },
  } as never);
  return { get, post };
}

beforeEach(() => {
  process.env.NODE_ENV = "production";
  process.env.GOOGLE_SIGNIN_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_SIGNIN_CLIENT_SECRET = "server-only-google-secret";
  process.env.GOOGLE_SIGNIN_REDIRECT_URI =
    "https://lumo.test/api/auth/google/callback";
  process.env.OWNER_OPEN_ID = "google:owner-subject";
  process.env.DATABASE_URL = "mysql://user:pass@localhost/lumo";
  process.env.MANUS_PROJECT_ID = "lumo-test-project";
  process.env.MANUS_JWT_SECRET = "test-session-secret";
  process.env.LUMO_PUBLIC_ORIGIN = "https://lumo.test";
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of envKeys) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("mobile Google sign-in route handoff", () => {
  it("issues a short-lived PKCE-bound code, sets the app session, and rejects replay", async () => {
    const routeHandlers = routes();
    const verifier = "v".repeat(43);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const startResponse = makeResponse();

    routeHandlers.get.get("/api/auth/google/start")?.(
      {
        query: {
          mobile: "1",
          code_challenge: challenge,
          code_challenge_method: "S256",
        },
        secure: true,
      },
      startResponse
    );

    const stateCookie = startResponse.cookies.get(
      "__Host-lumo-google-signin-state"
    );
    expect(stateCookie).toBeDefined();
    expect(startResponse.statusCode).toBe(302);
    const state = stateCookie?.value;
    if (!state) throw new Error("OAuth state cookie was not created.");

    let fetchCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      fetchCount += 1;
      const body =
        fetchCount === 1
          ? { access_token: "google-access-token" }
          : {
              sub: "owner-subject",
              email: "owner@example.test",
              email_verified: true,
              name: "LUMO Owner",
            };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const upsert = vi
      .spyOn(db, "upsertUser")
      .mockResolvedValue(undefined as never);
    vi.spyOn(sdk, "createSessionToken").mockResolvedValue(
      "app-session-token" as never
    );

    const callbackResponse = makeResponse();
    await routeHandlers.get.get("/api/auth/google/callback")?.(
      {
        query: { state, code: "google-authorization-code" },
        headers: { cookie: `__Host-lumo-google-signin-state=${state}` },
        secure: true,
      },
      callbackResponse
    );

    expect(callbackResponse.statusCode).toBe(302);
    const deepLink = new URL(callbackResponse.redirectTo);
    expect(deepLink.protocol).toBe("com.devhub201.lumo:");
    expect(deepLink.hostname).toBe("auth");
    const handoffCode = deepLink.searchParams.get("code");
    expect(handoffCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(callbackResponse.cookies.has(COOKIE_NAME)).toBe(false);
    expect(callbackResponse.redirectTo).not.toContain("app-session-token");
    expect(upsert).toHaveBeenCalledOnce();

    const exchange = routeHandlers.post.get("/api/auth/mobile/exchange");
    const rejectedResponse = makeResponse();
    exchange?.(
      { body: { code: handoffCode, codeVerifier: "x".repeat(43) } },
      rejectedResponse
    );
    expect(rejectedResponse.statusCode).toBe(403);
    expect(rejectedResponse.cookies.has(COOKIE_NAME)).toBe(false);

    const exchangeResponse = makeResponse();
    exchange?.(
      { body: { code: handoffCode, codeVerifier: verifier } },
      exchangeResponse
    );
    expect(exchangeResponse.statusCode).toBe(200);
    expect(exchangeResponse.body).toEqual({ ok: true });
    expect(exchangeResponse.cookies.get(COOKIE_NAME)?.value).toBe(
      "app-session-token"
    );
    expect(
      (
        exchangeResponse.cookies.get(COOKIE_NAME)?.options as {
          sameSite: string;
        }
      ).sameSite
    ).toBe("lax");

    const replayResponse = makeResponse();
    exchange?.(
      { body: { code: handoffCode, codeVerifier: verifier } },
      replayResponse
    );
    expect(replayResponse.statusCode).toBe(400);
    expect(replayResponse.cookies.has(COOKIE_NAME)).toBe(false);
  });
});
