// Platform values are read at use time. See the Webdev service/authentication skills.
export const ENV = {
  get appId() {
    return process.env.MANUS_PROJECT_ID ?? "";
  },
  get cookieSecret() {
    return process.env.MANUS_JWT_SECRET ?? "";
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "";
  },
  get oAuthServerUrl() {
    return process.env.MANUS_OAUTH_API_URL ?? "";
  },
  // Preserve the legacy hint when supplied; otherwise roles remain application data.
  get ownerOpenId() {
    return process.env.OWNER_OPEN_ID ?? "";
  },
  get tailscaleOnly() {
    return process.env.LUMO_TAILSCALE_ONLY === "true";
  },
  get tailscaleOwnerLogin() {
    return (process.env.LUMO_TAILSCALE_OWNER_LOGIN ?? "").trim().toLowerCase();
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get publicOrigin() {
    return process.env.LUMO_PUBLIC_ORIGIN ?? "";
  },
  get forgeApiUrl() {
    return process.env.MANUS_API_URL ?? "";
  },
  get forgeApiKey() {
    return process.env.MANUS_API_KEY ?? "";
  },
  get openAiApiKey() {
    return process.env.OPENAI_API_KEY ?? "";
  },
  get openAiBaseUrl() {
    return (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(
      /\/$/,
      ""
    );
  },
  get openAiModel() {
    return process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  },
  get lumoModel() {
    return process.env.LUMO_MODEL ?? "";
  },
  get lumoVisionModel() {
    return process.env.LUMO_VISION_MODEL ?? "";
  },
  get lumoMaxTokens() {
    const value = Number(process.env.LUMO_MAX_TOKENS ?? "1200");
    return Number.isFinite(value) && value > 0
      ? Math.min(Math.floor(value), 4000)
      : 1200;
  },
  get lumoTimeoutMs() {
    const value = Number(process.env.LUMO_TIMEOUT_MS ?? "45000");
    return Number.isFinite(value) && value >= 5000
      ? Math.min(Math.floor(value), 120000)
      : 45000;
  },
  get oauthEncryptionKey() {
    return process.env.LUMO_OAUTH_ENCRYPTION_KEY ?? "";
  },
  get oauthEncryptionKeyVersion() {
    return process.env.LUMO_OAUTH_ENCRYPTION_KEY_VERSION ?? "1";
  },
  get githubOAuthClientId() {
    return process.env.GITHUB_OAUTH_CLIENT_ID ?? "";
  },
  get githubOAuthClientSecret() {
    return process.env.GITHUB_OAUTH_CLIENT_SECRET ?? "";
  },
  get githubOAuthRedirectUri() {
    return process.env.GITHUB_OAUTH_REDIRECT_URI ?? "";
  },
  get githubOAuthScopes() {
    return (
      process.env.GITHUB_OAUTH_SCOPES ??
      "read:user user:email repo offline_access"
    );
  },
  get googleOAuthClientId() {
    return process.env.GOOGLE_OAUTH_CLIENT_ID ?? "";
  },
  get googleOAuthClientSecret() {
    return process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "";
  },
  get googleOAuthRedirectUri() {
    return process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "";
  },
  get googleOAuthScopes() {
    return (
      process.env.GOOGLE_OAUTH_SCOPES ??
      "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose"
    );
  },
  get googleSignInClientId() {
    return process.env.GOOGLE_SIGNIN_CLIENT_ID ?? "";
  },
  get googleSignInClientSecret() {
    return process.env.GOOGLE_SIGNIN_CLIENT_SECRET ?? "";
  },
  get googleSignInRedirectUri() {
    return process.env.GOOGLE_SIGNIN_REDIRECT_URI ?? "";
  },
};
