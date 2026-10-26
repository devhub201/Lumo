import { describe, expect, it } from "vitest";
import { OAuthTokenCipher, parseOAuthEncryptionConfig } from "../oauth/crypto";
import {
  InMemoryOAuthPersistence,
  OAuthFoundationService,
} from "../oauth/storage";
import { RealGithubProvider } from "./real";

const cipher = new OAuthTokenCipher(
  parseOAuthEncryptionConfig(Buffer.alloc(32, 11).toString("base64"), "1")!
);
const config = { clientId: "github-client", clientSecret: "github-secret" };
const response = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

describe("RealGithubProvider", () => {
  it("refreshes an expiring token server-side and keeps owner isolation", async () => {
    const persistence = new InMemoryOAuthPersistence();
    const foundation = new OAuthFoundationService(persistence, cipher);
    await foundation.saveProviderTokens({
      ownerKey: "user:1",
      provider: "github",
      providerAccountId: "42",
      providerLogin: "octocat",
      accessToken: "old-access",
      refreshToken: "refresh-secret",
      accessTokenExpiresAt: new Date(Date.now() - 1),
      scopes: ["repo"],
    });
    const calls: string[] = [];
    const provider = new RealGithubProvider(
      "user:1",
      persistence,
      cipher,
      config,
      async (url, init) => {
        calls.push(String(url));
        if (String(url).includes("login/oauth/access_token"))
          return response({ access_token: "new-access", refresh_token: "new-refresh", expires_in: 3600 });
        return response([
          {
            id: 7,
            name: "repo",
            full_name: "octocat/repo",
            private: true,
            default_branch: "main",
            updated_at: "2026-10-12T00:00:00Z",
            owner: { login: "octocat" },
          },
        ]);
      }
    );
    const repos = await provider.listRepositories();
    expect(repos[0]).toMatchObject({ fullName: "octocat/repo", private: true });
    expect(calls[0]).toContain("login/oauth/access_token");
    expect((await persistence.getConnection("user:2", "github"))).toBeNull();
    const stored = await persistence.getConnection("user:1", "github");
    expect(stored?.accessTokenCiphertext).not.toContain("new-access");
    expect(stored?.refreshTokenCiphertext).not.toContain("new-refresh");
  });

  it("marks a connection expired when an API call receives unauthorized", async () => {
    const persistence = new InMemoryOAuthPersistence();
    await new OAuthFoundationService(persistence, cipher).saveProviderTokens({
      ownerKey: "user:1",
      provider: "github",
      providerAccountId: "42",
      providerLogin: "octocat",
      accessToken: "access",
      scopes: ["repo"],
    });
    const provider = new RealGithubProvider(
      "user:1",
      persistence,
      cipher,
      config,
      async () => response({ message: "Bad credentials" }, 401)
    );
    await expect(provider.listRepositories()).rejects.toThrow("token_expired");
    expect((await persistence.getConnection("user:1", "github"))?.state).toBe("expired");
  });
});
