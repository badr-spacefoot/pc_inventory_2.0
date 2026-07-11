function constantTimeEqual(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function hasCpuReleaseSyncToken(
  headers: Headers,
  expectedToken: string,
): boolean {
  if (!expectedToken) return false;
  const bearer = headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim() ?? "";
  const explicit = headers.get("x-cpu-release-sync-token")?.trim() ?? "";
  return constantTimeEqual(bearer, expectedToken) ||
    constantTimeEqual(explicit, expectedToken);
}
