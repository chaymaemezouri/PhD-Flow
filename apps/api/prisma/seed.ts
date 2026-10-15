import { createHash } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import {
  AssignmentStatus,
  ConferenceRole,
  MembershipStatus,
  PaperFileKind,
  PaperStatus,
  PlatformRole,
  PrismaClient,
} from '../src/generated/prisma/client.js';

loadEnv({ path: resolve(process.cwd(), '.env') });
loadEnv({ path: resolve(process.cwd(), '../../.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed the database.');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

const DEMO_PASSWORD = 'Demo-scholar-12';
const DEMO_DOMAIN = '@demo.scholarflow.test';
const SLUG = 'demo-2027';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function main(): Promise<void> {
  await prisma.platformMetadata.upsert({
    where: { key: 'platform.version' },
    update: { value: '0.1.0' },
    create: { key: 'platform.version', value: '0.1.0' },
  });

  await prisma.conference.deleteMany({
    where: {
      OR: [
        { slug: SLUG },
        { slug: { startsWith: 'phase2-' } },
        { slug: { startsWith: 'papers-' } },
        { slug: { startsWith: 'reviews-' } },
      ],
    },
  });
  await prisma.user.deleteMany({
    where: {
      OR: [
        { email: { endsWith: DEMO_DOMAIN } },
        { email: { endsWith: '@example.test' } },
        { email: { endsWith: '@conference.test' } },
        { email: { endsWith: '@paper.test' } },
        { email: { endsWith: '@review.test' } },
      ],
    },
  });

  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const admin = await createUser('admin', passwordHash, {
    firstName: 'Camille',
    lastName: 'Martin',
    academicTitle: 'Maître de conférences',
    institution: 'Université Claude Bernard Lyon 1',
    laboratory: 'LIRIS',
    department: 'Informatique',
    disciplines: ['Informatique', 'Publication scientifique'],
    interests: 'Organisation de conférences, comités de programme, archives ouvertes.',
    biography:
      'Camille Martin dirige le comité d’organisation de ScholarFlow Demo 2027. Elle coordonne les pistes, les échéances et les invitations des évaluateurs.',
    photoPath: '/avatars/admin.jpg',
    orcid: '0000-0001-2345-6781',
    website: 'https://liris.cnrs.fr',
    education: [
      { year: '2008', title: 'Doctorat en informatique', place: 'Université de Lyon' },
      { year: '2012', title: 'Maître de conférences', place: 'Université Claude Bernard Lyon 1' },
      { year: '2024', title: 'Présidente de conférence', place: 'ScholarFlow Demo 2027' },
    ],
  });
  const reviewer = await createUser('reviewer', passwordHash, {
    firstName: 'Julien',
    lastName: 'Moreau',
    academicTitle: 'Chargé de recherche',
    institution: 'CNRS',
    laboratory: 'LIP',
    department: 'Informatique',
    disciplines: ['Systèmes distribués', 'Évaluation par les pairs'],
    interests: 'Relecture en double aveugle, reproductibilité, systèmes de stockage.',
    biography:
      'Julien Moreau évalue les manuscrits de la piste Systèmes. Son évaluation de l’article DEMO-2027-0001 est acceptée.',
    photoPath: '/avatars/reviewer.jpg',
    orcid: '0000-0001-2345-6782',
    website: 'https://lip.ens-lyon.fr',
    education: [
      { year: '2014', title: 'Master informatique', place: 'ENS de Lyon' },
      { year: '2018', title: 'Doctorat en systèmes distribués', place: 'Université de Lyon' },
      { year: '2020', title: 'Chargé de recherche', place: 'CNRS, laboratoire LIP' },
    ],
  });
  const chercheur = await createUser('chercheur', passwordHash, {
    firstName: 'Léa',
    lastName: 'Dubois',
    academicTitle: 'Doctorante',
    institution: 'Université Claude Bernard Lyon 1',
    laboratory: 'LIRIS',
    department: 'Informatique',
    disciplines: ['Informatique', 'Systèmes distribués', 'Données'],
    interests:
      'Identifiants publics de publications, workflows de soumission et archives de conférences.',
    biography:
      'Léa Dubois prépare une thèse sur les identifiants durables des articles scientifiques. Elle a soumis DEMO-2027-0001 et garde un second manuscrit à l’état de brouillon.',
    photoPath: '/avatars/chercheur.jpg',
    orcid: '0000-0001-2345-6783',
    website: 'https://liris.cnrs.fr',
    education: [
      { year: '2018', title: 'Licence informatique', place: 'Université Claude Bernard Lyon 1' },
      { year: '2020', title: 'Master systèmes et données', place: 'ENS de Lyon' },
      { year: '2022', title: 'Doctorat en cours', place: 'LIRIS, Université de Lyon' },
    ],
  });

  const conference = await prisma.conference.create({
    data: {
      slug: SLUG,
      name: 'ScholarFlow Demo 2027',
      shortName: 'DEMO2027',
      description:
        'Conférence de démonstration à Lyon : articles soumis, évaluations ouvertes, décisions et programme.',
      city: 'Lyon',
      country: 'France',
      startsOn: new Date('2027-06-15T00:00:00.000Z'),
      endsOn: new Date('2027-06-17T00:00:00.000Z'),
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      reviewMode: 'DOUBLE_BLIND',
      createdById: admin.id,
      nextPaperNumber: 6,
      tracks: {
        create: [
          { name: 'Systems', code: 'SYS', description: 'Distributed systems and data.', sortOrder: 0 },
          { name: 'Theory', code: 'TH', description: 'Models and proofs.', sortOrder: 1 },
        ],
      },
      deadlines: {
        create: [
          { kind: 'SUBMISSION', dueAt: new Date('2027-03-01T23:59:00.000Z'), label: 'Soumissions' },
          { kind: 'REVIEW', dueAt: new Date('2027-04-15T23:59:00.000Z'), label: 'Évaluations' },
          { kind: 'CAMERA_READY', dueAt: new Date('2027-05-20T23:59:00.000Z'), label: 'Version finale' },
          { kind: 'REGISTRATION', dueAt: new Date('2027-06-01T23:59:00.000Z'), label: 'Inscriptions' },
        ],
      },
      templates: {
        create: [
          {
            kind: 'NOTIFICATION',
            language: 'en',
            subject: 'ScholarFlow Demo 2027',
            body: 'This template is stored for a later notification. It is not sent by itself.',
          },
          {
            kind: 'COPYRIGHT',
            language: 'fr',
            subject: 'Cession de droits',
            body: 'Je cède à la conférence les droits de publication de l’article accepté et je confirme que le travail est original.',
          },
        ],
      },
      memberships: {
        create: [
          { userId: admin.id, role: ConferenceRole.CHAIR, status: MembershipStatus.ACTIVE },
          { userId: chercheur.id, role: ConferenceRole.AUTHOR, status: MembershipStatus.ACTIVE },
          { userId: reviewer.id, role: ConferenceRole.REVIEWER, status: MembershipStatus.ACTIVE },
        ],
      },
    },
    include: { tracks: true },
  });

  const systems = conference.tracks.find((item) => item.code === 'SYS');
  const theory = conference.tracks.find((item) => item.code === 'TH');

  await prisma.paper.create({
    data: {
      conferenceId: conference.id,
      trackId: theory?.id,
      title: 'Brouillon sur les archives ouvertes',
      abstract: 'Ce brouillon n’est pas encore soumis. Il sert à voir l’état DRAFT.',
      keywords: ['brouillon', 'archives'],
      status: PaperStatus.DRAFT,
      createdById: chercheur.id,
      authors: { create: authorOf(chercheur) },
      events: { create: { toStatus: PaperStatus.DRAFT, actorId: chercheur.id } },
    },
  });

  const invited = await submittedPaper(conference.id, systems?.id, chercheur, {
    publicId: 'DEMO-2027-0002',
    title: 'Clock skew in harbour logs',
    abstract: 'Mesures de décalage d’horloge sur les journaux portuaires. Article en cours d’évaluation.',
    keywords: ['horloges', 'journaux'],
  });
  await addFile(conference.id, invited.id, PaperFileKind.MANUSCRIPT, 'clocks.pdf', chercheur.id);
  await assign(invited.id, reviewer.id, admin.id, AssignmentStatus.ACCEPTED, 'accepted-clocks');

  const overdue = await submittedPaper(conference.id, systems?.id, chercheur, {
    publicId: 'DEMO-2027-0003',
    title: 'Late measurements from the quay',
    abstract: 'Relevés tardifs du quai. L’évaluation est en retard.',
    keywords: ['quai', 'mesures'],
  });
  await addFile(conference.id, overdue.id, PaperFileKind.MANUSCRIPT, 'quay.pdf', chercheur.id);
  await assign(overdue.id, reviewer.id, admin.id, AssignmentStatus.OVERDUE, 'overdue-quay', {
    createdAt: new Date('2026-09-01T08:00:00.000Z'),
  });

  const waiting = await submittedPaper(conference.id, theory?.id, chercheur, {
    publicId: 'DEMO-2027-0004',
    title: 'A note on public identifiers',
    abstract: 'Note courte sur les identifiants publics. L’invitation d’évaluation est encore ouverte.',
    keywords: ['identifiants'],
  });
  await addFile(conference.id, waiting.id, PaperFileKind.MANUSCRIPT, 'identifiers.pdf', chercheur.id);
  await assign(waiting.id, reviewer.id, admin.id, AssignmentStatus.INVITED, 'invited-identifiers');

  const conditional = await submittedPaper(conference.id, theory?.id, chercheur, {
    publicId: 'DEMO-2027-0005',
    title: 'Sensor traces under a conditional acceptance',
    abstract: 'Traces de capteurs acceptées sous condition, déjà placées dans le programme.',
    keywords: ['capteurs', 'traces'],
  });
  await addFile(conference.id, conditional.id, PaperFileKind.MANUSCRIPT, 'sensors.pdf', chercheur.id);
  await prisma.similarityReport.create({
    data: {
      paperId: conditional.id,
      percentage: 24,
      note: 'Au-dessus du seuil de 20 %.',
    },
  });
  await prisma.decision.create({
    data: {
      paperId: conditional.id,
      outcome: 'CONDITIONALLY_ACCEPTED',
      letter:
        'DEMO-2027-0005 est accepté sous condition. Merci de préciser la provenance des traces dans la version finale.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-10T16:00:00.000Z'),
      decidedById: admin.id,
    },
  });

  const accepted = await submittedPaper(conference.id, systems?.id, chercheur, {
    publicId: 'DEMO-2027-0001',
    title: 'Tides, harbours, and the public paper id',
    abstract:
      'Manuscrit de démonstration accepté, avec version finale, rapport de similarité et cession de droits.',
    keywords: ['demo', 'tides'],
  });
  await addFile(
    conference.id,
    accepted.id,
    PaperFileKind.MANUSCRIPT,
    'tides.pdf',
    chercheur.id,
    new Date('2026-10-01T09:00:00.000Z'),
  );
  await addFile(
    conference.id,
    accepted.id,
    PaperFileKind.EDITABLE,
    'tides-editable.pdf',
    chercheur.id,
    new Date('2026-10-07T09:00:00.000Z'),
  );
  await addFile(
    conference.id,
    accepted.id,
    PaperFileKind.CAMERA_READY,
    'tides-final.pdf',
    chercheur.id,
    new Date('2026-10-08T09:00:00.000Z'),
  );
  await addFile(
    conference.id,
    accepted.id,
    PaperFileKind.SIMILARITY,
    'tides-similarity.pdf',
    chercheur.id,
    new Date('2026-10-09T09:00:00.000Z'),
  );
  await addFile(
    conference.id,
    accepted.id,
    PaperFileKind.COPYRIGHT,
    'tides-copyright.pdf',
    chercheur.id,
    new Date('2026-10-10T09:00:00.000Z'),
  );
  await assign(accepted.id, reviewer.id, admin.id, AssignmentStatus.COMPLETED, 'completed-tides', {
    respondedAt: new Date('2026-10-02T12:30:00.000Z'),
    form: {
      recommendation: 'ACCEPT',
      score: 8,
      confidence: 4,
      commentsToAuthor:
        'The public identifier stays stable and the argument is clear enough to accept.',
      commentsToCommittee: 'No remaining conflict after the declared checks.',
    },
  });
  await prisma.decision.create({
    data: {
      paperId: accepted.id,
      outcome: 'ACCEPTED',
      letter:
        'The committee accepts DEMO-2027-0001. The camera-ready file, the similarity report and the copyright form are on record.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-11T16:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.similarityReport.create({
    data: {
      paperId: accepted.id,
      percentage: 12.4,
      note: 'Rapport déposé et vérifié par la présidence.',
      verifiedAt: new Date('2026-10-11T18:00:00.000Z'),
    },
  });
  await prisma.copyrightRecord.create({
    data: { paperId: accepted.id, status: 'VALIDATED' },
  });
  await prisma.paper.update({
    where: { id: accepted.id },
    data: { templateValidatedAt: new Date('2026-10-11T17:00:00.000Z') },
  });

  const amphitheatre = await prisma.room.create({
    data: { conferenceId: conference.id, name: 'Amphi A', capacity: 80 },
  });
  const workshop = await prisma.room.create({
    data: { conferenceId: conference.id, name: 'Salle B', capacity: 40 },
  });
  const morning = await prisma.programSession.create({
    data: {
      conferenceId: conference.id,
      roomId: amphitheatre.id,
      title: 'Systems morning',
      startsAt: new Date('2027-06-15T09:00:00.000Z'),
      endsAt: new Date('2027-06-15T10:30:00.000Z'),
    },
  });
  const afternoon = await prisma.programSession.create({
    data: {
      conferenceId: conference.id,
      roomId: workshop.id,
      title: 'Theory afternoon',
      startsAt: new Date('2027-06-15T14:00:00.000Z'),
      endsAt: new Date('2027-06-15T15:30:00.000Z'),
    },
  });
  await prisma.presentation.create({
    data: {
      sessionId: morning.id,
      paperId: accepted.id,
      score: 8,
      comment: 'Exposé clair, questions sur l’identifiant public.',
    },
  });
  await prisma.presentation.create({
    data: {
      sessionId: afternoon.id,
      paperId: conditional.id,
      score: 6,
      comment: 'À préciser pendant la session.',
    },
  });

  await prisma.registration.createMany({
    data: [
      {
        conferenceId: conference.id,
        userId: chercheur.id,
        status: 'VERIFIED',
        paymentStatus: 'VERIFIED',
      },
      {
        conferenceId: conference.id,
        userId: reviewer.id,
        status: 'REQUESTED',
        paymentStatus: 'PENDING',
      },
      {
        conferenceId: conference.id,
        userId: admin.id,
        status: 'VERIFIED',
        paymentStatus: 'NOT_REQUIRED',
      },
    ],
  });
}

interface DemoProfile {
  firstName: string;
  lastName: string;
  academicTitle: string;
  institution: string;
  laboratory: string;
  department: string;
  disciplines: string[];
  interests: string;
  biography: string;
  photoPath: string;
  orcid: string;
  website: string;
  education: Array<{ year: string; title: string; place: string }>;
}

async function createUser(localPart: string, passwordHash: string, profile: DemoProfile) {
  return prisma.user.create({
    data: {
      email: `${localPart}${DEMO_DOMAIN}`,
      passwordHash,
      platformRole: PlatformRole.RESEARCHER,
      emailVerifiedAt: new Date(),
      profile: {
        create: {
          ...profile,
          city: 'Lyon',
          country: 'France',
          language: 'fr',
        },
      },
    },
  });
}

function authorOf(user: { email: string }) {
  return {
    position: 1,
    firstName: 'Léa',
    lastName: 'Dubois',
    email: user.email,
    affiliation: 'LIRIS, Université de Lyon',
    corresponding: true,
  };
}

async function submittedPaper(
  conferenceId: string,
  trackId: string | undefined,
  author: { id: string; email: string },
  paper: { publicId: string; title: string; abstract: string; keywords: string[] },
) {
  return prisma.paper.create({
    data: {
      conferenceId,
      trackId,
      publicId: paper.publicId,
      title: paper.title,
      abstract: paper.abstract,
      keywords: paper.keywords,
      status: PaperStatus.SUBMITTED,
      submittedAt: new Date('2026-10-11T12:00:00.000Z'),
      createdById: author.id,
      authors: { create: authorOf(author) },
      events: {
        create: [
          { toStatus: PaperStatus.DRAFT, actorId: author.id },
          { fromStatus: PaperStatus.DRAFT, toStatus: PaperStatus.SUBMITTED, actorId: author.id },
        ],
      },
    },
  });
}

async function addFile(
  conferenceId: string,
  paperId: string,
  kind: PaperFileKind,
  name: string,
  uploadedById: string,
  createdAt?: Date,
) {
  const storageKey = `conferences/${conferenceId}/papers/${paperId}/${kind.toLowerCase()}.pdf`;
  await prisma.paperFile.create({
    data: {
      paperId,
      kind,
      storageKey,
      originalName: name,
      contentType: 'application/pdf',
      sizeBytes: PDF.length,
      sha256: createHash('sha256').update(PDF).digest('hex'),
      uploadedById,
      createdAt,
    },
  });
  await storePdf(storageKey);
}

async function assign(
  paperId: string,
  reviewerId: string,
  invitedById: string,
  status: AssignmentStatus,
  token: string,
  extra?: {
    createdAt?: Date;
    respondedAt?: Date;
    form?: {
      recommendation: 'ACCEPT' | 'WEAK_ACCEPT' | 'BORDERLINE' | 'WEAK_REJECT' | 'REJECT';
      score: number;
      confidence: number;
      commentsToAuthor: string;
      commentsToCommittee: string;
    };
  },
) {
  await prisma.reviewAssignment.create({
    data: {
      paperId,
      reviewerId,
      status,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date('2027-04-01T00:00:00.000Z'),
      respondedAt: extra?.respondedAt ?? (status === AssignmentStatus.INVITED ? null : new Date('2026-10-11T12:30:00.000Z')),
      invitedById,
      createdAt: extra?.createdAt,
      form: extra?.form ? { create: extra.form } : undefined,
    },
  });
}

async function storePdf(key: string): Promise<void> {
  const port = process.env.MINIO_PORT ?? '9000';
  const client = new S3Client({
    region: 'us-east-1',
    endpoint: `http://127.0.0.1:${port}`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.MINIO_ROOT_USER ?? 'scholarflow',
      secretAccessKey: process.env.MINIO_ROOT_PASSWORD ?? 'scholarflow-dev-secret',
    },
  });
  await client.send(
    new PutObjectCommand({
      Bucket: process.env.MINIO_BUCKET ?? 'scholarflow',
      Key: key,
      Body: PDF,
      ContentType: 'application/pdf',
    }),
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
