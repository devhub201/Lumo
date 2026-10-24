import type { NextFunction, Request, Response } from "express";
import { ENV } from "./env";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function httpsOrigin(value: string | undefined): string | null {
  if (!value || value === "null") return null;
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

export function isTrustedProductionMutationOrigin(
  requestOrigin: string | undefined,
  configuredOrigin: string | undefined
): boolean {
  const request = httpsOrigin(requestOrigin);
  const configured = httpsOrigin(configuredOrigin);
  return request !== null && configured !== null && request === configured;
}

export function enforceMutationOrigin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!MUTATING_METHODS.has(req.method.toUpperCase()) || !ENV.isProduction) {
    next();
    return;
  }
  if (!isTrustedProductionMutationOrigin(req.get("origin"), ENV.publicOrigin)) {
    res.status(403).json({ error: "cross_site_request_forbidden" });
    return;
  }
  next();
}
