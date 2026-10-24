import { describe, expect, it } from "vitest";
import { OAuthTokenCipher, parseOAuthEncryptionConfig } from "../oauth/crypto";
import { InMemoryOAuthPersistence } from "../oauth/storage";
import {
  GithubOAuthError,
  GithubOAuthService,
} from "./oauth";

const cipher = new OAuthTokenCipher(
  parseOAuthEncryptionConfig(Buffer.alloc(32, 3).toString("base64"), "1")!
);
const config = {
  clientId: "Iv1.test-client",
  clientSecret: "github-client-secret",
  redirectUri: "https://lumo.test/api/oauth/github/callback",
  scopes: ["read:user", "user:email", "repo", "offline_access"],
};
const jsonResponse = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

describe("GitHub OAuth", () => {
  it("uses PKCE and rejects forged, wrong-owner, and replayed state", async () => {
    const persistence = new InMemoryOAuthPersistence();
    const service = new GithubOAuthService(
      persistence,
      cipher,
      config,
      async () => jsonResponse({ access_token: "gho_secret", scope: "read:user" })
    );
    const started = await service.start("user:1");
    const url = new URL(started.authorizationUrl);
    expect(url.searchParams.get("state")).toBeTruthy();
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]+$/);

    await expect(
      service.complete({ ownerKey: "user:1", state: "forged", code: "code" })
    ).rejects.toMatchObject({ code: "oauth_state_invalid" });
    await expect(
      service.complete({
        ownerKey: "user:2",
        state: url.searchParams.get("state")!,
        code: "code",
      })
    ).rejects.toMatchObject({ code: "oauth_state_invalid" });
  });

  it("consumes denied callbacks and blocks their replay", async () => {
    const persistence = new InMemoryOAuthPersistence();
    const service = new GithubOAuthService(persistence, cipher, config);
    const started = await service.start("user:1");
    await expect(
      service.complete({
        ownerKey: "user:1",
        state: started.authorizationUrl.split("state=")[1].split("&")[0],
        error: "access_denied",
      })
    ).rejects.toMatchObject({ code: "oauth_authorization_denied" });
    await expect(
      service.complete({
        ownerKey: "user:1",
        state: started.authorizationUrl.split("state=")[1].split("&")[0],
        code: "replay",
      })
    ).rejects.toMatchObject({ code: "oauth_state_invalid" });
  });

  it("exchanges server-side, validates the GitHub identity, and never returns secrets", async () => {
    const persistence = new InMemoryOAuthPersistence();
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const service = new GithubOAuthService(
      persistence,
      cipher,
      config,
      async (url, init) => {
        requests.push({ url: String(url), init });
        if (String(url).includes("login/oauth/access_token"))
          return jsonResponse({
            access_token: "gho_access_secret",
            refresh_token: "ghr_refresh_secret",
            expires_in: 28_800,
            scope: "read:user,repo",
          });
        return jsonResponse({ id: 12345, login: "octocat", name: "The Octocat" });
      }
    );
    const started = await service.start("user:1");
    const state = new URL(started.authorizationUrl).searchParams.get("state")!;
    const result = await service.complete({
      ownerKey: "user:1",
      state,
      code: "authorization-code-secret",
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("gho_access_secret");
    expect(serialized).not.toContain("ghr_refresh_secret");
    expect(serialized).not.toContain("github-client-secret");
    expect(serialized).not.toContain("authorization-code-secret");
    const stored = await persistence.getConnection("user:1", "github");
    expect(stored?.accessTokenCiphertext).not.toContain("gho_access_secret");
    expect(stored?.refreshTokenCiphertext).not.toContain("ghr_refresh_secret");
    expect(requests[0]?.init?.headers).toMatchObject({ Accept: "application/json" });
    expect(JSON.stringify(requests[0]?.init?.body)).toContain("github-client-secret");
    expect((await service.status("user:2")).account).toBeNull();
  });

  it("revokes remotely when possible and always invalidates the owner-local connection", async () => {
    const persistence = new InMemoryOAuthPersistence();
    const service = new GithubOAuthService(
      persistence,
      cipher,
      config,
      async url =>
        String(url).includes("/applications/")
          ? jsonResponse(null, 204)
          : jsonResponse({ id: 1, login: "octocat", name: null })
    );
    await service.saveProviderTokens({
      ownerKey: "user:1",
      provider: "github",
      providerAccountId: "1",
      providerLogin: "octocat",
      accessToken: "gho_access_secret",
      refreshToken: "ghr_refresh_secret",
      scopes: ["read:user"],
    });
    const disconnected = await service.disconnect("user:1");
    expect(disconnected).toEqual({ disconnected: true, remoteRevoked: true });
    expect((await service.status("user:1")).authState).toBe("revoked");
    expect((await service.disconnect("user:2")).remoteRevoked).toBe(false);
  });

  it("reports unavailable when the required GitHub configuration is absent", async () => {
    const service = new GithubOAuthService(
      new InMemoryOAuthPersistence(),
      null,
      { clientId: "", clientSecret: "", redirectUri: "", scopes: [] }
    );
    expect(service.availability().available).toBe(false);
    await expect(service.start("user:1")).rejects.toBeInstanceOf(GithubOAuthError);
  });
});
