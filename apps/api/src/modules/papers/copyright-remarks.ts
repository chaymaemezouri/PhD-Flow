import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';

export type CopyrightRemarkStatus = 'OPEN' | 'ADDRESSED' | 'VALIDATED';

export type StoredCopyrightRemark = {
  id: string;
  text: string;
  status: CopyrightRemarkStatus;
  round: number;
  sortOrder: number;
};

type MetaDb = {
  platformMetadata: PrismaClient['platformMetadata'];
};

export function copyrightRemarksKey(paperId: string) {
  return `paper.copyright.remarks.${paperId}`;
}

export function parseCopyrightRemarks(
  value: string | null | undefined,
): StoredCopyrightRemark[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value) as { remarks?: unknown };
    if (!Array.isArray(parsed.remarks)) {
      return [];
    }
    return parsed.remarks
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const row = item as Record<string, unknown>;
        const text = typeof row.text === 'string' ? row.text.trim() : '';
        const id = typeof row.id === 'string' ? row.id : '';
        const status =
          row.status === 'ADDRESSED' || row.status === 'VALIDATED' || row.status === 'OPEN'
            ? row.status
            : 'OPEN';
        const round = typeof row.round === 'number' ? row.round : Number(row.round);
        const sortOrder =
          typeof row.sortOrder === 'number' ? row.sortOrder : Number(row.sortOrder);
        if (!text || !id) {
          return null;
        }
        return {
          id,
          text,
          status,
          round: Number.isFinite(round) && round > 0 ? round : 1,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
        };
      })
      .filter((item): item is StoredCopyrightRemark => Boolean(item));
  } catch {
    return [];
  }
}

export async function readCopyrightRemarks(
  prisma: MetaDb,
  paperId: string,
): Promise<StoredCopyrightRemark[]> {
  const row = await prisma.platformMetadata.findUnique({
    where: { key: copyrightRemarksKey(paperId) },
  });
  return parseCopyrightRemarks(row?.value);
}

export async function writeCopyrightRemarks(
  prisma: MetaDb,
  paperId: string,
  remarks: StoredCopyrightRemark[],
): Promise<void> {
  const key = copyrightRemarksKey(paperId);
  if (remarks.length === 0) {
    await prisma.platformMetadata.deleteMany({ where: { key } });
    return;
  }
  const value = JSON.stringify({ remarks });
  await prisma.platformMetadata.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

export function appendCopyrightRemarkRound(
  existing: StoredCopyrightRemark[],
  texts: string[],
): StoredCopyrightRemark[] {
  const latest = existing.reduce((max, item) => Math.max(max, item.round), 0);
  const round = latest + 1;
  const next = texts.map((text, index) => ({
    id: randomUUID(),
    text,
    status: 'OPEN' as const,
    round,
    sortOrder: index,
  }));
  return [...existing, ...next];
}
