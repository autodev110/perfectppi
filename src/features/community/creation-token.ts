export function normalizeCommunityCreationToken(token: string): string {
  return token.toLowerCase();
}

export function communityCreationTokensMatch(
  first: string | null | undefined,
  second: string | null | undefined,
): boolean {
  return Boolean(
    first
    && second
    && normalizeCommunityCreationToken(first) === normalizeCommunityCreationToken(second),
  );
}
