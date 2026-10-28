import type { PrismaClient } from '../../generated/prisma/client.js';

export type PresentationLanguage = 'FR' | 'AR' | 'EN';

const LANGUAGES = new Set<PresentationLanguage>(['FR', 'AR', 'EN']);

type LangDb = {
  platformMetadata: PrismaClient['platformMetadata'];
};

export function presentationLanguageKey(paperId: string) {
  return `paper.presentationLanguage.${paperId}`;
}

export function parsePresentationLanguage(
  value: string | null | undefined,
): PresentationLanguage | null {
  if (!value) {
    return null;
  }
  const next = value.trim().toUpperCase();
  return LANGUAGES.has(next as PresentationLanguage)
    ? (next as PresentationLanguage)
    : null;
}

export async function readPresentationLanguage(
  prisma: LangDb,
  paperId: string,
): Promise<PresentationLanguage | null> {
  const row = await prisma.platformMetadata.findUnique({
    where: { key: presentationLanguageKey(paperId) },
  });
  return parsePresentationLanguage(row?.value);
}

export async function readPresentationLanguages(
  prisma: LangDb,
  paperIds: string[],
): Promise<Map<string, PresentationLanguage>> {
  const map = new Map<string, PresentationLanguage>();
  if (paperIds.length === 0) {
    return map;
  }
  const keys = paperIds.map(presentationLanguageKey);
  const rows = await prisma.platformMetadata.findMany({
    where: { key: { in: keys } },
  });
  for (const row of rows) {
    const paperId = row.key.replace(/^paper\.presentationLanguage\./, '');
    const language = parsePresentationLanguage(row.value);
    if (language) {
      map.set(paperId, language);
    }
  }
  return map;
}

export async function writePresentationLanguage(
  prisma: LangDb,
  paperId: string,
  language: PresentationLanguage | null,
): Promise<void> {
  const key = presentationLanguageKey(paperId);
  if (!language) {
    await prisma.platformMetadata.deleteMany({ where: { key } });
    return;
  }
  await prisma.platformMetadata.upsert({
    where: { key },
    update: { value: language },
    create: { key, value: language },
  });
}
