export function isSessionChairTitle(title?: string | null): boolean {
  return title === 'Session chair';
}

export function splitPresentationStaff<
  T extends { id: string; profile?: { academicTitle?: string | null } | null },
>(ids: string[], users: T[]): { chairs: T[]; reviewers: T[] } {
  const byId = new Map(users.map((user) => [user.id, user]));
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((user): user is T => Boolean(user));
  const dedicated = ordered.filter((user) =>
    isSessionChairTitle(user.profile?.academicTitle),
  );
  const others = ordered.filter(
    (user) => !isSessionChairTitle(user.profile?.academicTitle),
  );
  if (dedicated.length === 0 && ordered.length > 0) {
    return { chairs: [ordered[0]!], reviewers: ordered.slice(1) };
  }
  return { chairs: dedicated, reviewers: others };
}

export function staffSummary(
  users: { id: string; profile?: { firstName?: string | null; lastName?: string | null } | null }[],
  actorId: string,
) {
  return users.map((user) => ({
    userId: user.id,
    name: `${user.profile?.firstName ?? ''} ${user.profile?.lastName ?? ''}`.trim(),
    mine: user.id === actorId,
  }));
}
