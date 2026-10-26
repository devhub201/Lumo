import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { parse as parseCookieHeader } from "cookie";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { ENV } from "./env";
import { sdk } from "./sdk";
import { isAuthorizedOwnerOpenId } from "./owner";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const SECURE_STATE_COOKIE = "__Host-lumo-google-signin-state";
const LOCAL_STATE_COOKIE = "lumo-google-signin-state";
const STATE_MAX_AGE_SECONDS = 600;
const MOBILE_HANDOFF_TTL_MS = 2 * 60 * 1000;
const MAX_MOBILE_FLOWS = 512;
const MOBILE_CALLBACK_URI = "com.devhub201.lumo://auth/callback";
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9._~-]{43,128}$/;
const SIGN_IN_SCOPES = ["openid", "email", "profile"] as const;

type GoogleSignInConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

type PendingMobileAuthorization = {
  challenge: string;
  expiresAt: number;
};

type PendingMobileSession = {
  sessionToken: string;
  challenge: string;
  expiresAt: number;
};

const pendingMobileAuthorizations = new Map<
  string,
  PendingMobileAuthorization
>();
const pendingMobileSessions = new Map<string, PendingMobileSession>();

const config = (): GoogleSignInConfig => ({
  clientId: ENV.googleSignInClientId,
  clientSecret: ENV.googleSignInClientSecret,
  redirectUri: ENV.googleSignInRedirectUri,
});

function normalizedHttpsOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function redirectMatchesPublicOrigin(): boolean {
  if (!ENV.isProduction) return true;
  const expectedOrigin = normalizedHttpsOrigin(ENV.publicOrigin);
  if (!expectedOrigin) return false;
  try {
    const redirect = new URL(config().redirectUri);
    return (
      redirect.protocol === "https:" &&
      redirect.origin === expectedOrigin &&
      redirect.pathname === "/api/auth/google/callback" &&
      !redirect.search &&
      !redirect.hash
    );
  } catch {
    return false;
  }
}

export function googleSignInAvailability() {
  const current = config();
  const publicOrigin = normalizedHttpsOrigin(ENV.publicOrigin);
  const missing = [
    !current.clientId ? "GOOGLE_SIGNIN_CLIENT_ID" : null,
    !current.clientSecret ? "GOOGLE_SIGNIN_CLIENT_SECRET" : null,
    !current.redirectUri || !redirectMatchesPublicOrigin()
      ? "GOOGLE_SIGNIN_REDIRECT_URI"
      : null,
    !ENV.databaseUrl ? "DATABASE_URL" : null,
    !ENV.appId ? "MANUS_PROJECT_ID" : null,
    !ENV.cookieSecret ? "MANUS_JWT_SECRET" : null,
    !ENV.ownerOpenId.trim() ? "OWNER_OPEN_ID" : null,
    ENV.isProduction && !publicOrigin ? "LUMO_PUBLIC_ORIGIN" : null,
  ].filter((value): value is string => Boolean(value));
  return {
    available: missing.length === 0,
    missing: [...new Set(missing)],
    scopes: [...SIGN_IN_SCOPES],
  };
}

const json = async (response: globalThis.Response) => {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

const stateCookieName = (req: Request) =>
  ENV.isProduction || req.secure ? SECURE_STATE_COOKIE : LOCAL_STATE_COOKIE;

function safeError(res: Response, status: number, error: string) {
  res.status(status).json({ error });
}

function pruneMobileFlows(now = Date.now()) {
  for (const [state, flow] of pendingMobileAuthorizations) {
    if (flow.expiresAt <= now) pendingMobileAuthorizations.delete(state);
  }
  for (const [codeHash, flow] of pendingMobileSessions) {
    if (flow.expiresAt <= now) pendingMobileSessions.delete(codeHash);
  }
}

function hashHandoffCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export function verifyMobilePkce(challenge: string, verifier: string): boolean {
  if (
    !CODE_CHALLENGE_PATTERN.test(challenge) ||
    !CODE_VERIFIER_PATTERN.test(verifier)
  ) {
    return false;
  }
  const actual = createHash("sha256").update(verifier).digest("base64url");
  const expectedBytes = Buffer.from(challenge);
  const actualBytes = Buffer.from(actual);
  return (
    expectedBytes.length === actualBytes.length &&
    timingSafeEqual(expectedBytes, actualBytes)
  );
}

export function registerGoogleSignInRoutes(app: Express) {
  app.get("/api/auth/google/start", (req, res) => {
    const available = googleSignInAvailability();
    if (!available.available) {
      safeError(res, 503, "google_signin_unavailable");
      return;
    }
    const isMobile = req.query.mobile === "1";
    const codeChallenge =
      typeof req.query.code_challenge === "string"
        ? req.query.code_challenge
        : "";
    const challengeMethod =
      typeof req.query.code_challenge_method === "string"
        ? req.query.code_challenge_method
        : "";
    if (
      isMobile &&
      (!CODE_CHALLENGE_PATTERN.test(codeChallenge) ||
        challengeMethod !== "S256")
    ) {
      safeError(res, 400, "invalid_mobile_oauth_request");
      return;
    }
    pruneMobileFlows();
    if (
      isMobile &&
      (pendingMobileAuthorizations.size >= MAX_MOBILE_FLOWS ||
        pendingMobileSessions.size >= MAX_MOBILE_FLOWS)
    ) {
      safeError(res, 429, "mobile_oauth_capacity_exceeded");
      return;
    }
    const state = randomBytes(32).toString("base64url");
    if (isMobile) {
      pendingMobileAuthorizations.set(state, {
        challenge: codeChallenge,
        expiresAt: Date.now() + STATE_MAX_AGE_SECONDS * 1000,
      });
    }
    const current = config();
    const cookieName = stateCookieName(req);
    res.cookie(cookieName, state, {
      httpOnly: true,
      secure: cookieName === SECURE_STATE_COOKIE,
      sameSite: "lax",
      path: "/",
      maxAge: STATE_MAX_AGE_SECONDS * 1000,
    });
    const params = new URLSearchParams({
      client_id: current.clientId,
      redirect_uri: current.redirectUri,
      response_type: "code",
      scope: SIGN_IN_SCOPES.join(" "),
      state,
      prompt: "select_account",
    });
    res.redirect(302, `${AUTHORIZE_URL}?${params.toString()}`);
  });

  app.get("/api/auth/google/callback", async (req: Request, res: Response) => {
    const cookieName = stateCookieName(req);
    const expected = parseCookieHeader(req.headers.cookie ?? "")[cookieName];
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const error = typeof req.query.error === "string" ? req.query.error : "";
    res.clearCookie(cookieName, {
      httpOnly: true,
      secure: cookieName === SECURE_STATE_COOKIE,
      sameSite: "lax",
      path: "/",
    });
    if (!state || !expected || state !== expected) {
      safeError(res, 403, "invalid_google_signin_state");
      return;
    }
    const mobileFlow = pendingMobileAuthorizations.get(state);
    if (mobileFlow) pendingMobileAuthorizations.delete(state);
    if (error) {
      safeError(res, 400, "google_signin_denied");
      return;
    }
    const available = googleSignInAvailability();
    if (!available.available || !code) {
      safeError(
        res,
        available.available ? 400 : 503,
        available.available
          ? "google_signin_code_missing"
          : "google_signin_unavailable"
      );
      return;
    }
    if (mobileFlow && mobileFlow.expiresAt <= Date.now()) {
      safeError(res, 400, "mobile_oauth_request_expired");
      return;
    }
    const current = config();
    try {
      const tokenResponse = await fetch(TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: current.clientId,
          client_secret: current.clientSecret,
          code,
          redirect_uri: current.redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const tokenBody = await json(tokenResponse);
      const accessToken = text(tokenBody.access_token);
      if (!tokenResponse.ok || !accessToken) {
        safeError(res, 400, "google_signin_token_exchange_failed");
        return;
      }
      const identityResponse = await fetch(USERINFO_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      const identity = await json(identityResponse);
      const subject = text(identity.sub);
      const email = text(identity.email);
      if (
        !identityResponse.ok ||
        !subject ||
        !email ||
        identity.email_verified !== true
      ) {
        safeError(res, 400, "google_signin_identity_failed");
        return;
      }
      const openId = `google:${subject}`;
      if (!isAuthorizedOwnerOpenId(openId)) {
        safeError(res, 403, "private_owner_only");
        return;
      }
      await db.upsertUser({
        openId,
        name: text(identity.name),
        email,
        loginMethod: "google",
        lastSignedIn: new Date(),
      });
      const sessionToken = await sdk.createSessionToken(openId, {
        name: text(identity.name) ?? email,
        expiresInMs: ONE_YEAR_MS,
      });
      if (mobileFlow) {
        pruneMobileFlows();
        if (pendingMobileSessions.size >= MAX_MOBILE_FLOWS) {
          safeError(res, 429, "mobile_oauth_capacity_exceeded");
          return;
        }
        const handoffCode = randomBytes(32).toString("base64url");
        pendingMobileSessions.set(hashHandoffCode(handoffCode), {
          sessionToken,
          challenge: mobileFlow.challenge,
          expiresAt: Date.now() + MOBILE_HANDOFF_TTL_MS,
        });
        res.redirect(
          302,
          `${MOBILE_CALLBACK_URI}?code=${encodeURIComponent(handoffCode)}`
        );
        return;
      }
      res.cookie(COOKIE_NAME, sessionToken, {
        ...getSessionCookieOptions(req),
        maxAge: ONE_YEAR_MS,
      });
      res.redirect(302, "/");
    } catch {
      safeError(res, 502, "google_signin_failed");
    }
  });

  app.post("/api/auth/mobile/exchange", (req: Request, res: Response) => {
    const handoffCode = text(req.body?.code);
    const verifier = text(req.body?.codeVerifier);
    if (!handoffCode || !verifier) {
      safeError(res, 400, "invalid_mobile_handoff");
      return;
    }
    pruneMobileFlows();
    const codeHash = hashHandoffCode(handoffCode);
    const pending = pendingMobileSessions.get(codeHash);
    if (!pending) {
      safeError(res, 400, "invalid_mobile_handoff");
      return;
    }
    if (!verifyMobilePkce(pending.challenge, verifier)) {
      safeError(res, 403, "mobile_pkce_verification_failed");
      return;
    }
    pendingMobileSessions.delete(codeHash);
    res.cookie(COOKIE_NAME, pending.sessionToken, {
      ...getSessionCookieOptions(req),
      maxAge: ONE_YEAR_MS,
    });
    res.json({ ok: true });
  });
}
