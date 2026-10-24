import { createHash, randomBytes } from "node:crypto";
import type { Express, Request, Response } from "express";
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
  type StoredProviderConnection,
} from "../oauth/storage";
import type { GithubAccount } from "./contracts";

const GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_API_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const USER_AGENT = "LUMO-GitHub-OAuth";

type GithubOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
};

type GithubFetch = typeof fetch;

type GithubOAuthTokenResponse = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  refresh_token_expires_in?: unknown;
  scope?: unknown;
  error?: unknown;
};

type GithubUserResponse = {
  id?: unknown;
  login?: unknown;
  name?: unknown;
};

export class GithubOAuthError extends Error {
  constructor(
    readonly code:
      | "oauth_unavailable"
      | "oauth_state_invalid"
      | "oauth_authorization_denied"
      | "oauth_code_missing"
      | "github_token_exchange_failed"
      | "github_identity_failed"
      | "github_disconnect_failed",
    message = code
  ) {
    super(message);
  }
}

const defaultConfig = (): GithubOAuthConfig => ({
  clientId: ENV.githubOAuthClientId,
  clientSecret: ENV.githubOAuthClientSecret,
  redirectUri: ENV.githubOAuthRedirectUri,
  scopes: ENV.githubOAuthScopes.split(/\s+/).filter(Boolean),
});

const createPkceVerifier = () => randomBytes(32).toString("base64url");
const createPkceChallenge = (verifier: string) =>
  createHash("sha256").update(verifier).digest("base64url");
const safeString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const safePositiveInteger = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;

export class GithubOAuthService {
  constructor(
    private readonly persistence: OAuthPersistence,
    private readonly cipher: OAuthTokenCipher | null,
    private readonly config: GithubOAuthConfig = defaultConfig(),
    private readonly fetchImpl: GithubFetch = fetch,
    private readonly now: () => Date = () => new Date()
  ) {}

  availability() {
    const encryption = this.cipher
      ? { available: true as const, keyVersion: this.cipher.keyVersion }
      : getOAuthFoundationStatus(
          ENV.oauthEncryptionKey,
          ENV.oauthEncryptionKeyVersion
        );
    const missing = [
      !this.config.clientId ? "GITHUB_OAUTH_CLIENT_ID" : null,
      !this.config.clientSecret ? "GITHUB_OAUTH_CLIENT_SECRET" : null,
      !this.config.redirectUri ? "GITHUB_OAUTH_REDIRECT_URI" : null,
    ].filter((value): value is string => Boolean(value));
    return {
      provider: "github" as const,
      available: Boolean(encryption.available && missing.length === 0),
      missing: encryption.available ? missing : ["LUMO_OAUTH_ENCRYPTION_KEY", ...missing],
      reason: !encryption.available
        ? "encryption_not_configured"
        : missing.length === 0
          ? "configured"
          : "provider_not_configured",
    };
  }

  async start(ownerKey: string) {
    this.requireConfigured();
    if (!this.cipher) throw new GithubOAuthError("oauth_unavailable");
    const verifier = createPkceVerifier();
    const state = await new OAuthFoundationService(
      this.persistence,
      this.cipher,
      this.now
    ).createState({
      ownerKey,
      provider: "github",
      redirectUri: this.config.redirectUri,
      pkceVerifier: verifier,
    });
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(" "),
      state: state.state,
      code_challenge: createPkceChallenge(verifier),
      code_challenge_method: "S256",
    });
    return {
      authorizationUrl: `${GITHUB_AUTHORIZE_URL}?${params.toString()}`,
      expiresAt: state.expiresAt,
    };
  }

  async complete(input: {
    ownerKey: string;
    state: string;
    code?: string;
    error?: string;
  }) {
    if (!this.cipher) throw new GithubOAuthError("oauth_unavailable");
    const foundation = new OAuthFoundationService(
      this.persistence,
      this.cipher,
      this.now
    );
    const state = await foundation.consumeState({
      state: input.state,
      ownerKey: input.ownerKey,
      provider: "github",
    });
    if (!state || state.redirectUri !== this.config.redirectUri)
      throw new GithubOAuthError("oauth_state_invalid");
    if (input.error)
      throw new GithubOAuthError("oauth_authorization_denied");
    if (!input.code) throw new GithubOAuthError("oauth_code_missing");
    this.requireConfigured();

    const tokenResponse = await this.exchangeCode(input.code, state.pkceVerifier);
    const accessToken = safeString(tokenResponse.access_token);
    if (!accessToken)
      throw new GithubOAuthError("github_token_exchange_failed");
    const account = await this.fetchGithubAccount(accessToken);
    const scopes = typeof tokenResponse.scope === "string"
      ? tokenResponse.scope.split(",").map(value => value.trim()).filter(Boolean)
      : this.config.scopes;
    const expiresIn = safePositiveInteger(tokenResponse.expires_in);
    const refreshToken = safeString(tokenResponse.refresh_token);
    await foundation.saveProviderTokens({
      ownerKey: input.ownerKey,
      provider: "github",
      providerAccountId: String(account.id),
      providerLogin: account.login,
      accessToken,
      refreshToken,
      accessTokenExpiresAt: expiresIn
        ? new Date(this.now().getTime() + expiresIn * 1000)
        : null,
      scopes,
    });
    return {
      connected: true,
      account: this.toPublicAccount(account, scopes),
    };
  }

  async status(ownerKey: string) {
    const connection = await this.persistence.getConnection(ownerKey, "github");
    if (!connection)
      return {
        provider: "github" as const,
        authState: "disconnected" as const,
        account: null,
      };
    return {
      provider: "github" as const,
      authState: connection.state,
      account: {
        id: connection.providerAccountId,
        login: connection.providerLogin ?? "",
        name: null,
        authState: connection.state === "error" ? "expired" : connection.state,
        scopes: connection.scopes,
        connectedAt: connection.lastValidatedAt?.getTime() ?? null,
      } satisfies GithubAccount,
    };
  }

  async saveProviderTokens(
    input: Parameters<OAuthFoundationService["saveProviderTokens"]>[0]
  ) {
    if (!this.cipher) throw new GithubOAuthError("oauth_unavailable");
    return new OAuthFoundationService(
      this.persistence,
      this.cipher,
      this.now
    ).saveProviderTokens(input);
  }

  async disconnect(ownerKey: string) {
    const connection = await this.persistence.getConnection(ownerKey, "github");
    if (!connection) return { disconnected: true, remoteRevoked: false };
    let remoteRevoked = false;
    if (this.cipher && this.config.clientId && connection.accessTokenCiphertext) {
      try {
        const accessToken = this.cipher.decrypt(connection.accessTokenCiphertext);
        const response = await this.fetchImpl(
          `${GITHUB_API_URL}/applications/${encodeURIComponent(this.config.clientId)}/token`,
          {
            method: "DELETE",
            headers: {
              Accept: "application/vnd.github+json",
              "Content-Type": "application/json",
              "X-GitHub-Api-Version": GITHUB_API_VERSION,
              "User-Agent": USER_AGENT,
            },
            body: JSON.stringify({ access_token: accessToken }),
          }
        );
        remoteRevoked = response.status === 204 || response.status === 404;
      } catch {
        remoteRevoked = false;
      }
    }
    await this.persistence.revokeConnection(ownerKey, "github");
    return { disconnected: true, remoteRevoked };
  }

  private requireConfigured() {
    const status = this.availability();
    if (!status.available) throw new GithubOAuthError("oauth_unavailable");
  }

  private async exchangeCode(code: string, verifier: string | null) {
    const response = await this.fetchImpl(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
      },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: this.config.redirectUri,
        code_verifier: verifier,
      }),
    });
    let body: GithubOAuthTokenResponse;
    try {
      body = (await response.json()) as GithubOAuthTokenResponse;
    } catch {
      throw new GithubOAuthError("github_token_exchange_failed");
    }
    if (!response.ok || !safeString(body.access_token))
      throw new GithubOAuthError("github_token_exchange_failed");
    return body;
  }

  private async fetchGithubAccount(accessToken: string) {
    const response = await this.fetchImpl(`${GITHUB_API_URL}/user`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
        "User-Agent": USER_AGENT,
      },
    });
    let body: GithubUserResponse;
    try {
      body = (await response.json()) as GithubUserResponse;
    } catch {
      throw new GithubOAuthError("github_identity_failed");
    }
    const id = body.id;
    const login = safeString(body.login);
    if (!(typeof id === "number" || typeof id === "string") || !login)
      throw new GithubOAuthError("github_identity_failed");
    return { id, login, name: safeString(body.name) };
  }

  private toPublicAccount(
    account: { id: string | number; login: string; name: string | null },
    scopes: string[]
  ): GithubAccount {
    return {
      id: String(account.id),
      login: account.login,
      name: account.name,
      authState: "connected",
      scopes,
      connectedAt: this.now().getTime(),
    };
  }
}

export function createGithubOAuthService() {
  let cipher: OAuthTokenCipher | null = null;
  try {
    cipher = createOAuthTokenCipherFromEnvironment();
  } catch {
    cipher = null;
  }
  return new GithubOAuthService(new DatabaseOAuthPersistence(), cipher);
}

export const githubOAuthService = createGithubOAuthService();

export function registerGithubOAuthRoutes(
  app: Express,
  service: GithubOAuthService = githubOAuthService
) {
  app.get("/api/oauth/github/callback", async (req: Request, res: Response) => {
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
      const result = await service.complete({ ownerKey, state, code, error });
      res.status(200).json(result);
    } catch (cause) {
      const code = cause instanceof GithubOAuthError ? cause.code : "oauth_callback_failed";
      const status = code === "oauth_unavailable" ? 503 : code === "oauth_state_invalid" ? 403 : 400;
      res.status(status).json({ error: code });
    }
  });
}

export function publicGithubConnection(connection: StoredProviderConnection | null) {
  if (!connection) return null;
  return {
    provider: "github" as const,
    id: connection.providerAccountId,
    login: connection.providerLogin,
    authState: connection.state,
    scopes: connection.scopes,
    connectedAt: connection.lastValidatedAt?.getTime() ?? null,
  };
}
