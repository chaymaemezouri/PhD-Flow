const roleRank = ['CHAIR', 'ADMINISTRATOR', 'COMMITTEE', 'REVIEWER', 'AUTHOR'] as const;

export function homePathFor(roles: string[]): string {
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
  return /^\/workspace\/(author|reviewer|committee|administrator|system)$/.test(pathname);
}
