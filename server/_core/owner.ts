import { TRPCError } from "@trpc/server";
import type { AuthenticatedUser } from "./sdk";
import { ENV } from "./env";

const OWNER_KEY_PREFIX = "user:";

/** Compare the authenticated provider identity with the server-only owner allowlist. */
export function isAuthorizedOwnerOpenId(openId: unknown): openId is string {
  const configuredOwner = ENV.ownerOpenId.trim();
  return (
    configuredOwner.length > 0 &&
    typeof openId === "string" &&
    openId === configuredOwner
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

/** Convert the authenticated database identity into the only LUMO owner key. */
export function resolveOwnerKey(user: AuthenticatedUser | null): string {
  if (
    !user ||
    user.isCron ||
    user.taskUid ||
    !Number.isSafeInteger(user.id) ||
    user.id <= 0 ||
    typeof user.openId !== "string" ||
    user.openId.trim().length === 0 ||
    user.openId.startsWith("cron_")
  ) {
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
