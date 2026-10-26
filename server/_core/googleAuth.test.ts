import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { googleSignInAvailability, verifyMobilePkce } from "./googleAuth";
import { registerOAuthRoutes } from "./oauth";
import { isAuthorizedOwnerOpenId } from "./owner";

const keys = [
  "GOOGLE_SIGNIN_CLIENT_ID",
  "GOOGLE_SIGNIN_CLIENT_SECRET",
  "GOOGLE_SIGNIN_REDIRECT_URI",
  "OWNER_OPEN_ID",
  "DATABASE_URL",
  "MANUS_PROJECT_ID",
  "MANUS_JWT_SECRET",
  "LUMO_PUBLIC_ORIGIN",
  "NODE_ENV",
] as const;
const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = original[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function setRequiredConfiguration() {
  process.env.GOOGLE_SIGNIN_CLIENT_ID = "google-client-id";
  process.env.GOOGLE_SIGNIN_CLIENT_SECRET = "server-only-secret";
  process.env.GOOGLE_SIGNIN_REDIRECT_URI =
    "https://lumo.test/api/auth/google/callback";
  process.env.OWNER_OPEN_ID = "google:owner-subject";
  process.env.DATABASE_URL = "mysql://user:pass@localhost/lumo";
  process.env.MANUS_PROJECT_ID = "lumo-test-project";
  process.env.MANUS_JWT_SECRET = "test-session-secret";
}

describe("Google sign-in availability", () => {
  it("registers web and mobile Google sign-in routes for the frontend integration", () => {
    const paths: string[] = [];
    registerOAuthRoutes({
      get(path: string) {
        paths.push(path);
      },
      post(path: string) {
        paths.push(path);
      },
    } as never);
    expect(paths).toContain("/api/auth/google/start");
    expect(paths).toContain("/api/auth/google/callback");
    expect(paths).toContain("/api/auth/mobile/exchange");
  });

  it("allows only the exact configured Google owner OpenID", () => {
    process.env.OWNER_OPEN_ID = "google:owner-subject";
    expect(isAuthorizedOwnerOpenId("google:owner-subject")).toBe(true);
    expect(isAuthorizedOwnerOpenId("google:other-subject")).toBe(false);
    expect(isAuthorizedOwnerOpenId("owner@example.test")).toBe(false);
  });

  it("is unavailable until all server-only session and database configuration is present", () => {
    for (const key of keys) delete process.env[key];
    process.env.NODE_ENV = "test";
    const result = googleSignInAvailability();
    expect(result.available).toBe(false);
    expect(result.missing).toEqual([
      "GOOGLE_SIGNIN_CLIENT_ID",
      "GOOGLE_SIGNIN_CLIENT_SECRET",
      "GOOGLE_SIGNIN_REDIRECT_URI",
      "DATABASE_URL",
      "MANUS_PROJECT_ID",
      "MANUS_JWT_SECRET",
      "OWNER_OPEN_ID",
    ]);
  });

  it("requires a production callback on the exact configured HTTPS app origin", () => {
    setRequiredConfiguration();
    process.env.NODE_ENV = "production";
    process.env.LUMO_PUBLIC_ORIGIN = "https://lumo.test/";
    expect(googleSignInAvailability().available).toBe(true);
    process.env.GOOGLE_SIGNIN_REDIRECT_URI =
      "https://other.test/api/auth/google/callback";
    expect(googleSignInAvailability().missing).toContain(
      "GOOGLE_SIGNIN_REDIRECT_URI"
    );
    process.env.GOOGLE_SIGNIN_REDIRECT_URI =
      "http://lumo.test/api/auth/google/callback";
    expect(googleSignInAvailability().missing).toContain(
      "GOOGLE_SIGNIN_REDIRECT_URI"
    );
  });

  it("requests identity scopes only, never Gmail permission", () => {
    setRequiredConfiguration();
    const result = googleSignInAvailability();
    expect(result.available).toBe(true);
    expect(result.scopes).toEqual(["openid", "email", "profile"]);
    expect(result.scopes.some(scope => scope.includes("gmail"))).toBe(false);
  });

  it("validates the mobile handoff using the S256 PKCE verifier", () => {
    const verifier = "a".repeat(43);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    expect(verifyMobilePkce(challenge, verifier)).toBe(true);
    expect(verifyMobilePkce(challenge, "b".repeat(43))).toBe(false);
    expect(verifyMobilePkce("short", verifier)).toBe(false);
  });
});
