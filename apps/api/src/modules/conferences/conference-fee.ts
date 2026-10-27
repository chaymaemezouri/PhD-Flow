import type { PrismaClient } from '../../generated/prisma/client.js';

export type ConferenceFee = { amount: number; currency: string };

type FeeDb = {
  platformMetadata: PrismaClient['platformMetadata'];
};

export function conferenceFeeKey(conferenceId: string) {
  return `conference.fee.${conferenceId}`;
}

export function parseConferenceFee(value: string | null | undefined): ConferenceFee | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as { amount?: unknown; currency?: unknown };
    const amount = typeof parsed.amount === 'number' ? parsed.amount : Number(parsed.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return null;
    }
    const currency =
      typeof parsed.currency === 'string' && /^[A-Z]{3}$/i.test(parsed.currency)
        ? parsed.currency.toUpperCase()
        : 'EUR';
    return { amount, currency };
  } catch {
    return null;
  }
}

export async function readConferenceFee(
  prisma: FeeDb,
  conferenceId: string,
): Promise<ConferenceFee | null> {
  const row = await prisma.platformMetadata.findUnique({
    where: { key: conferenceFeeKey(conferenceId) },
  });
  return parseConferenceFee(row?.value);
}

export async function writeConferenceFee(
  prisma: FeeDb,
  conferenceId: string,
  fee: ConferenceFee | null,
): Promise<void> {
  const key = conferenceFeeKey(conferenceId);
  if (!fee) {
    await prisma.platformMetadata.deleteMany({ where: { key } });
    return;
  }
  const value = JSON.stringify({ amount: fee.amount, currency: fee.currency });
  await prisma.platformMetadata.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}
