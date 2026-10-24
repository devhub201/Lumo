import type { CookieOptions, Request } from "express";
import { ENV } from "./env";

export function getSessionCookieOptions(_req: Request): CookieOptions {
  // Production is same-origin behind the LUMO frontend proxy; Lax limits cross-site POSTs.
  // Non-production preview frames may still need a cross-site cookie.
  return {
    httpOnly: true,
    path: "/",
    sameSite: ENV.isProduction ? "lax" : "none",
    secure: true,
  };
}
