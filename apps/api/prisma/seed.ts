import { createHash } from 'node:crypto';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import argon2 from 'argon2';
import {
  AssignmentStatus,
  CameraReadyStatus,
  ConferenceRole,
  CopyrightStageStatus,
  MembershipStatus,
  PaperFileKind,
  PaperStatus,
  PlatformRole,
  PrismaClient,
  RemarkStatus,
  SimilarityStatus,
  SlidesStatus,
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
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function main(): Promise<void> {
  await wipeDemos();

  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const superadmin = await createUser(
    'superadmin',
    passwordHash,
    {
      firstName: 'Super',
      lastName: 'Admin',
      academicTitle: 'Superadmin',
      institution: 'PapersManagement',
      laboratory: 'Plateforme',
      department: 'Accès global',
      disciplines: ['Publication scientifique'],
      interests: 'Comptes administrateurs et création des conférences.',
      biography: 'Crée les admins et les conférences.',
      photoPath: '',
      orcid: '',
      website: '',
      education: [],
    },
    PlatformRole.SYSTEM_ADMIN,
  );

  const admin = await createUser('admin', passwordHash, {
    firstName: 'Camille',
    lastName: 'Martin',
    academicTitle: 'Maître de conférences',
    institution: 'Université Claude Bernard Lyon 1',
    laboratory: 'LIRIS',
    department: 'Informatique',
    disciplines: ['Informatique', 'Publication scientifique'],
    interests: 'Organisation de conférences et comités.',
    biography: 'Présidente de PapersManagement Demo 2027.',
    photoPath: '/avatars/admin.jpg',
    orcid: '0000-0001-2345-6781',
    website: 'https://liris.cnrs.fr',
    education: [
      { year: '2008', title: 'Doctorat en informatique', place: 'Université de Lyon' },
    ],
  });

  const committee = await createUser('committee', passwordHash, {
    firstName: 'Nora',
    lastName: 'Benali',
    academicTitle: 'Professeure',
    institution: 'INSA Lyon',
    laboratory: 'CITI',
    department: 'Informatique',
    disciplines: ['Réseaux', 'Comité de programme'],
    interests: 'Scope, évaluations, décisions.',
    biography: 'Membre du comité de programme.',
    photoPath: '/avatars/committee.jpg',
    orcid: '0000-0001-2345-6785',
    website: 'https://www.insa-lyon.fr',
    education: [{ year: '2005', title: 'Doctorat en réseaux', place: 'INSA Lyon' }],
  });

  const subAdmin = await createUser('sousadmin', passwordHash, {
    firstName: 'Amine',
    lastName: 'Khalil',
    academicTitle: 'Sous-admin',
    institution: 'Université de Lyon',
    laboratory: 'LIRIS',
    department: 'Informatique',
    disciplines: ['Organisation'],
    interests: 'Gestion opérationnelle de conférence.',
    biography: 'Sous-administrateur de PapersManagement Demo 2027.',
    photoPath: '',
    orcid: '',
    website: '',
    education: [],
  });

  const reviewer = await createUser('reviewer', passwordHash, {
    firstName: 'Julien',
    lastName: 'Moreau',
    academicTitle: 'Chargé de recherche',
    institution: 'CNRS',
    laboratory: 'LIP',
    department: 'Informatique',
    disciplines: ['Systèmes distribués'],
    interests: 'Évaluation par les pairs.',
    biography: 'Évaluateur de la piste Systèmes.',
    photoPath: '/avatars/reviewer.jpg',
    orcid: '0000-0001-2345-6782',
    website: 'https://lip.ens-lyon.fr',
    education: [{ year: '2018', title: 'Doctorat', place: 'Université de Lyon' }],
  });

  const reviewer2 = await createUser('reviewer2', passwordHash, {
    firstName: 'Inès',
    lastName: 'Lambert',
    academicTitle: 'Maîtresse de conférences',
    institution: 'INSA Lyon',
    laboratory: 'CITI',
    department: 'Informatique',
    disciplines: ['Données'],
    interests: 'Relecture et reproductibilité.',
    biography: 'Seconde évaluatrice pour les articles multi-reviews.',
    photoPath: '',
    orcid: '',
    website: '',
    education: [],
  });

  const sessionChair = await createUser('sessionchair', passwordHash, {
    firstName: 'Hugo',
    lastName: 'Perrin',
    academicTitle: 'Session chair',
    institution: 'Université de Lyon',
    laboratory: 'LIRIS',
    department: 'Informatique',
    disciplines: ['Présentation'],
    interests: 'Animation de session.',
    biography: 'Session chair dédié : valide Presented et laisse des remarques.',
    photoPath: '',
    orcid: '',
    website: '',
    education: [],
  });

  const author = await createUser('chercheur', passwordHash, {
    firstName: 'Léa',
    lastName: 'Dubois',
    academicTitle: 'Doctorante',
    institution: 'Université Claude Bernard Lyon 1',
    laboratory: 'LIRIS',
    department: 'Informatique',
    disciplines: ['Informatique', 'Systèmes'],
    interests: 'Workflows de soumission.',
    biography: 'Auteure principale des démos.',
    photoPath: '/avatars/chercheur.jpg',
    orcid: '0000-0001-2345-6783',
    website: 'https://liris.cnrs.fr',
    education: [{ year: '2022', title: 'Doctorat en cours', place: 'LIRIS' }],
  });

  const author2 = await createUser('auteur2', passwordHash, {
    firstName: 'Samir',
    lastName: 'Haddad',
    academicTitle: 'Doctorant',
    institution: 'Université Claude Bernard Lyon 1',
    laboratory: 'LIRIS',
    department: 'Informatique',
    disciplines: ['Informatique'],
    interests: 'Paiement et inscription.',
    biography: 'Compte démo pour le reçu en vérification.',
    photoPath: '',
    orcid: '',
    website: '',
    education: [],
  });

  const lea = person(author, 'Léa', 'Dubois', 'LIRIS, Université de Lyon');
  const samir = person(author2, 'Samir', 'Haddad', 'LIRIS, Université de Lyon');

  const demoA = await seedConferenceA({
    passwordHash,
    admin,
    subAdmin,
    committee,
    reviewer,
    reviewer2,
    sessionChair,
    author,
    author2,
    lea,
    samir,
  });

  const demoB = await seedConferenceB({
    passwordHash,
    admin,
    committee,
    reviewer,
    sessionChair,
    author,
    lea,
  });

  console.log(`
Seed OK — 2 demos complètes

Mot de passe (tous) : ${DEMO_PASSWORD}

Comptes :
  ${superadmin.email.padEnd(40)} Superadmin
  ${admin.email.padEnd(40)} Admin / chair
  ${subAdmin.email.padEnd(40)} Sous-admin
  ${committee.email.padEnd(40)} Comité
  ${reviewer.email.padEnd(40)} Évaluateur
  ${reviewer2.email.padEnd(40)} Évaluateur 2
  ${sessionChair.email.padEnd(40)} Session chair
  ${author.email.padEnd(40)} Auteur Léa
  ${author2.email.padEnd(40)} Auteur Samir (paiement under check)

Demo 1 — ${demoA.name} (${demoA.shortName})
  A-01  Brouillon
  A-02  Soumis, invitation revue ouverte
  A-03  Revue acceptée / en cours
  A-04  Revue en retard
  A-05  Scope refusé
  A-06  Mods mineures + checklist
  A-07  Mods majeures + révision déposée
  A-08  Rejeté
  A-09  Accepté, paiement under check (Samir)
  A-10  Accepté, présentation OPEN
  A-11  Au programme, à présenter (session chair)
  A-12  Presented + camera ready OPEN
  A-13  Camera ready under checking
  A-14  Similarity + copyright en cours
  A-15  Publié avec DOI (parcours complet)

Demo 2 — ${demoB.name} (${demoB.shortName})
  B-01  Soumis, scope PENDING
  B-02  Accepté + programmé (session chair)
  B-03  Publié (2e conférence)
  + invitations externes encore ouvertes (collègue / évaluateur)
`);
}

async function wipeDemos(): Promise<void> {
  await prisma.platformMetadata.upsert({
    where: { key: 'platform.version' },
    update: { value: '0.1.0' },
    create: { key: 'platform.version', value: '0.1.0' },
  });

  const demoUsers = await prisma.user.findMany({
    where: {
      OR: [
        { email: { endsWith: DEMO_DOMAIN } },
        { email: { endsWith: '@example.test' } },
        { email: { endsWith: '@conference.test' } },
        { email: { endsWith: '@paper.test' } },
        { email: { endsWith: '@review.test' } },
        { email: 'chaire@gmail.com' },
      ],
    },
    select: { id: true },
  });
  const demoUserIds = demoUsers.map((user) => user.id);
  if (demoUserIds.length > 0) {
    await prisma.paper.deleteMany({ where: { createdById: { in: demoUserIds } } });
  }
  await prisma.conference.deleteMany({
    where: {
      OR: [
        { slug: 'demo-2027' },
        { slug: 'doctorales-2027' },
        { slug: 'atelier-brouillon' },
        { slug: { startsWith: 'phase2-' } },
        { slug: { startsWith: 'papers-' } },
        { slug: { startsWith: 'reviews-' } },
        ...(demoUserIds.length > 0 ? [{ createdById: { in: demoUserIds } }] : []),
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
        { email: 'chaire@gmail.com' },
      ],
    },
  });
  await prisma.platformMetadata.deleteMany({
    where: {
      OR: [
        { key: { startsWith: 'conference.fee.' } },
        { key: { startsWith: 'paper.presentationLanguage.' } },
      ],
    },
  });
}

async function seedConferenceA(input: {
  passwordHash: string;
  admin: { id: string; email: string };
  subAdmin: { id: string };
  committee: { id: string };
  reviewer: { id: string };
  reviewer2: { id: string };
  sessionChair: { id: string };
  author: { id: string };
  author2: { id: string };
  lea: SeedPerson;
  samir: SeedPerson;
}) {
  const conference = await prisma.conference.create({
    data: {
      slug: 'demo-2027',
      name: 'PapersManagement Demo 2027',
      shortName: 'DEMO2027',
      description:
        'Première démo complète : tous les états du parcours, de la soumission à la publication.',
      city: 'Lyon',
      country: 'France',
      startsOn: new Date('2027-06-15T00:00:00.000Z'),
      endsOn: new Date('2027-06-17T00:00:00.000Z'),
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      reviewMode: 'DOUBLE_BLIND',
      paymentsEnabled: true,
      accessPasswordHash: input.passwordHash,
      accessPasswordNote: DEMO_PASSWORD,
      createdById: input.admin.id,
      nextPaperNumber: 16,
      tracks: {
        create: [
          {
            name: 'Systèmes',
            code: 'SYS',
            description: 'Systèmes et données.',
            sortOrder: 0,
          },
          {
            name: 'Théorie',
            code: 'TH',
            description: 'Modèles et preuves.',
            sortOrder: 1,
          },
        ],
      },
      deadlines: {
        create: [
          {
            kind: 'SUBMISSION',
            dueAt: new Date('2027-03-01T23:59:00.000Z'),
            label: 'Soumissions',
          },
          {
            kind: 'REVIEW',
            dueAt: new Date('2027-04-15T23:59:00.000Z'),
            label: 'Évaluations',
          },
          {
            kind: 'NOTIFICATION',
            dueAt: new Date('2027-05-01T23:59:00.000Z'),
            label: 'Décisions',
          },
          {
            kind: 'CAMERA_READY',
            dueAt: new Date('2027-05-20T23:59:00.000Z'),
            label: 'Version finale',
          },
          {
            kind: 'REGISTRATION',
            dueAt: new Date('2027-06-01T23:59:00.000Z'),
            label: 'Inscriptions',
          },
        ],
      },
      templates: {
        create: [
          {
            kind: 'COPYRIGHT',
            language: 'fr',
            subject: 'Cession de droits',
            body: 'Je cède à la conférence les droits de publication de l’article accepté.',
          },
          {
            kind: 'DECISION_LETTER',
            language: 'fr',
            subject: 'Décision sur votre article',
            body: 'Le comité a rendu sa décision.',
          },
        ],
      },
      memberships: {
        create: [
          {
            userId: input.admin.id,
            role: ConferenceRole.CHAIR,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: input.subAdmin.id,
            role: ConferenceRole.ADMINISTRATOR,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: input.committee.id,
            role: ConferenceRole.COMMITTEE,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: input.reviewer.id,
            role: ConferenceRole.REVIEWER,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: input.reviewer2.id,
            role: ConferenceRole.REVIEWER,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: input.sessionChair.id,
            role: ConferenceRole.COMMITTEE,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: input.author.id,
            role: ConferenceRole.AUTHOR,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: input.author2.id,
            role: ConferenceRole.AUTHOR,
            status: MembershipStatus.ACTIVE,
          },
        ],
      },
      rooms: {
        create: [
          { name: 'Amphi A', capacity: 120 },
          { name: 'Salle B', capacity: 40 },
        ],
      },
    },
    include: { tracks: true, rooms: true },
  });

  await setFee(conference.id, 250, 'EUR');

  const systems = conference.tracks.find((item) => item.code === 'SYS')!;
  const theory = conference.tracks.find((item) => item.code === 'TH')!;
  const amphi = conference.rooms.find((item) => item.name === 'Amphi A')!;
  const salleB = conference.rooms.find((item) => item.name === 'Salle B')!;

  await prisma.registration.createMany({
    data: [
      {
        conferenceId: conference.id,
        userId: input.author.id,
        status: 'VERIFIED',
        paymentStatus: 'VERIFIED',
      },
      {
        conferenceId: conference.id,
        userId: input.author2.id,
        status: 'REQUESTED',
        paymentStatus: 'PENDING',
      },
      {
        conferenceId: conference.id,
        userId: input.admin.id,
        status: 'VERIFIED',
        paymentStatus: 'NOT_REQUIRED',
      },
    ],
  });

  // A-01 draft
  await prisma.paper.create({
    data: {
      conferenceId: conference.id,
      trackId: theory.id,
      publicId: null,
      title: 'Brouillon sur les archives ouvertes',
      abstract: 'Ce brouillon n’est pas encore soumis. Il sert à voir l’état DRAFT.',
      keywords: ['brouillon'],
      status: PaperStatus.DRAFT,
      createdById: input.author.id,
      authors: { create: authorOf(input.lea) },
      events: { create: { toStatus: PaperStatus.DRAFT, actorId: input.author.id } },
    },
  });

  // A-02 invited review
  const a02 = await submittedPaper(conference.id, systems.id, input.lea, {
    publicId: 'DEMO-2027-A02',
    title: 'Clock skew in harbour logs',
    abstract:
      'Mesures de décalage d’horloge sur les journaux portuaires. Invitation d’évaluation encore ouverte.',
    keywords: ['horloges', 'journaux'],
  });
  await addManuscripts(conference.id, a02.id, input.author.id);
  await assign(a02.id, input.reviewer.id, input.admin.id, AssignmentStatus.INVITED, 'a02-invited');

  // A-03 review in progress
  const a03 = await submittedPaper(conference.id, systems.id, input.lea, {
    publicId: 'DEMO-2027-A03',
    title: 'Harbour telemetry under load',
    abstract:
      'Télémétrie portuaire sous charge. L’évaluateur a accepté et doit encore rendre l’avis.',
    keywords: ['télémétrie'],
  });
  await addManuscripts(conference.id, a03.id, input.author.id);
  await prisma.paper.update({
    where: { id: a03.id },
    data: { scopeStatus: 'ACCEPTED' },
  });
  await assign(
    a03.id,
    input.reviewer.id,
    input.admin.id,
    AssignmentStatus.ACCEPTED,
    'a03-active',
  );

  // A-04 overdue
  const a04 = await submittedPaper(conference.id, systems.id, input.lea, {
    publicId: 'DEMO-2027-A04',
    title: 'Late measurements from the quay',
    abstract: 'Relevés tardifs du quai. L’évaluation est en retard.',
    keywords: ['quai'],
  });
  await addManuscripts(conference.id, a04.id, input.author.id);
  await prisma.paper.update({
    where: { id: a04.id },
    data: { scopeStatus: 'ACCEPTED' },
  });
  await assign(
    a04.id,
    input.reviewer.id,
    input.admin.id,
    AssignmentStatus.OVERDUE,
    'a04-overdue',
    { createdAt: new Date('2026-09-01T08:00:00.000Z') },
  );

  // A-05 scope refused
  const a05 = await submittedPaper(conference.id, theory.id, input.lea, {
    publicId: 'DEMO-2027-A05',
    title: 'Out-of-scope note on coastal folklore',
    abstract: 'Note hors périmètre. Le comité a refusé le scope.',
    keywords: ['hors-scope'],
  });
  await addManuscripts(conference.id, a05.id, input.author.id);
  await prisma.paper.update({
    where: { id: a05.id },
    data: { scopeStatus: 'REFUSED' },
  });

  // A-06 minor mods
  const a06 = await submittedPaper(conference.id, systems.id, input.lea, {
    publicId: 'DEMO-2027-A06',
    title: 'Sensor traces under a conditional acceptance',
    abstract:
      'Traces de capteurs acceptées sous condition. Checklist de remarques encore ouverte.',
    keywords: ['capteurs', 'traces'],
  });
  await addManuscripts(conference.id, a06.id, input.author.id);
  await prisma.paper.update({
    where: { id: a06.id },
    data: { scopeStatus: 'ACCEPTED' },
  });
  await assign(
    a06.id,
    input.reviewer.id,
    input.admin.id,
    AssignmentStatus.COMPLETED,
    'a06-done',
    {
      form: {
        recommendation: 'WEAK_ACCEPT',
        score: 7,
        confidence: 4,
        commentsToAuthor:
          'Préciser la provenance des traces.\nAjouter une figure de calibration.',
        commentsToCommittee: 'Acceptable avec modifications mineures.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: a06.id,
      outcome: 'CONDITIONALLY_ACCEPTED',
      letter:
        'DEMO-2027-A06 est accepté avec modifications mineures.\nPréciser la provenance des traces.\nAjouter une figure de calibration.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-10T10:00:00.000Z'),
      decidedById: input.admin.id,
    },
  });
  await prisma.revisionRemark.createMany({
    data: [
      {
        paperId: a06.id,
        text: 'Préciser la provenance des traces.',
        status: RemarkStatus.OPEN,
        round: 1,
        sortOrder: 0,
      },
      {
        paperId: a06.id,
        text: 'Ajouter une figure de calibration.',
        status: RemarkStatus.ADDRESSED,
        round: 1,
        sortOrder: 1,
        addressedAt: new Date('2026-10-12T09:00:00.000Z'),
      },
    ],
  });

  // A-07 major revision + file
  const a07 = await submittedPaper(conference.id, theory.id, input.lea, {
    publicId: 'DEMO-2027-A07',
    title: 'Major revision on harbour proofs',
    abstract: 'Preuves portuaires : révision majeure demandée, fichier de révision déposé.',
    keywords: ['révision'],
  });
  await addManuscripts(conference.id, a07.id, input.author.id);
  await addFile(
    conference.id,
    a07.id,
    PaperFileKind.REVISION,
    'harbour-revision.pdf',
    input.author.id,
  );
  await prisma.paper.update({
    where: { id: a07.id },
    data: { scopeStatus: 'ACCEPTED' },
  });
  await assign(
    a07.id,
    input.reviewer.id,
    input.admin.id,
    AssignmentStatus.COMPLETED,
    'a07-done',
    {
      form: {
        recommendation: 'WEAK_REJECT',
        score: 4,
        confidence: 3,
        commentsToAuthor: 'Reprendre la section preuves.\nClarifier les hypothèses.',
        commentsToCommittee: 'Révision majeure nécessaire.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: a07.id,
      outcome: 'REVISION_REQUIRED',
      letter: 'Révision majeure requise avant une nouvelle décision.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-11T10:00:00.000Z'),
      decidedById: input.admin.id,
    },
  });
  await prisma.revisionRemark.createMany({
    data: [
      {
        paperId: a07.id,
        text: 'Reprendre la section preuves.',
        status: RemarkStatus.OPEN,
        round: 1,
        sortOrder: 0,
      },
      {
        paperId: a07.id,
        text: 'Clarifier les hypothèses.',
        status: RemarkStatus.OPEN,
        round: 1,
        sortOrder: 1,
      },
    ],
  });

  // A-08 rejected
  const a08 = await submittedPaper(conference.id, systems.id, input.lea, {
    publicId: 'DEMO-2027-A08',
    title: 'Rejected quay heuristics',
    abstract: 'Heuristiques rejetées par le comité après les avis.',
    keywords: ['rejet'],
  });
  await addManuscripts(conference.id, a08.id, input.author.id);
  await prisma.paper.update({
    where: { id: a08.id },
    data: { scopeStatus: 'ACCEPTED' },
  });
  await assign(
    a08.id,
    input.reviewer.id,
    input.admin.id,
    AssignmentStatus.COMPLETED,
    'a08-done',
    {
      form: {
        recommendation: 'REJECT',
        score: 2,
        confidence: 5,
        commentsToAuthor: 'Contribution insuffisante pour la conférence.',
        commentsToCommittee: 'Rejet clair.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: a08.id,
      outcome: 'REJECTED',
      letter: 'L’article n’est pas accepté.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-12T10:00:00.000Z'),
      decidedById: input.admin.id,
    },
  });

  // A-09 payment under check (Samir)
  const a09 = await submittedPaper(conference.id, systems.id, input.samir, {
    publicId: 'DEMO-2027-A09',
    title: 'Payment under check — quay fees',
    abstract: 'Article accepté. Le reçu de paiement est en cours de vérification.',
    keywords: ['paiement'],
  });
  await addManuscripts(conference.id, a09.id, input.author2.id);
  await addFile(
    conference.id,
    a09.id,
    PaperFileKind.PAYMENT_PROOF,
    'receipt-samir.pdf',
    input.author2.id,
  );
  await prisma.paper.update({
    where: { id: a09.id },
    data: { scopeStatus: 'ACCEPTED' },
  });
  await prisma.decision.create({
    data: {
      paperId: a09.id,
      outcome: 'ACCEPTED',
      letter: 'Accepté. Merci de finaliser l’inscription.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-13T10:00:00.000Z'),
      decidedById: input.admin.id,
    },
  });

  // A-10 presentation open
  const a10 = await submittedPaper(conference.id, systems.id, input.lea, {
    publicId: 'DEMO-2027-A10',
    title: 'Presentation is open — harbour briefing',
    abstract: 'Accepté et inscrit. Les slides peuvent être déposés.',
    keywords: ['présentation'],
  });
  await addManuscripts(conference.id, a10.id, input.author.id);
  await addFile(
    conference.id,
    a10.id,
    PaperFileKind.PAYMENT_PROOF,
    'receipt-lea.pdf',
    input.author.id,
  );
  await prisma.paper.update({
    where: { id: a10.id },
    data: {
      scopeStatus: 'ACCEPTED',
      slidesStatus: SlidesStatus.OPEN,
      sessionChairIds: [input.sessionChair.id],
    },
  });
  await prisma.decision.create({
    data: {
      paperId: a10.id,
      outcome: 'ACCEPTED',
      letter: 'Accepté. Préparez la présentation.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-14T10:00:00.000Z'),
      decidedById: input.admin.id,
    },
  });

  const morning = await prisma.programSession.create({
    data: {
      conferenceId: conference.id,
      roomId: amphi.id,
      title: 'Systems morning',
      startsAt: new Date('2027-06-15T10:00:00.000Z'),
      endsAt: new Date('2027-06-15T11:30:00.000Z'),
    },
  });
  const afternoon = await prisma.programSession.create({
    data: {
      conferenceId: conference.id,
      roomId: salleB.id,
      title: 'Theory afternoon',
      startsAt: new Date('2027-06-15T15:00:00.000Z'),
      endsAt: new Date('2027-06-15T16:30:00.000Z'),
    },
  });

  // A-11 scheduled, not presented
  const a11 = await submittedPaper(conference.id, systems.id, input.lea, {
    publicId: 'DEMO-2027-A11',
    title: 'Scheduled talk awaiting session chair',
    abstract: 'Créneau posé. Le session chair doit marquer Presented avec remarques.',
    keywords: ['session'],
  });
  await addManuscripts(conference.id, a11.id, input.author.id);
  await addFile(
    conference.id,
    a11.id,
    PaperFileKind.PAYMENT_PROOF,
    'receipt-a11.pdf',
    input.author.id,
  );
  await addFile(conference.id, a11.id, PaperFileKind.SLIDES, 'a11-slides.pdf', input.author.id);
  await prisma.paper.update({
    where: { id: a11.id },
    data: {
      scopeStatus: 'ACCEPTED',
      slidesStatus: SlidesStatus.VALIDATED,
      sessionChairIds: [input.sessionChair.id],
    },
  });
  await prisma.decision.create({
    data: {
      paperId: a11.id,
      outcome: 'ACCEPTED',
      letter: 'Accepté et programmé.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-15T10:00:00.000Z'),
      decidedById: input.admin.id,
    },
  });
  await prisma.presentation.create({
    data: {
      sessionId: afternoon.id,
      paperId: a11.id,
      modality: 'IN_PERSON',
      score: null,
      comment: '',
    },
  });

  // A-12 presented + camera ready open
  const a12 = await submittedPaper(conference.id, systems.id, input.lea, {
    publicId: 'DEMO-2027-A12',
    title: 'Presented — camera ready is open',
    abstract: 'Présenté en session. Version finale ouverte.',
    keywords: ['camera-ready'],
  });
  await addManuscripts(conference.id, a12.id, input.author.id);
  await addFile(
    conference.id,
    a12.id,
    PaperFileKind.PAYMENT_PROOF,
    'receipt-a12.pdf',
    input.author.id,
  );
  await addFile(conference.id, a12.id, PaperFileKind.SLIDES, 'a12-slides.pdf', input.author.id);
  await prisma.paper.update({
    where: { id: a12.id },
    data: {
      scopeStatus: 'ACCEPTED',
      slidesStatus: SlidesStatus.VALIDATED,
      cameraReadyStatus: CameraReadyStatus.OPEN,
      presentedAt: new Date('2026-10-16T15:00:00.000Z'),
      sessionComment: 'Bonne présentation, questions sur la calibration.',
      sessionChairIds: [input.sessionChair.id],
    },
  });
  await prisma.decision.create({
    data: {
      paperId: a12.id,
      outcome: 'ACCEPTED',
      letter: 'Accepté.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-15T12:00:00.000Z'),
      decidedById: input.admin.id,
    },
  });
  await prisma.presentation.create({
    data: {
      sessionId: morning.id,
      paperId: a12.id,
      modality: 'IN_PERSON',
      score: 8,
      comment: 'Bonne présentation, questions sur la calibration.',
      presentedAt: new Date('2026-10-16T15:00:00.000Z'),
    },
  });

  // A-13 camera ready under checking
  const a13 = await submittedPaper(conference.id, theory.id, input.lea, {
    publicId: 'DEMO-2027-A13',
    title: 'Camera ready under checking',
    abstract: 'Version finale déposée, en cours de vérification admin.',
    keywords: ['camera-ready', 'check'],
  });
  await addManuscripts(conference.id, a13.id, input.author.id);
  await addFile(
    conference.id,
    a13.id,
    PaperFileKind.PAYMENT_PROOF,
    'receipt-a13.pdf',
    input.author.id,
  );
  await addFile(conference.id, a13.id, PaperFileKind.SLIDES, 'a13-slides.pdf', input.author.id);
  await addFile(
    conference.id,
    a13.id,
    PaperFileKind.CAMERA_READY,
    'a13-camera.pdf',
    input.author.id,
  );
  await addFile(
    conference.id,
    a13.id,
    PaperFileKind.EDITABLE,
    'a13-editable.pdf',
    input.author.id,
  );
  await prisma.paper.update({
    where: { id: a13.id },
    data: {
      scopeStatus: 'ACCEPTED',
      slidesStatus: SlidesStatus.VALIDATED,
      cameraReadyStatus: CameraReadyStatus.DEPOSITED,
      presentedAt: new Date('2026-10-17T15:00:00.000Z'),
      sessionChairIds: [input.sessionChair.id],
    },
  });
  await prisma.decision.create({
    data: {
      paperId: a13.id,
      outcome: 'ACCEPTED',
      letter: 'Accepté.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-15T14:00:00.000Z'),
      decidedById: input.admin.id,
    },
  });
  await prisma.presentation.create({
    data: {
      sessionId: afternoon.id,
      paperId: a13.id,
      modality: 'ONLINE',
      score: 7,
      comment: 'Présentation en ligne claire.',
      presentedAt: new Date('2026-10-17T15:00:00.000Z'),
    },
  });

  // A-14 similarity + copyright pending
  const a14 = await submittedPaper(conference.id, systems.id, input.lea, {
    publicId: 'DEMO-2027-A14',
    title: 'Similarity and copyright in progress',
    abstract: 'Camera ready validée. Similarité déposée, copyright en attente.',
    keywords: ['similarité', 'copyright'],
  });
  await addManuscripts(conference.id, a14.id, input.author.id);
  await addFile(
    conference.id,
    a14.id,
    PaperFileKind.PAYMENT_PROOF,
    'receipt-a14.pdf',
    input.author.id,
  );
  await addFile(conference.id, a14.id, PaperFileKind.SLIDES, 'a14-slides.pdf', input.author.id);
  await addFile(
    conference.id,
    a14.id,
    PaperFileKind.CAMERA_READY,
    'a14-camera.pdf',
    input.author.id,
  );
  await addFile(
    conference.id,
    a14.id,
    PaperFileKind.EDITABLE,
    'a14-editable.pdf',
    input.author.id,
  );
  await addFile(
    conference.id,
    a14.id,
    PaperFileKind.SIMILARITY,
    'a14-similarity.pdf',
    input.author.id,
  );
  await addFile(
    conference.id,
    a14.id,
    PaperFileKind.COPYRIGHT,
    'a14-copyright.pdf',
    input.author.id,
  );
  await prisma.paper.update({
    where: { id: a14.id },
    data: {
      scopeStatus: 'ACCEPTED',
      slidesStatus: SlidesStatus.VALIDATED,
      cameraReadyStatus: CameraReadyStatus.VALIDATED,
      templateValidatedAt: new Date('2026-10-20T10:00:00.000Z'),
      similarityStatus: SimilarityStatus.DEPOSITED,
      copyrightStageStatus: CopyrightStageStatus.DEPOSITED,
      presentedAt: new Date('2026-10-18T11:00:00.000Z'),
      sessionChairIds: [input.sessionChair.id],
    },
  });
  await prisma.decision.create({
    data: {
      paperId: a14.id,
      outcome: 'ACCEPTED',
      letter: 'Accepté.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-15T16:00:00.000Z'),
      decidedById: input.admin.id,
    },
  });
  await prisma.similarityReport.create({
    data: {
      paperId: a14.id,
      percentage: 12.4,
      note: 'Rapport déposé, en attente de validation admin.',
    },
  });
  await prisma.copyrightRecord.create({
    data: { paperId: a14.id, status: 'PENDING' },
  });
  await prisma.presentation.create({
    data: {
      sessionId: morning.id,
      paperId: a14.id,
      modality: 'IN_PERSON',
      score: 8,
      comment: 'Bien.',
      presentedAt: new Date('2026-10-18T11:00:00.000Z'),
    },
  });

  // A-15 fully published
  const a15 = await submittedPaper(conference.id, systems.id, input.lea, {
    publicId: 'DEMO-2027-A15',
    title: 'demo complet — published end-to-end',
    abstract:
      'Parcours complet : revue, décision, inscription, présentation, camera-ready, similarité, copyright et DOI.',
    keywords: ['demo', 'complet', 'doi'],
  });
  await prisma.paperAuthor.create({
    data: {
      paperId: a15.id,
      position: 2,
      firstName: input.samir.firstName,
      lastName: input.samir.lastName,
      email: input.samir.email,
      affiliation: input.samir.affiliation,
      corresponding: false,
    },
  });
  await addManuscripts(conference.id, a15.id, input.author.id);
  await addFile(
    conference.id,
    a15.id,
    PaperFileKind.REVISION,
    'a15-revision.pdf',
    input.author.id,
  );
  await addFile(
    conference.id,
    a15.id,
    PaperFileKind.PAYMENT_PROOF,
    'a15-receipt.pdf',
    input.author.id,
  );
  await addFile(conference.id, a15.id, PaperFileKind.SLIDES, 'a15-slides.pdf', input.author.id);
  await addFile(
    conference.id,
    a15.id,
    PaperFileKind.CAMERA_READY,
    'a15-camera.pdf',
    input.author.id,
  );
  await addFile(
    conference.id,
    a15.id,
    PaperFileKind.EDITABLE,
    'a15-editable.pdf',
    input.author.id,
  );
  await addFile(
    conference.id,
    a15.id,
    PaperFileKind.SIMILARITY,
    'a15-similarity.pdf',
    input.author.id,
  );
  await addFile(
    conference.id,
    a15.id,
    PaperFileKind.COPYRIGHT,
    'a15-copyright.pdf',
    input.author.id,
  );
  await assign(
    a15.id,
    input.reviewer.id,
    input.admin.id,
    AssignmentStatus.COMPLETED,
    'a15-j',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 9,
        confidence: 5,
        commentsToAuthor: 'Travail solide. Quelques précisions mineures déjà traitées.',
        commentsToCommittee: 'Acceptation claire.',
      },
    },
  );
  await assign(
    a15.id,
    input.reviewer2.id,
    input.admin.id,
    AssignmentStatus.COMPLETED,
    'a15-i',
    {
      form: {
        recommendation: 'WEAK_ACCEPT',
        score: 8,
        confidence: 4,
        commentsToAuthor: 'Bonne contribution. Clarifier la conclusion.',
        commentsToCommittee: 'Oui après corrections.',
      },
    },
  );
  await prisma.revisionRemark.createMany({
    data: [
      {
        paperId: a15.id,
        text: 'Clarifier la conclusion.',
        status: RemarkStatus.VALIDATED,
        round: 1,
        sortOrder: 0,
        addressedAt: new Date('2026-10-08T10:00:00.000Z'),
        validatedAt: new Date('2026-10-09T10:00:00.000Z'),
        validatedById: input.admin.id,
      },
    ],
  });
  await prisma.decision.create({
    data: {
      paperId: a15.id,
      outcome: 'ACCEPTED',
      letter: 'demo complet est accepté. Merci pour les corrections.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-10T16:00:00.000Z'),
      decidedById: input.admin.id,
    },
  });
  await prisma.similarityReport.create({
    data: {
      paperId: a15.id,
      percentage: 7.2,
      note: 'Sous le seuil, vérifié.',
      verifiedAt: new Date('2026-10-25T16:00:00.000Z'),
    },
  });
  await prisma.copyrightRecord.create({
    data: { paperId: a15.id, status: 'VALIDATED' },
  });
  await prisma.paper.update({
    where: { id: a15.id },
    data: {
      scopeStatus: 'ACCEPTED',
      doi: '10.5555/scholarflow.demo-2027-a15',
      templateValidatedAt: new Date('2026-10-24T16:00:00.000Z'),
      slidesStatus: SlidesStatus.VALIDATED,
      cameraReadyStatus: CameraReadyStatus.VALIDATED,
      similarityStatus: SimilarityStatus.VALIDATED,
      copyrightStageStatus: CopyrightStageStatus.VALIDATED,
      presentedAt: new Date('2026-10-20T15:30:00.000Z'),
      sessionComment: 'Excellente présentation. Session fluide.',
      sessionChairIds: [input.sessionChair.id],
    },
  });
  await prisma.presentation.create({
    data: {
      sessionId: morning.id,
      paperId: a15.id,
      modality: 'IN_PERSON',
      score: 9,
      comment: 'Excellente présentation. Session fluide.',
      presentedAt: new Date('2026-10-20T15:30:00.000Z'),
    },
  });

  // Spoken language of each talk (FR / AR / EN) — not the UI language.
  for (const [paperId, language] of [
    [a10.id, 'FR'],
    [a11.id, 'FR'],
    [a12.id, 'EN'],
    [a13.id, 'AR'],
    [a14.id, 'FR'],
    [a15.id, 'EN'],
  ] as const) {
    const key = `paper.presentationLanguage.${paperId}`;
    await prisma.platformMetadata.upsert({
      where: { key },
      update: { value: language },
      create: { key, value: language },
    });
  }

  return conference;
}

async function seedConferenceB(input: {
  passwordHash: string;
  admin: { id: string };
  committee: { id: string };
  reviewer: { id: string; email: string };
  sessionChair: { id: string };
  author: { id: string; email: string };
  lea: SeedPerson;
}) {
  const conference = await prisma.conference.create({
    data: {
      slug: 'doctorales-2027',
      name: 'Journées doctorales Rhône 2027',
      shortName: 'DOC2027',
      description:
        'Seconde démo complète : invitations ouvertes, scope, programme et un article déjà publié.',
      city: 'Lyon',
      country: 'France',
      startsOn: new Date('2027-09-10T00:00:00.000Z'),
      endsOn: new Date('2027-09-11T00:00:00.000Z'),
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      reviewMode: 'SINGLE_BLIND',
      paymentsEnabled: false,
      accessPasswordHash: input.passwordHash,
      accessPasswordNote: DEMO_PASSWORD,
      createdById: input.admin.id,
      nextPaperNumber: 4,
      tracks: {
        create: [
          {
            name: 'Thèse',
            code: 'PHD',
            description: 'Travaux de doctorat.',
            sortOrder: 0,
          },
        ],
      },
      deadlines: {
        create: [
          {
            kind: 'SUBMISSION',
            dueAt: new Date('2027-06-30T23:59:00.000Z'),
            label: 'Soumissions',
          },
          {
            kind: 'REVIEW',
            dueAt: new Date('2027-07-31T23:59:00.000Z'),
            label: 'Évaluations',
          },
          {
            kind: 'NOTIFICATION',
            dueAt: new Date('2027-08-15T23:59:00.000Z'),
            label: 'Décisions',
          },
        ],
      },
      memberships: {
        create: [
          {
            userId: input.admin.id,
            role: ConferenceRole.CHAIR,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: input.committee.id,
            role: ConferenceRole.COMMITTEE,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: input.sessionChair.id,
            role: ConferenceRole.COMMITTEE,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: input.author.id,
            role: ConferenceRole.AUTHOR,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: input.reviewer.id,
            role: ConferenceRole.REVIEWER,
            status: MembershipStatus.ACTIVE,
          },
        ],
      },
      rooms: {
        create: [{ name: 'Amphi Doctoral', capacity: 80 }],
      },
    },
    include: { tracks: true, rooms: true },
  });

  await setFee(conference.id, 0, 'EUR');

  const track = conference.tracks[0]!;
  const room = conference.rooms[0]!;
  const inviteUntil = new Date('2027-06-01T23:59:00.000Z');

  await prisma.conferenceInvitation.createMany({
    data: [
      {
        conferenceId: conference.id,
        email: `collegue${DEMO_DOMAIN}`,
        role: ConferenceRole.AUTHOR,
        tokenHash: createHash('sha256').update('invite-collegue-doctorales').digest('hex'),
        expiresAt: inviteUntil,
        invitedById: input.admin.id,
      },
      {
        conferenceId: conference.id,
        email: `invite-reviewer${DEMO_DOMAIN}`,
        role: ConferenceRole.REVIEWER,
        tokenHash: createHash('sha256').update('invite-reviewer-doctorales').digest('hex'),
        expiresAt: inviteUntil,
        invitedById: input.admin.id,
      },
    ],
  });

  await prisma.registration.create({
    data: {
      conferenceId: conference.id,
      userId: input.author.id,
      status: 'VERIFIED',
      paymentStatus: 'NOT_REQUIRED',
    },
  });

  // B-01 scope pending
  const b01 = await submittedPaper(conference.id, track.id, input.lea, {
    publicId: 'DOC-2027-B01',
    title: 'Doctoral notes awaiting scope',
    abstract: 'Soumis sur DOC2027. Le scope n’a pas encore été tranché.',
    keywords: ['scope'],
  });
  await addManuscripts(conference.id, b01.id, input.author.id);

  // B-02 scheduled
  const b02 = await submittedPaper(conference.id, track.id, input.lea, {
    publicId: 'DOC-2027-B02',
    title: 'Doctoral talk on the program',
    abstract: 'Accepté et placé au programme. Session chair assigné.',
    keywords: ['programme'],
  });
  await addManuscripts(conference.id, b02.id, input.author.id);
  await addFile(conference.id, b02.id, PaperFileKind.SLIDES, 'b02-slides.pdf', input.author.id);
  await prisma.paper.update({
    where: { id: b02.id },
    data: {
      scopeStatus: 'ACCEPTED',
      slidesStatus: SlidesStatus.VALIDATED,
      sessionChairIds: [input.sessionChair.id],
    },
  });
  await prisma.decision.create({
    data: {
      paperId: b02.id,
      outcome: 'ACCEPTED',
      letter: 'Accepté pour les journées doctorales.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-20T10:00:00.000Z'),
      decidedById: input.admin.id,
    },
  });
  const session = await prisma.programSession.create({
    data: {
      conferenceId: conference.id,
      roomId: room.id,
      title: 'Session doctorale',
      startsAt: new Date('2027-09-10T10:00:00.000Z'),
      endsAt: new Date('2027-09-10T12:00:00.000Z'),
    },
  });
  await prisma.presentation.create({
    data: {
      sessionId: session.id,
      paperId: b02.id,
      modality: 'IN_PERSON',
    },
  });

  // B-03 published
  const b03 = await submittedPaper(conference.id, track.id, input.lea, {
    publicId: 'DOC-2027-B03',
    title: 'Doctoral archive — published',
    abstract: 'Second parcours complet sur DOC2027, déjà publié avec DOI.',
    keywords: ['doi', 'doctorales'],
  });
  await addManuscripts(conference.id, b03.id, input.author.id);
  await addFile(conference.id, b03.id, PaperFileKind.SLIDES, 'b03-slides.pdf', input.author.id);
  await addFile(
    conference.id,
    b03.id,
    PaperFileKind.CAMERA_READY,
    'b03-camera.pdf',
    input.author.id,
  );
  await addFile(
    conference.id,
    b03.id,
    PaperFileKind.EDITABLE,
    'b03-editable.pdf',
    input.author.id,
  );
  await addFile(
    conference.id,
    b03.id,
    PaperFileKind.SIMILARITY,
    'b03-similarity.pdf',
    input.author.id,
  );
  await addFile(
    conference.id,
    b03.id,
    PaperFileKind.COPYRIGHT,
    'b03-copyright.pdf',
    input.author.id,
  );
  await assign(
    b03.id,
    input.reviewer.id,
    input.admin.id,
    AssignmentStatus.COMPLETED,
    'b03-done',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 8,
        confidence: 4,
        commentsToAuthor: 'Bon travail doctoral.',
        commentsToCommittee: 'Acceptation.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: b03.id,
      outcome: 'ACCEPTED',
      letter: 'Accepté et publié.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-22T10:00:00.000Z'),
      decidedById: input.admin.id,
    },
  });
  await prisma.similarityReport.create({
    data: {
      paperId: b03.id,
      percentage: 5.1,
      note: 'OK',
      verifiedAt: new Date('2026-10-23T10:00:00.000Z'),
    },
  });
  await prisma.copyrightRecord.create({
    data: { paperId: b03.id, status: 'VALIDATED' },
  });
  await prisma.paper.update({
    where: { id: b03.id },
    data: {
      scopeStatus: 'ACCEPTED',
      doi: '10.5555/scholarflow.doc-2027-b03',
      templateValidatedAt: new Date('2026-10-23T12:00:00.000Z'),
      slidesStatus: SlidesStatus.VALIDATED,
      cameraReadyStatus: CameraReadyStatus.VALIDATED,
      similarityStatus: SimilarityStatus.VALIDATED,
      copyrightStageStatus: CopyrightStageStatus.VALIDATED,
      presentedAt: new Date('2026-10-22T15:00:00.000Z'),
      sessionComment: 'Présentation doctorale claire.',
      sessionChairIds: [input.sessionChair.id],
    },
  });
  await prisma.presentation.create({
    data: {
      sessionId: session.id,
      paperId: b03.id,
      modality: 'IN_PERSON',
      score: 8,
      comment: 'Présentation doctorale claire.',
      presentedAt: new Date('2026-10-22T15:00:00.000Z'),
    },
  });

  return conference;
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

async function createUser(
  localPart: string,
  passwordHash: string,
  profile: DemoProfile,
  platformRole: PlatformRole = PlatformRole.RESEARCHER,
) {
  return prisma.user.create({
    data: {
      email: `${localPart}${DEMO_DOMAIN}`,
      passwordHash,
      issuedPassword: DEMO_PASSWORD,
      platformRole,
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

interface SeedPerson {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  affiliation: string;
}

function person(
  user: { id: string; email: string },
  firstName: string,
  lastName: string,
  affiliation: string,
): SeedPerson {
  return { id: user.id, email: user.email, firstName, lastName, affiliation };
}

function authorOf(user: SeedPerson, position = 1, corresponding = position === 1) {
  return {
    position,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    affiliation: user.affiliation,
    corresponding,
  };
}

async function submittedPaper(
  conferenceId: string,
  trackId: string | undefined,
  author: SeedPerson,
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
      submittedAt: new Date('2026-10-01T12:00:00.000Z'),
      createdById: author.id,
      authors: { create: authorOf(author) },
      events: {
        create: [
          { toStatus: PaperStatus.DRAFT, actorId: author.id },
          {
            fromStatus: PaperStatus.DRAFT,
            toStatus: PaperStatus.SUBMITTED,
            actorId: author.id,
          },
        ],
      },
    },
  });
}

async function addManuscripts(conferenceId: string, paperId: string, uploadedById: string) {
  await addFile(
    conferenceId,
    paperId,
    PaperFileKind.MANUSCRIPT,
    'abstract.pdf',
    uploadedById,
    undefined,
    `conferences/${conferenceId}/papers/${paperId}/abstract-seed.pdf`,
  );
  await addFile(
    conferenceId,
    paperId,
    PaperFileKind.MANUSCRIPT,
    'manuscript.pdf',
    uploadedById,
    undefined,
    `conferences/${conferenceId}/papers/${paperId}/full-seed.pdf`,
  );
}

async function addFile(
  conferenceId: string,
  paperId: string,
  kind: PaperFileKind,
  name: string,
  uploadedById: string,
  createdAt?: Date,
  storageKey?: string,
) {
  const key =
    storageKey ??
    `conferences/${conferenceId}/papers/${paperId}/${kind.toLowerCase()}.pdf`;
  await prisma.paperFile.create({
    data: {
      paperId,
      kind,
      storageKey: key,
      originalName: name,
      contentType: 'application/pdf',
      sizeBytes: PDF.length,
      sha256: createHash('sha256').update(PDF).digest('hex'),
      uploadedById,
      createdAt,
    },
  });
  await storePdf(key);
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
      respondedAt:
        extra?.respondedAt ??
        (status === AssignmentStatus.INVITED
          ? null
          : new Date('2026-10-05T12:30:00.000Z')),
      invitedById,
      createdAt: extra?.createdAt,
      form: extra?.form ? { create: extra.form } : undefined,
    },
  });
}

async function setFee(conferenceId: string, amount: number, currency: string) {
  const key = `conference.fee.${conferenceId}`;
  await prisma.platformMetadata.upsert({
    where: { key },
    update: { value: JSON.stringify({ amount, currency }) },
    create: { key, value: JSON.stringify({ amount, currency }) },
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
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: process.env.MINIO_BUCKET ?? 'scholarflow',
        Key: key,
        Body: PDF,
        ContentType: 'application/pdf',
      }),
    );
  } catch {
    // MinIO may be offline during seed; DB rows still work for dashboards.
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
