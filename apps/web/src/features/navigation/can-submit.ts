const organizingRoles = new Set(['CHAIR', 'ADMINISTRATOR', 'COMMITTEE', 'REVIEWER']);

interface MembershipLike {
  role: string;
  membershipStatus: string;
}

export function canSubmitToConference(
  superadmin: boolean,
  memberships: MembershipLike[],
  item: MembershipLike,
): boolean {
  if (superadmin) {
    return false;
  }
  if (item.membershipStatus === 'ACTIVE' && item.role === 'AUTHOR') {
    return true;
  }
  if (item.membershipStatus !== 'OPEN') {
    return false;
  }
  return !memberships.some(
    (membership) =>
      membership.membershipStatus === 'ACTIVE' && organizingRoles.has(membership.role),
  );
}

export function canStartSubmission(
  superadmin: boolean,
  memberships: MembershipLike[] | undefined,
): boolean {
  if (!memberships || superadmin) {
    return false;
  }
  return memberships.some((item) => canSubmitToConference(false, memberships, item));
}
