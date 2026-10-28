import { ForbiddenException } from '@nestjs/common';
import {
  ConferenceRole,
  MembershipStatus,
  PlatformRole,
  type PrismaClient,
} from '../../generated/prisma/client.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';

/** Workflow steps a chair can delegate to a sub-admin. */
export const SUBADMIN_STAGES = [
  'scope',
  'assignments',
  'decisions',
  'registration',
  'program',
  'camera',
  'publication',
  'team',
] as const;

export type SubadminStage = (typeof SUBADMIN_STAGES)[number];

const STAGE_SET = new Set<string>(SUBADMIN_STAGES);

type MetaDb = {
  platformMetadata: PrismaClient['platformMetadata'];
};

type MembershipLite = {
  userId: string;
  role: ConferenceRole;
  status: MembershipStatus;
};

export function subadminStagesKey(conferenceId: string) {
  return `conference.subadminStages.${conferenceId}`;
}

export function parseSubadminStages(value: unknown): SubadminStage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is SubadminStage => STAGE_SET.has(String(item)));
}

export async function readConferenceSubadminStages(
  prisma: MetaDb,
  conferenceId: string,
): Promise<Record<string, SubadminStage[]>> {
  const row = await prisma.platformMetadata.findUnique({
    where: { key: subadminStagesKey(conferenceId) },
  });
  if (!row?.value) {
    return {};
  }
  try {
    const parsed = JSON.parse(row.value) as Record<string, unknown>;
    const out: Record<string, SubadminStage[]> = {};
    for (const [userId, stages] of Object.entries(parsed)) {
      out[userId] = parseSubadminStages(stages);
    }
    return out;
  } catch {
    return {};
  }
}

export async function readSubadminStages(
  prisma: MetaDb,
  conferenceId: string,
  userId: string,
): Promise<SubadminStage[]> {
  const map = await readConferenceSubadminStages(prisma, conferenceId);
  return map[userId] ?? [];
}

export async function writeSubadminStages(
  prisma: MetaDb,
  conferenceId: string,
  userId: string,
  stages: SubadminStage[],
): Promise<SubadminStage[]> {
  const unique = [...new Set(parseSubadminStages(stages))];
  const map = await readConferenceSubadminStages(prisma, conferenceId);
  if (unique.length === 0) {
    delete map[userId];
  } else {
    map[userId] = unique;
  }
  const key = subadminStagesKey(conferenceId);
  if (Object.keys(map).length === 0) {
    await prisma.platformMetadata.deleteMany({ where: { key } });
  } else {
    const value = JSON.stringify(map);
    await prisma.platformMetadata.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  return unique;
}

export function membershipRole(
  actor: AuthenticatedUser,
  memberships: MembershipLite[],
): ConferenceRole | null {
  const row = memberships.find(
    (item) =>
      item.userId === actor.id && item.status === MembershipStatus.ACTIVE,
  );
  return row?.role ?? null;
}

/**
 * Chair / system admin / committee: all stages.
 * Sub-admin (ADMINISTRATOR): only explicitly assigned stages.
 */
export async function actorHasSubadminStage(
  prisma: MetaDb,
  actor: AuthenticatedUser,
  memberships: MembershipLite[],
  conferenceId: string,
  stage: SubadminStage,
): Promise<boolean> {
  if (actor.platformRole === PlatformRole.SYSTEM_ADMIN) {
    return true;
  }
  const role = membershipRole(actor, memberships);
  if (role === ConferenceRole.CHAIR || role === ConferenceRole.COMMITTEE) {
    return true;
  }
  if (role !== ConferenceRole.ADMINISTRATOR) {
    return false;
  }
  const stages = await readSubadminStages(prisma, conferenceId, actor.id);
  return stages.includes(stage);
}

export async function assertSubadminStage(
  prisma: MetaDb,
  actor: AuthenticatedUser,
  memberships: MembershipLite[],
  conferenceId: string,
  stage: SubadminStage,
): Promise<void> {
  if (await actorHasSubadminStage(prisma, actor, memberships, conferenceId, stage)) {
    return;
  }
  throw new ForbiddenException('This step is not assigned to this sub-admin');
}
