import { createHash, randomBytes } from "node:crypto";
import type { Express, Request, Response as ExpressResponse } from "express";
import { ENV } from "../../_core/env";
import { resolveOwnerKey } from "../../_core/owner";
import { sdk } from "../../_core/sdk";
import {
  createOAuthTokenCipherFromEnvironment,
  getOAuthFoundationStatus,
  OAuthTokenCipher,
} from "../oauth/crypto";
import {
  DatabaseOAuthPersistence,
  OAuthFoundationService,
  type OAuthPersistence,
} from "../oauth/storage";
import type { GmailAccount } from "./contracts";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const USER_AGENT = "LUMO-Gmail-OAuth";

type GmailOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};
type Fetcher = typeof fetch;

export class GmailOAuthError extends Error {
  constructor(
    readonly code:
      | "oauth_unavailable"
      | "oauth_state_invalid"
      | "oauth_authorization_denied"
      | "oauth_code_missing"
      | "google_token_exchange_failed"
      | "google_identity_failed",
    message = code
  ) {
    super(message);
  }
}

const defaultConfig = (): GmailOAuthConfig => ({
  clientId: ENV.googleOAuthClientId,
  clientSecret: ENV.googleOAuthClientSecret,
  redirectUri: ENV.googleOAuthRedirectUri,
  scopes: ENV.googleOAuthScopes.split(/\s+/).filter(Boolean),
});
const safeString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const safePositiveInteger = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
const verifier = () => randomBytes(32).toString("base64url");
const challenge = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
const json = async (response: Response) => {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
};

export class GmailOAuthService {
  constructor(
    private readonly persistence: OAuthPersistence,
    private readonly cipher: OAuthTokenCipher | null,
    private readonly config: GmailOAuthConfig = defaultConfig(),
    private readonly fetchImpl: Fetcher = fetch,
    private readonly now: () => Date = () => new Date()
  ) {}

  availability() {
    const encryption = this.cipher
      ? { available: true as const }
      : getOAuthFoundationStatus(ENV.oauthEncryptionKey, ENV.oauthEncryptionKeyVersion);
    const missing = [
      !this.config.clientId ? "GOOGLE_OAUTH_CLIENT_ID" : null,
      !this.config.clientSecret ? "GOOGLE_OAUTH_CLIENT_SECRET" : null,
      !this.config.redirectUri ? "GOOGLE_OAUTH_REDIRECT_URI" : null,
    ].filter((value): value is string => Boolean(value));
    return {
      provider: "google" as const,
      available: Boolean(encryption.available && missing.length === 0),
      missing: encryption.available
        ? missing
        : ["LUMO_OAUTH_ENCRYPTION_KEY", ...missing],
      reason: !encryption.available
        ? "encryption_not_configured"
        : missing.length === 0
          ? "configured"
          : "provider_not_configured",
    };
  }

  async start(ownerKey: string) {
    this.requireConfigured();
    if (!this.cipher) throw new GmailOAuthError("oauth_unavailable");
    const codeVerifier = verifier();
    const state = await new OAuthFoundationService(
      this.persistence,
      this.cipher,
      this.now
    ).createState({
      ownerKey,
      provider: "google",
      redirectUri: this.config.redirectUri,
      pkceVerifier: codeVerifier,
    });
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: this.config.scopes.join(" "),
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: state.state,
      code_challenge: challenge(codeVerifier),
      code_challenge_method: "S256",
    });
    return {
      authorizationUrl: `${AUTHORIZE_URL}?${params.toString()}`,
      expiresAt: state.expiresAt,
    };
  }

  async complete(input: {
    ownerKey: string;
    state: string;
    code?: string;
    error?: string;
  }) {
    if (!this.cipher) throw new GmailOAuthError("oauth_unavailable");
    const foundation = new OAuthFoundationService(
      this.persistence,
      this.cipher,
      this.now
    );
    const state = await foundation.consumeState({
      state: input.state,
      ownerKey: input.ownerKey,
      provider: "google",
    });
    if (!state || state.redirectUri !== this.config.redirectUri)
      throw new GmailOAuthError("oauth_state_invalid");
    if (input.error)
      throw new GmailOAuthError("oauth_authorization_denied");
    if (!input.code) throw new GmailOAuthError("oauth_code_missing");
    this.requireConfigured();

    const tokenResponse = await this.exchange(input.code, state.pkceVerifier);
    const accessToken = safeString(tokenResponse.access_token);
    if (!accessToken) throw new GmailOAuthError("google_token_exchange_failed");
    const identity = await this.identity(accessToken);
    const scopes = typeof tokenResponse.scope === "string"
      ? tokenResponse.scope.split(/\s+/).filter(Boolean)
      : this.config.scopes;
    const expiresIn = safePositiveInteger(tokenResponse.expires_in);
    await foundation.saveProviderTokens({
      ownerKey: input.ownerKey,
      provider: "google",
      providerAccountId: identity.sub,
      providerLogin: identity.email,
      accessToken,
      refreshToken: safeString(tokenResponse.refresh_token),
      accessTokenExpiresAt: expiresIn
        ? new Date(this.now().getTime() + expiresIn * 1000)
        : null,
      scopes,
    });
    return {
      connected: true,
      account: this.publicAccount(identity, scopes),
    };
  }

  async status(ownerKey: string) {
    const connection = await this.persistence.getConnection(ownerKey, "google");
    if (!connection)
      return { provider: "google" as const, authState: "disconnected" as const, account: null };
    const authState = connection.state === "error" ? "expired" : connection.state;
    return {
      provider: "google" as const,
      authState,
      account: {
        id: connection.providerAccountId,
        email: connection.providerLogin ?? "",
        displayName: null,
        authState,
        scopes: connection.scopes,
        connectedAt: connection.lastValidatedAt?.getTime() ?? null,
      } satisfies GmailAccount,
    };
  }

  async disconnect(ownerKey: string) {
    const connection = await this.persistence.getConnection(ownerKey, "google");
    if (!connection) return { disconnected: true, remoteRevoked: false };
    let remoteRevoked = false;
    if (this.cipher) {
      try {
        const token = connection.refreshTokenCiphertext
          ? this.cipher.decrypt(connection.refreshTokenCiphertext)
          : this.cipher.decrypt(connection.accessTokenCiphertext);
        const response = await this.fetchImpl(REVOKE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
          },
          body: new URLSearchParams({ token }).toString(),
        });
        remoteRevoked = response.status === 200;
      } catch {
        remoteRevoked = false;
      }
    }
    await this.persistence.revokeConnection(ownerKey, "google");
    return { disconnected: true, remoteRevoked };
  }

  private requireConfigured() {
    if (!this.availability().available)
      throw new GmailOAuthError("oauth_unavailable");
  }

  private async exchange(code: string, codeVerifier: string | null) {
    const response = await this.fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      body: new URLSearchParams({
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier ?? "",
      }).toString(),
    });
    const body = await json(response);
    if (!response.ok || !safeString(body.access_token))
      throw new GmailOAuthError("google_token_exchange_failed");
    return body;
  }

  private async identity(accessToken: string) {
    const response = await this.fetchImpl(USERINFO_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
    });
    const body = await json(response);
    const sub = safeString(body.sub);
    const email = safeString(body.email);
    if (!response.ok || !sub || !email)
      throw new GmailOAuthError("google_identity_failed");
    return { sub, email, name: safeString(body.name) };
  }

  private publicAccount(
    identity: { sub: string; email: string; name: string | null },
    scopes: string[]
  ): GmailAccount {
    return {
      id: identity.sub,
      email: identity.email,
      displayName: identity.name,
      authState: "connected",
      scopes,
      connectedAt: this.now().getTime(),
    };
  }
}

export function createGmailOAuthService() {
  let cipher: OAuthTokenCipher | null = null;
  try {
    cipher = createOAuthTokenCipherFromEnvironment();
  } catch {
    cipher = null;
  }
  return new GmailOAuthService(new DatabaseOAuthPersistence(), cipher);
}

export const gmailOAuthService = createGmailOAuthService();

export function registerGmailOAuthRoutes(
  app: Express,
  service: GmailOAuthService = gmailOAuthService
) {
  app.get("/api/oauth/google/callback", async (req: Request, res: ExpressResponse) => {
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const error = typeof req.query.error === "string" ? req.query.error : undefined;
    if (!state) {
      res.status(400).json({ error: "invalid_oauth_state" });
      return;
    }
    try {
      const user = await sdk.authenticateRequest(req);
      const ownerKey = resolveOwnerKey(user);
      res.status(200).json(await service.complete({ ownerKey, state, code, error }));
    } catch (cause) {
      const code = cause instanceof GmailOAuthError ? cause.code : "oauth_callback_failed";
      const status = code === "oauth_unavailable" ? 503 : code === "oauth_state_invalid" ? 403 : 400;
      res.status(status).json({ error: code });
    }
  });
}
