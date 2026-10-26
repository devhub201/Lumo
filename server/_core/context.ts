import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk, type AuthenticatedUser } from "./sdk";
import { ENV } from "./env";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

function tailscaleOwnerFromRequest(
  opts: CreateExpressContextOptions
): AuthenticatedUser | null {
  const configuredLogin = ENV.tailscaleOwnerLogin;
  const suppliedLogin = opts.req.headers["tailscale-user-login"];
  if (
    !ENV.tailscaleOnly ||
    !configuredLogin ||
    typeof suppliedLogin !== "string" ||
    suppliedLogin.trim().toLowerCase() !== configuredLogin
  ) {
    return null;
  }

  const now = new Date();
  return {
    id: 0,
    openId: `tailscale:${configuredLogin}`,
    name: "LUMO owner",
    email: configuredLogin,
    loginMethod: "tailscale",
    role: "admin",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  } as AuthenticatedUser;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  if (ENV.tailscaleOnly) {
    // Tailscale Serve injects this identity header and strips client-supplied copies.
    // The public web listener is disabled in this mode; only Serve may reach it.
    user = tailscaleOwnerFromRequest(opts);
  } else {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
