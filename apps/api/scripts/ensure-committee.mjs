import { config as loadEnv } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  ConferenceRole,
  MembershipStatus,
  PlatformRole,
  PrismaClient,
} from '../dist/generated/prisma/client.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: resolve(root, '../../.env') });
loadEnv({ path: resolve(root, '.env') });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const password = 'Demo-scholar-12';
const email = 'committee@demo.scholarflow.test';

const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

let user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  user = await prisma.user.create({
    data: {
      email,
      passwordHash: hash,
      issuedPassword: password,
      platformRole: PlatformRole.RESEARCHER,
      emailVerifiedAt: new Date(),
      profile: {
        create: {
          firstName: 'Nora',
          lastName: 'Benali',
          academicTitle: 'Professeure',
          institution: 'INSA Lyon',
          laboratory: 'CITI',
          department: 'Informatique',
          disciplines: ['Reseaux'],
          interests: 'Comite de programme',
          biography: 'Membre du comite, invitee par l admin.',
          photoPath: '',
          orcid: '',
          website: '',
          education: [],
          city: 'Lyon',
          country: 'France',
          language: 'fr',
        },
      },
    },
  });
  console.log('created', user.id);
} else {
  console.log('exists', user.id);
}

const conf = await prisma.conference.findFirst({ where: { slug: 'demo-2027' } });
if (!conf) {
  console.log('no demo conference');
  await prisma.$disconnect();
  process.exit(0);
}

await prisma.membership.upsert({
  where: { conferenceId_userId: { conferenceId: conf.id, userId: user.id } },
  create: {
    conferenceId: conf.id,
    userId: user.id,
    role: ConferenceRole.COMMITTEE,
    status: MembershipStatus.ACTIVE,
  },
  update: { role: ConferenceRole.COMMITTEE, status: MembershipStatus.ACTIVE },
});
console.log('membership ok on', conf.slug);
await prisma.$disconnect();
