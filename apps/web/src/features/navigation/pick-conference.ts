export interface ListedConference {
  id: string;
  name: string;
  role: string;
  membershipStatus: string;
  status?: string;
  startsOn?: string | null;
}

export function pickConference<T extends ListedConference>(
  items: T[] | undefined,
  selectedId: string | null,
): T | undefined {
  const active = items?.filter((item) => item.membershipStatus === 'ACTIVE') ?? [];
  const chosen = active.find((item) => item.id === selectedId);
  if (chosen) {
    return chosen;
  }
  const published = active.filter((item) => item.status === 'PUBLISHED');
  const pool = published.length > 0 ? published : active;
  return [...pool].sort((left, right) =>
    (left.startsOn ?? '9999').localeCompare(right.startsOn ?? '9999'),
  )[0];
}
