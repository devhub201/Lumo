export function matchesTailscaleOwner(
  headers: Headers,
  enabled: boolean,
  ownerLogin: string | undefined,
): boolean {
  if (!enabled) return true;
  const expected = ownerLogin?.trim().toLowerCase() ?? "";
  const actual = headers.get("tailscale-user-login")?.trim().toLowerCase() ?? "";
  return expected.length > 0 && actual === expected;
}
