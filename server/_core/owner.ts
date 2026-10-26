import { TRPCError } from "@trpc/server";
import type { AuthenticatedUser } from "./sdk";
import { ENV } from "./env";

const OWNER_KEY_PREFIX = "user:";
const TAILSCALE_OWNER_KEY = "tailscale:owner";
const TAILSCALE_OPEN_ID_PREFIX = "tailscale:";

function configuredTailscaleOpenId(): string {
  return ENV.tailscaleOnly && ENV.tailscaleOwnerLogin
    ? `${TAILSCALE_OPEN_ID_PREFIX}${ENV.tailscaleOwnerLogin}`
    : "";
}

function isTailscaleOwner(openId: unknown): openId is string {
  const configured = configuredTailscaleOpenId();
  return configured.length > 0 && openId === configured;
}

/** Compare an identity with either the server-only OAuth allowlist or the exact configured Tailscale owner. */
export function isAuthorizedOwnerOpenId(openId: unknown): openId is string {
  const configuredOwner = ENV.ownerOpenId.trim();
  return (
    (configuredOwner.length > 0 && openId === configuredOwner) ||
    isTailscaleOwner(openId)
  );
}

/** Require the configured private owner before deriving an application owner key. */
export function assertPrivateOwner(user: AuthenticatedUser | null): string {
  const ownerKey = resolveOwnerKey(user);
  if (!isAuthorizedOwnerOpenId(user?.openId)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Private owner access is not authorized.",
    });
  }
  return ownerKey;
}

/** Convert the authenticated session or trusted Tailscale principal into the only LUMO owner key. */
export function resolveOwnerKey(user: AuthenticatedUser | null): string {
  if (
    !user ||
    user.isCron ||
    user.taskUid ||
    typeof user.openId !== "string" ||
    user.openId.trim().length === 0 ||
    user.openId.startsWith("cron_")
  ) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "A supported authenticated user identity is required.",
    });
  }

  if (isTailscaleOwner(user.openId)) return TAILSCALE_OWNER_KEY;

  if (!Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "A supported authenticated user identity is required.",
    });
  }

  return `${OWNER_KEY_PREFIX}${user.id}`;
}

/** Reject identity fields before Zod can silently strip them from input. */
export function rejectClientOwnerIdentity(value: unknown): void {
  const visited = new Set<object>();
  const visit = (current: unknown): void => {
    if (!current || typeof current !== "object") return;
    if (visited.has(current)) return;
    visited.add(current);

    for (const [key, nested] of Object.entries(current)) {
      if (key === "ownerKey" || key === "ownerId") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Owner identity is server-derived and cannot be supplied.",
        });
      }
      visit(nested);
    }
  };

  visit(value);
}
