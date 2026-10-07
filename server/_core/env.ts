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
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get forgeApiUrl() {
    return process.env.MANUS_API_URL ?? "";
  },
  get forgeApiKey() {
    return process.env.MANUS_API_KEY ?? "";
  },
  get lumoModel() {
    return process.env.LUMO_MODEL ?? "";
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
};
