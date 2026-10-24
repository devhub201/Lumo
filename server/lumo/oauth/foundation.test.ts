import { describe, expect, it } from "vitest";
import {
  getOAuthFoundationStatus,
  OAuthTokenCipher,
  parseOAuthEncryptionConfig,
} from "./crypto";
import {
  InMemoryOAuthPersistence,
  OAuthFoundationService,
} from "./storage";
import { getOAuthAvailability } from "./config";

const key = Buffer.alloc(32, 7).toString("base64");
const cipher = new OAuthTokenCipher(parseOAuthEncryptionConfig(key, "1")!);

describe("OAuth foundation", () => {
  it("encrypts and decrypts tokens without storing plaintext", () => {
    const plaintext = "refresh-token-secret";
    const ciphertext = cipher.encrypt(plaintext);
    expect(ciphertext).not.toContain(plaintext);
    expect(cipher.decrypt(ciphertext)).toBe(plaintext);
  });

  it("detects tampering and rejects wrong key versions or keys", () => {
    const ciphertext = cipher.encrypt("token");
    const parts = ciphertext.split(".");
    parts[3] = `${parts[3]}x`;
    expect(() => cipher.decrypt(parts.join("."))).toThrow(
      "authentication failed"
    );

    expect(() => cipher.decrypt(ciphertext.replace("v1.", "v2."))).toThrow(
      "Unsupported OAuth ciphertext key version"
    );
    const wrongCipher = new OAuthTokenCipher(
      parseOAuthEncryptionConfig(Buffer.alloc(32, 8).toString("base64"), "1")!
    );
    expect(() => wrongCipher.decrypt(ciphertext)).toThrow(
      "authentication failed"
    );
  });

  it("rejects malformed keys and reports optional configuration safely", () => {
    expect(() => parseOAuthEncryptionConfig("not-base64", "1")).toThrow();
    expect(() => parseOAuthEncryptionConfig(key, "2")).toThrow(
      "Unsupported OAuth encryption key version"
    );
    expect(getOAuthFoundationStatus("", "1")).toEqual({
      available: false,
      reason: "not_configured",
    });
    expect(getOAuthFoundationStatus("bad", "1")).toEqual({
      available: false,
      reason: "invalid_configuration",
    });
    expect(
      getOAuthAvailability("github", {
        encryptionKey: "",
        encryptionKeyVersion: "1",
        githubClientId: "",
        githubClientSecret: "",
        githubRedirectUri: "",
        googleClientId: "",
        googleClientSecret: "",
        googleRedirectUri: "",
      })
    ).toMatchObject({
      available: false,
      reason: "encryption_not_configured",
    });
  });

  it("binds OAuth state to owner/provider and prevents expiry and replay", async () => {
    const persistence = new InMemoryOAuthPersistence();
    let now = new Date("2026-10-12T00:00:00.000Z");
    const service = new OAuthFoundationService(persistence, cipher, () => now, 1000);
    const created = await service.createState({
      ownerKey: "user:1",
      provider: "github",
      redirectUri: "https://app.test/callback",
      pkceVerifier: "verifier",
    });

    expect(
      await service.consumeState({
        state: created.state,
        ownerKey: "user:2",
        provider: "github",
      })
    ).toBeNull();
    expect(
      await service.consumeState({
        state: created.state,
        ownerKey: "user:1",
        provider: "google",
      })
    ).toBeNull();

    const consumed = await service.consumeState({
      state: created.state,
      ownerKey: "user:1",
      provider: "github",
    });
    expect(consumed?.pkceVerifier).toBe("verifier");
    expect(
      await service.consumeState({
        state: created.state,
        ownerKey: "user:1",
        provider: "github",
      })
    ).toBeNull();

    const expired = await service.createState({
      ownerKey: "user:1",
      provider: "google",
      redirectUri: "https://app.test/callback",
    });
    now = new Date(now.getTime() + 1001);
    expect(
      await service.consumeState({
        state: expired.state,
        ownerKey: "user:1",
        provider: "google",
      })
    ).toBeNull();
  });

  it("encrypts provider access and refresh tokens and isolates connections by owner", async () => {
    const persistence = new InMemoryOAuthPersistence();
    const service = new OAuthFoundationService(persistence, cipher);
    await service.saveProviderTokens({
      ownerKey: "user:1",
      provider: "google",
      providerAccountId: "acct-1",
      accessToken: "access-secret",
      refreshToken: "refresh-secret",
      scopes: ["openid", "openid"],
    });
    expect(await persistence.getConnection("user:2", "google")).toBeNull();
    const stored = await persistence.getConnection("user:1", "google");
    expect(stored?.accessTokenCiphertext).not.toContain("access-secret");
    expect(stored?.refreshTokenCiphertext).not.toContain("refresh-secret");
    expect(stored?.scopes).toEqual(["openid"]);
  });
});
