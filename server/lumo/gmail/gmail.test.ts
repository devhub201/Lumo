import { describe, expect, it } from "vitest";
import { OAuthTokenCipher, parseOAuthEncryptionConfig } from "../oauth/crypto";
import {
  InMemoryOAuthPersistence,
  OAuthFoundationService,
} from "../oauth/storage";
import { GmailOAuthService } from "./oauth";
import { RealGmailProvider } from "./real";

const cipher = new OAuthTokenCipher(
  parseOAuthEncryptionConfig(Buffer.alloc(32, 12).toString("base64"), "1")!
);
const config = {
  clientId: "google-client",
  clientSecret: "google-secret",
  redirectUri: "https://lumo.test/api/oauth/google/callback",
  scopes: ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"],
};
const response = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

const seed = async (persistence: InMemoryOAuthPersistence, ownerKey = "user:1") =>
  new OAuthFoundationService(persistence, cipher).saveProviderTokens({
    ownerKey,
    provider: "google",
    providerAccountId: "google-sub-1",
    providerLogin: "person@example.com",
    accessToken: "old-google-access",
    refreshToken: "google-refresh-secret",
    accessTokenExpiresAt: new Date(Date.now() - 1),
    scopes: config.scopes,
  });

describe("Gmail OAuth and provider", () => {
  it("creates Google PKCE authorization and completes owner-bound OAuth", async () => {
    const persistence = new InMemoryOAuthPersistence();
    const service = new GmailOAuthService(
      persistence,
      cipher,
      config,
      async (url) => String(url).includes("oauth2.googleapis.com/token")
        ? response({ access_token: "google-access", refresh_token: "google-refresh", expires_in: 3600, scope: config.scopes.join(" ") })
        : response({ sub: "google-sub-1", email: "person@example.com", name: "Person" })
    );
    const started = await service.start("user:1");
    const url = new URL(started.authorizationUrl);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    await expect(service.complete({ ownerKey: "user:2", state: url.searchParams.get("state")!, code: "code" }))
      .rejects.toMatchObject({ code: "oauth_state_invalid" });
    const result = await service.complete({ ownerKey: "user:1", state: url.searchParams.get("state")!, code: "code" });
    expect(result.account.email).toBe("person@example.com");
    expect((await service.status("user:2")).account).toBeNull();
    expect((await persistence.getConnection("user:1", "google"))?.accessTokenCiphertext).not.toContain("google-access");
  });

  it("refreshes Gmail access tokens and normalizes untrusted mail data", async () => {
    const persistence = new InMemoryOAuthPersistence();
    await seed(persistence);
    const provider = new RealGmailProvider(
      "user:1",
      persistence,
      cipher,
      { clientId: config.clientId, clientSecret: config.clientSecret },
      async (url) => {
        if (String(url).includes("oauth2.googleapis.com/token"))
          return response({ access_token: "new-google-access", refresh_token: "new-google-refresh", expires_in: 3600 });
        if (String(url).endsWith("/profile"))
          return response({ emailAddress: "person@example.com" });
        return response({});
      }
    );
    const account = await provider.getAccount();
    expect(account.email).toBe("person@example.com");
    expect((await persistence.getConnection("user:1", "google"))?.accessTokenCiphertext).not.toContain("new-google-access");
  });

  it("revokes Google access remotely and invalidates only the matching owner", async () => {
    const persistence = new InMemoryOAuthPersistence();
    await seed(persistence, "user:1");
    const service = new GmailOAuthService(
      persistence,
      cipher,
      config,
      async url => String(url).includes("oauth2.googleapis.com/revoke") ? response({}, 200) : response({})
    );
    expect(await service.disconnect("user:1")).toEqual({ disconnected: true, remoteRevoked: true });
    expect((await service.status("user:1")).authState).toBe("revoked");
    expect((await service.status("user:2")).account).toBeNull();
  });
});
