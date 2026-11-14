/**
 * Owner identity: every LUMO data/permission scope is derived from the
 * authenticated session user on the server. The client can never choose it.
 *
 * Legacy compatibility: the original single-user build stored everything under
 * the fixed key "peter". To keep that data reachable, the one account whose
 * openId equals the server-side OWNER_OPEN_ID setting maps to that legacy key.
 * Every other authenticated user gets an isolated `user_<id>` scope.
 */
export const LUMO_LEGACY_OWNER_KEY = "peter" as const;

export type OwnerSource = { id: number; openId: string };

export function ownerKeyForUser(
  user: OwnerSource,
  legacyOwnerOpenId: string = process.env.OWNER_OPEN_ID ?? ""
): string {
  if (!Number.isInteger(user.id) || user.id <= 0)
    throw new Error("Cannot derive owner key from an invalid user.");
  if (legacyOwnerOpenId && user.openId === legacyOwnerOpenId)
    return LUMO_LEGACY_OWNER_KEY;
  return `user_${user.id}`;
}
