const roleRank = ['CHAIR', 'ADMINISTRATOR', 'COMMITTEE', 'REVIEWER', 'AUTHOR'] as const;

export function isCreatedAdmin(academicTitle: string | null | undefined): boolean {
  return academicTitle === 'Admin';
}

export function isSessionChair(academicTitle: string | null | undefined): boolean {
  return academicTitle === 'Session chair';
}

export function homePathFor(
  roles: string[],
  options?: { createdAdmin?: boolean; sessionChair?: boolean },
): string {
  if (options?.sessionChair) {
    return '/workspace/session-chair';
  }
  if (options?.createdAdmin) {
    return '/workspace/administrator';
  }
  const active = roleRank.find((role) => roles.includes(role));
  if (active === 'CHAIR' || active === 'ADMINISTRATOR') {
    return '/workspace/administrator';
  }
  if (active === 'COMMITTEE') {
    return '/workspace/committee';
  }
  if (active === 'REVIEWER') {
    return '/workspace/reviewer';
  }
  return '/workspace/author';
}

export function isRoleHome(pathname: string): boolean {
  return /^\/workspace\/(author|reviewer|committee|administrator|system|conference-access)(\/)?$/.test(
    pathname,
  );
}
