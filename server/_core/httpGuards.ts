import type { NextFunction, Request, RequestHandler, Response } from "express";
import { FixedWindowRateLimiter, clientKey } from "./rateLimit";

/** Conservative response headers. No CSP here: the web workbench inlines styles. */
export const securityHeaders: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  // The legacy platform preview embeds the app in a cross-site frame; set
  // LUMO_ALLOW_FRAMING=1 only there. Default is to refuse framing.
  if (process.env.LUMO_ALLOW_FRAMING !== "1")
    res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), payment=()");
  if (process.env.NODE_ENV === "production")
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=15552000; includeSubDomains"
    );
  next();
};

/** Express middleware that rejects with 429 once `limiter` is exhausted. */
export const rateLimitMiddleware =
  (limiter: FixedWindowRateLimiter, scope: string): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    const result = limiter.hit(`${scope}:${clientKey(req)}`);
    if (!result.allowed) {
      res.setHeader("Retry-After", String(Math.ceil(result.retryAfterMs / 1000)));
      res.status(429).json({ error: "Too many requests" });
      return;
    }
    next();
  };

const allowedOrigins = () =>
  new Set(
    (process.env.LUMO_ALLOWED_ORIGINS ?? "")
      .split(",")
      .map(origin => origin.trim())
      .filter(Boolean)
  );

/**
 * CSRF defence for the cookie-authenticated API. The session cookie is
 * SameSite=None, so a state-changing request that carries an `Origin` header
 * must come from this same host or an explicitly allowed origin. Requests with
 * no Origin (native HTTP clients, curl) are not browser-driven and pass.
 */
export const originGuard: RequestHandler = (req, res, next) => {
  const safeMethod = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
  const origin = req.headers.origin;
  if (safeMethod || !origin) return next();
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    res.status(403).json({ error: "Invalid origin" });
    return;
  }
  if (originHost === req.headers.host || allowedOrigins().has(origin)) return next();
  res.status(403).json({ error: "Cross-origin request blocked" });
};
