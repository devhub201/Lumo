import { ENV } from "../../_core/env";
import { getOAuthFoundationStatus } from "./crypto";
import type { OAuthProvider } from "./storage";

export type OAuthAvailability = {
  provider: OAuthProvider;
  available: boolean;
  reason:
    | "configured"
    | "encryption_not_configured"
    | "encryption_invalid"
    | "provider_not_configured";
  missing: string[];
};

export function getOAuthAvailability(
  provider: OAuthProvider,
  values = {
    encryptionKey: ENV.oauthEncryptionKey,
    encryptionKeyVersion: ENV.oauthEncryptionKeyVersion,
    githubClientId: ENV.githubOAuthClientId,
    githubClientSecret: ENV.githubOAuthClientSecret,
    githubRedirectUri: ENV.githubOAuthRedirectUri,
    googleClientId: ENV.googleOAuthClientId,
    googleClientSecret: ENV.googleOAuthClientSecret,
    googleRedirectUri: ENV.googleOAuthRedirectUri,
  }
): OAuthAvailability {
  const encryption = getOAuthFoundationStatus(
    values.encryptionKey,
    values.encryptionKeyVersion
  );
  if (!encryption.available)
    return {
      provider,
      available: false,
      reason:
        encryption.reason === "not_configured"
          ? "encryption_not_configured"
          : "encryption_invalid",
      missing: ["LUMO_OAUTH_ENCRYPTION_KEY"],
    };

  const required =
    provider === "github"
      ? [
          ["GITHUB_OAUTH_CLIENT_ID", values.githubClientId],
          ["GITHUB_OAUTH_CLIENT_SECRET", values.githubClientSecret],
          ["GITHUB_OAUTH_REDIRECT_URI", values.githubRedirectUri],
        ]
      : [
          ["GOOGLE_OAUTH_CLIENT_ID", values.googleClientId],
          ["GOOGLE_OAUTH_CLIENT_SECRET", values.googleClientSecret],
          ["GOOGLE_OAUTH_REDIRECT_URI", values.googleRedirectUri],
        ];
  const missing = required.filter(([, value]) => !value.trim()).map(([name]) => name);
  return {
    provider,
    available: missing.length === 0,
    reason: missing.length === 0 ? "configured" : "provider_not_configured",
    missing,
  };
}
