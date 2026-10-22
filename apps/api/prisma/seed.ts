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
  CameraReadyStatus,
  CopyrightStageStatus,
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
const SLUG = 'demo-2027';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function main(): Promise<void> {
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
        { slug: SLUG },
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
      ],
    },
  });

  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await createUser(
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
      biography:
        'Le superadmin crée les identifiants des admins et les conférences. Les autres rôles ne créent pas de conférence.',
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
    interests: 'Organisation de conférences, comités de programme, archives ouvertes.',
    biography:
      'Camille Martin dirige le comité d’organisation de ScholarFlow Demo 2027. Elle coordonne les pistes, les échéances et les invitations des évaluateurs.',
    photoPath: '/avatars/admin.jpg',
    orcid: '0000-0001-2345-6781',
    website: 'https://liris.cnrs.fr',
    education: [
      { year: '2008', title: 'Doctorat en informatique', place: 'Université de Lyon' },
      {
        year: '2012',
        title: 'Maître de conférences',
        place: 'Université Claude Bernard Lyon 1',
      },
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
      'Julien Moreau évalue les manuscrits de la piste Systèmes. Son évaluation de l’article DEMO-2027-0001 est acceptée. Compte créé par l’admin via invitation.',
    photoPath: '/avatars/reviewer.jpg',
    orcid: '0000-0001-2345-6782',
    website: 'https://lip.ens-lyon.fr',
    education: [
      { year: '2014', title: 'Master informatique', place: 'ENS de Lyon' },
      {
        year: '2018',
        title: 'Doctorat en systèmes distribués',
        place: 'Université de Lyon',
      },
      { year: '2020', title: 'Chargé de recherche', place: 'CNRS, laboratoire LIP' },
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
    interests:
      'Décisions éditoriales, attribution des évaluateurs, qualité scientifique.',
    biography:
      'Nora Benali siège au comité de programme. Elle est invitée par l’admin, décide du scope et des acceptations, sans gérer les réglages de la conférence.',
    photoPath: '/avatars/committee.jpg',
    orcid: '0000-0001-2345-6785',
    website: 'https://www.insa-lyon.fr',
    education: [
      { year: '2005', title: 'Doctorat en réseaux', place: 'INSA Lyon' },
      { year: '2015', title: 'Professeure des universités', place: 'INSA Lyon' },
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
      {
        year: '2018',
        title: 'Licence informatique',
        place: 'Université Claude Bernard Lyon 1',
      },
      { year: '2020', title: 'Master systèmes et données', place: 'ENS de Lyon' },
      { year: '2022', title: 'Doctorat en cours', place: 'LIRIS, Université de Lyon' },
    ],
  });
  const lea = person(chercheur, 'Léa', 'Dubois', 'LIRIS, Université de Lyon');
  const auteur2 = await createUser('auteur2', passwordHash, {
    firstName: 'Samir',
    lastName: 'Haddad',
    academicTitle: 'Doctorant',
    institution: 'Université Claude Bernard Lyon 1',
    laboratory: 'LIRIS',
    department: 'Informatique',
    disciplines: ['Informatique'],
    interests: 'Paiement et inscriptions conférence.',
    biography: 'Compte démo pour l’état Under check receipt.',
    photoPath: '',
    orcid: '',
    website: '',
    education: [],
  });
  const samir = person(auteur2, 'Samir', 'Haddad', 'LIRIS, Université de Lyon');

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
      paymentsEnabled: true,
      accessPasswordHash: passwordHash,
      accessPasswordNote: DEMO_PASSWORD,
      createdById: admin.id,
      nextPaperNumber: 20,
      tracks: {
        create: [
          {
            name: 'Systèmes',
            code: 'SYS',
            description: 'Systèmes distribués et données.',
            sortOrder: 0,
          },
          {
            name: 'Théorie',
            code: 'TH',
            description: 'Modèles et preuves.',
            sortOrder: 1,
          },
          {
            name: 'Données',
            code: 'DATA',
            description: 'Jeux de données et reproductibilité.',
            sortOrder: 2,
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
          {
            kind: 'INVITATION',
            language: 'fr',
            subject: 'Invitation au comité',
            body: 'Vous êtes invité à rejoindre ScholarFlow Demo 2027. Le lien d’invitation expire le 1er mars 2027.',
          },
          {
            kind: 'DECISION_LETTER',
            language: 'fr',
            subject: 'Décision sur votre article',
            body: 'Le comité a rendu sa décision. La lettre ci-dessous précise ce qui est attendu pour la version finale.',
          },
          {
            kind: 'NOTIFICATION',
            language: 'fr',
            subject: 'ScholarFlow Demo 2027',
            body: 'Ce modèle est conservé pour une notification ultérieure. Il n’est pas envoyé tout seul.',
          },
        ],
      },
      memberships: {
        create: [
          {
            userId: admin.id,
            role: ConferenceRole.CHAIR,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: committee.id,
            role: ConferenceRole.COMMITTEE,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: chercheur.id,
            role: ConferenceRole.AUTHOR,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: auteur2.id,
            role: ConferenceRole.AUTHOR,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: reviewer.id,
            role: ConferenceRole.REVIEWER,
            status: MembershipStatus.ACTIVE,
          },
        ],
      },
    },
    include: { tracks: true },
  });

  const systems = conference.tracks.find((item) => item.code === 'SYS');
  const theory = conference.tracks.find((item) => item.code === 'TH');
  const dataTrack = conference.tracks.find((item) => item.code === 'DATA');

  await prisma.paper.create({
    data: {
      conferenceId: conference.id,
      trackId: theory?.id,
      title: 'Brouillon sur les archives ouvertes',
      abstract: 'Ce brouillon n’est pas encore soumis. Il sert à voir l’état DRAFT.',
      keywords: ['brouillon', 'archives'],
      status: PaperStatus.DRAFT,
      createdById: chercheur.id,
      authors: { create: authorOf(lea) },
      events: { create: { toStatus: PaperStatus.DRAFT, actorId: chercheur.id } },
    },
  });

  const invited = await submittedPaper(conference.id, systems?.id, lea, {
    publicId: 'DEMO-2027-0002',
    title: 'Clock skew in harbour logs',
    abstract:
      'Mesures de décalage d’horloge sur les journaux portuaires. Article en cours d’évaluation.',
    keywords: ['horloges', 'journaux'],
  });
  await addFile(
    conference.id,
    invited.id,
    PaperFileKind.MANUSCRIPT,
    'clocks.pdf',
    chercheur.id,
  );
  await assign(
    invited.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.ACCEPTED,
    'accepted-clocks',
  );

  const overdue = await submittedPaper(conference.id, systems?.id, lea, {
    publicId: 'DEMO-2027-0003',
    title: 'Late measurements from the quay',
    abstract: 'Relevés tardifs du quai. L’évaluation est en retard.',
    keywords: ['quai', 'mesures'],
  });
  await addFile(
    conference.id,
    overdue.id,
    PaperFileKind.MANUSCRIPT,
    'quay.pdf',
    chercheur.id,
  );
  await assign(
    overdue.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.OVERDUE,
    'overdue-quay',
    {
      createdAt: new Date('2026-09-01T08:00:00.000Z'),
    },
  );

  const waiting = await submittedPaper(conference.id, theory?.id, lea, {
    publicId: 'DEMO-2027-0004',
    title: 'A note on public identifiers',
    abstract:
      'Note courte sur les identifiants publics. L’invitation d’évaluation est encore ouverte.',
    keywords: ['identifiants'],
  });
  await addFile(
    conference.id,
    waiting.id,
    PaperFileKind.MANUSCRIPT,
    'identifiers.pdf',
    chercheur.id,
  );
  await assign(
    waiting.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.DECLINED,
    'declined-identifiers',
  );

  const conditional = await submittedPaper(conference.id, theory?.id, lea, {
    publicId: 'DEMO-2027-0005',
    title: 'Sensor traces under a conditional acceptance',
    abstract:
      'Traces de capteurs acceptées sous condition, déjà placées dans le programme.',
    keywords: ['capteurs', 'traces'],
  });
  await addFile(
    conference.id,
    conditional.id,
    PaperFileKind.MANUSCRIPT,
    'sensors.pdf',
    chercheur.id,
  );
  await prisma.similarityReport.create({
    data: {
      paperId: conditional.id,
      percentage: 24,
      note: 'Au-dessus du seuil de 20 %.',
    },
  });
  await assign(
    conditional.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-conditional',
    {
      form: {
        recommendation: 'WEAK_ACCEPT',
        score: 6,
        confidence: 3,
        commentsToAuthor:
          'Préciser la provenance des traces.\nAjouter une figure de calibration.',
        commentsToCommittee: 'Acceptable avec modifications mineures.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: conditional.id,
      outcome: 'CONDITIONALLY_ACCEPTED',
      letter:
        'DEMO-2027-0005 est accepté avec modifications mineures.\nPréciser la provenance des traces.\nAjouter une figure de calibration.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-10T16:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.revisionRemark.createMany({
    data: [
      {
        paperId: conditional.id,
        text: 'Préciser la provenance des traces.',
        status: RemarkStatus.OPEN,
        round: 1,
        sortOrder: 0,
      },
      {
        paperId: conditional.id,
        text: 'Ajouter une figure de calibration.',
        status: RemarkStatus.ADDRESSED,
        round: 1,
        sortOrder: 1,
        addressedAt: new Date('2026-10-11T10:00:00.000Z'),
      },
    ],
  });

  const accepted = await submittedPaper(conference.id, systems?.id, lea, {
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
  await addFile(
    conference.id,
    accepted.id,
    PaperFileKind.PAYMENT_PROOF,
    'tides-payment.pdf',
    chercheur.id,
    new Date('2026-10-11T09:00:00.000Z'),
  );
  await addFile(
    conference.id,
    accepted.id,
    PaperFileKind.SLIDES,
    'tides-slides.pdf',
    chercheur.id,
    new Date('2026-10-12T09:00:00.000Z'),
  );
  await assign(
    accepted.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-tides',
    {
      respondedAt: new Date('2026-10-02T12:30:00.000Z'),
      form: {
        recommendation: 'ACCEPT',
        score: 8,
        confidence: 4,
        commentsToAuthor:
          'The public identifier stays stable and the argument is clear enough to accept.',
        commentsToCommittee: 'No remaining conflict after the declared checks.',
      },
    },
  );
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
    data: {
      templateValidatedAt: new Date('2026-10-11T17:00:00.000Z'),
      slidesStatus: SlidesStatus.VALIDATED,
      cameraReadyStatus: CameraReadyStatus.VALIDATED,
      similarityStatus: SimilarityStatus.VALIDATED,
      copyrightStageStatus: CopyrightStageStatus.VALIDATED,
      presentedAt: new Date('2026-10-12T15:00:00.000Z'),
      sessionComment: 'Présentation validée — exposé clair.',
      sessionChairIds: [admin.id],
    },
  });

  const revision = await submittedPaper(conference.id, systems?.id, lea, {
    publicId: 'DEMO-2027-0006',
    title: 'Le modèle de menace des journaux portuaires',
    abstract:
      'Article accepté seulement après révision. Le fichier de révision est déjà déposé.',
    keywords: ['révision', 'menace'],
  });
  await addFile(
    conference.id,
    revision.id,
    PaperFileKind.MANUSCRIPT,
    'menace.pdf',
    lea.id,
  );
  await addFile(
    conference.id,
    revision.id,
    PaperFileKind.REVISION,
    'menace-revision.pdf',
    lea.id,
  );
  await assign(
    revision.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.IN_PROGRESS,
    'progress-revision',
  );
  await prisma.decision.create({
    data: {
      paperId: revision.id,
      outcome: 'REVISION_REQUIRED',
      letter:
        'DEMO-2027-0006 est accepté avec modifications majeures.\nLe modèle de menace doit citer les journaux réellement observés.\nClarifier le scénario d’attaque principal.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-12T16:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.revisionRemark.createMany({
    data: [
      {
        paperId: revision.id,
        text: 'Le modèle de menace doit citer les journaux réellement observés.',
        status: RemarkStatus.OPEN,
        round: 1,
        sortOrder: 0,
      },
      {
        paperId: revision.id,
        text: 'Clarifier le scénario d’attaque principal.',
        status: RemarkStatus.OPEN,
        round: 1,
        sortOrder: 1,
      },
    ],
  });

  const rejected = await submittedPaper(conference.id, theory?.id, lea, {
    publicId: 'DEMO-2027-0007',
    title: 'Une esquisse de preuve qui ne tient pas',
    abstract:
      'Article refusé après une évaluation négative. Julien a décliné cette invitation.',
    keywords: ['preuve', 'refus'],
  });
  await addFile(
    conference.id,
    rejected.id,
    PaperFileKind.MANUSCRIPT,
    'preuve.pdf',
    lea.id,
  );
  await assign(
    rejected.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'reject-proof',
    {
      form: {
        recommendation: 'REJECT',
        score: 3,
        confidence: 5,
        commentsToAuthor: 'Le lemme principal n’est pas démontré.',
        commentsToCommittee: 'Refus clair.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: rejected.id,
      outcome: 'REJECTED',
      letter: 'DEMO-2027-0007 est refusé. La preuve centrale reste incomplète.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-13T16:00:00.000Z'),
      decidedById: admin.id,
    },
  });

  const withdrawn = await submittedPaper(conference.id, dataTrack?.id, lea, {
    publicId: 'DEMO-2027-0008',
    title: 'Note retirée sur les capteurs du quai',
    abstract: 'Article soumis puis retiré par l’auteure. L’évaluation a été annulée.',
    keywords: ['retrait'],
  });
  await addFile(
    conference.id,
    withdrawn.id,
    PaperFileKind.MANUSCRIPT,
    'retrait.pdf',
    lea.id,
  );
  await assign(
    withdrawn.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.CANCELLED,
    'cancelled-withdrawn',
  );
  await prisma.paper.update({
    where: { id: withdrawn.id },
    data: {
      status: PaperStatus.WITHDRAWN,
      withdrawnAt: new Date('2026-10-12T10:00:00.000Z'),
    },
  });
  await prisma.paperStatusEvent.create({
    data: {
      paperId: withdrawn.id,
      fromStatus: PaperStatus.SUBMITTED,
      toStatus: PaperStatus.WITHDRAWN,
      actorId: lea.id,
      reason: 'Retiré par l’auteure avant la décision.',
    },
  });

  const unpublished = await submittedPaper(conference.id, dataTrack?.id, lea, {
    publicId: 'DEMO-2027-0009',
    title: 'Paquet de réplication des tables de marée',
    abstract:
      'Les deux évaluations sont rendues. La décision existe encore à l’état de brouillon.',
    keywords: ['réplication', 'décision'],
  });
  await addFile(
    conference.id,
    unpublished.id,
    PaperFileKind.MANUSCRIPT,
    'replication.pdf',
    lea.id,
  );
  await assign(
    unpublished.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-replication',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 7,
        confidence: 4,
        commentsToAuthor: 'Le paquet de réplication est suffisant.',
        commentsToCommittee: 'Je suis favorable à l’acceptation.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: unpublished.id,
      outcome: 'ACCEPTED',
      letter:
        'Brouillon de lettre : DEMO-2027-0009 serait accepté. Cette décision n’est pas encore publiée.',
      status: 'DRAFT',
      publishedAt: null,
      decidedById: admin.id,
    },
  });

  const copyrightRejected = await submittedPaper(conference.id, dataTrack?.id, lea, {
    publicId: 'DEMO-2027-0010',
    title: 'Version finale sans cession de droits valide',
    abstract:
      'Article accepté, mais la cession de droits a été refusée. La version finale manque encore.',
    keywords: ['droits', 'version finale'],
  });
  await addFile(
    conference.id,
    copyrightRejected.id,
    PaperFileKind.MANUSCRIPT,
    'droits.pdf',
    lea.id,
  );
  await addFile(
    conference.id,
    copyrightRejected.id,
    PaperFileKind.COPYRIGHT,
    'droits-refuses.pdf',
    lea.id,
  );
  await prisma.decision.create({
    data: {
      paperId: copyrightRejected.id,
      outcome: 'ACCEPTED',
      letter:
        'DEMO-2027-0010 est accepté. La cession déposée a été refusée : il faut la redéposer.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-14T16:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.similarityReport.create({
    data: {
      paperId: copyrightRejected.id,
      percentage: 8,
      note: 'Sous 20 %, en attente de vérification.',
    },
  });
  await prisma.copyrightRecord.create({
    data: { paperId: copyrightRejected.id, status: 'REJECTED' },
  });
  await prisma.paper.update({
    where: { id: copyrightRejected.id },
    data: { slidesStatus: SlidesStatus.OPEN },
  });

  const paymentCheck = await submittedPaper(conference.id, dataTrack?.id, samir, {
    publicId: 'DEMO-2027-0011',
    title: 'Paiement en vérification du reçu',
    abstract:
      'Accepté, reçu de paiement déposé : état Under check receipt en attente de validation admin.',
    keywords: ['paiement', 'reçu'],
  });
  await addFile(
    conference.id,
    paymentCheck.id,
    PaperFileKind.MANUSCRIPT,
    'paiement.pdf',
    auteur2.id,
  );
  await addFile(
    conference.id,
    paymentCheck.id,
    PaperFileKind.PAYMENT_PROOF,
    'paiement-recu.pdf',
    auteur2.id,
  );
  await assign(
    paymentCheck.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-payment-check',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 7,
        confidence: 4,
        commentsToAuthor: 'Article clair, acceptation sans modification.',
        commentsToCommittee: 'OK.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: paymentCheck.id,
      outcome: 'ACCEPTED',
      letter: 'DEMO-2027-0011 est accepté sans modification.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-15T16:00:00.000Z'),
      decidedById: admin.id,
    },
  });

  const slidesOpen = await submittedPaper(conference.id, systems?.id, lea, {
    publicId: 'DEMO-2027-0012',
    title: 'Présentation ouverte — dépôt PPT à faire',
    abstract: 'Inscription validée. État : Presentation is open.',
    keywords: ['présentation', 'ouvert'],
  });
  await addFile(
    conference.id,
    slidesOpen.id,
    PaperFileKind.MANUSCRIPT,
    'pres-open.pdf',
    lea.id,
  );
  await assign(
    slidesOpen.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-slides-open',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 8,
        confidence: 4,
        commentsToAuthor: 'Bon manuscrit.',
        commentsToCommittee: 'OK.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: slidesOpen.id,
      outcome: 'ACCEPTED',
      letter: 'DEMO-2027-0012 est accepté sans modification.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-15T17:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.paper.update({
    where: { id: slidesOpen.id },
    data: { slidesStatus: SlidesStatus.OPEN },
  });

  const slidesDeposited = await submittedPaper(conference.id, systems?.id, lea, {
    publicId: 'DEMO-2027-0013',
    title: 'Présentation déposée en attente admin',
    abstract: 'PPT déposé. État : Presentation deposited.',
    keywords: ['présentation', 'déposée'],
  });
  await addFile(
    conference.id,
    slidesDeposited.id,
    PaperFileKind.MANUSCRIPT,
    'pres-dep.pdf',
    lea.id,
  );
  await addFile(
    conference.id,
    slidesDeposited.id,
    PaperFileKind.SLIDES,
    'pres-dep-slides.pdf',
    lea.id,
  );
  await assign(
    slidesDeposited.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-slides-dep',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 7,
        confidence: 3,
        commentsToAuthor: 'Correct.',
        commentsToCommittee: 'OK.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: slidesDeposited.id,
      outcome: 'ACCEPTED',
      letter: 'DEMO-2027-0013 est accepté sans modification.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-15T18:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.paper.update({
    where: { id: slidesDeposited.id },
    data: { slidesStatus: SlidesStatus.DEPOSITED },
  });

  const slidesMods = await submittedPaper(conference.id, theory?.id, lea, {
    publicId: 'DEMO-2027-0014',
    title: 'Présentation not comfort — checklist mods',
    abstract: 'Admin a demandé des modifications. État : Presentation not comfort.',
    keywords: ['présentation', 'mods'],
  });
  await addFile(
    conference.id,
    slidesMods.id,
    PaperFileKind.MANUSCRIPT,
    'pres-mods.pdf',
    lea.id,
  );
  await addFile(
    conference.id,
    slidesMods.id,
    PaperFileKind.SLIDES,
    'pres-mods-slides.pdf',
    lea.id,
  );
  await assign(
    slidesMods.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-slides-mods',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 7,
        confidence: 4,
        commentsToAuthor: 'OK.',
        commentsToCommittee: 'OK.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: slidesMods.id,
      outcome: 'ACCEPTED',
      letter: 'DEMO-2027-0014 est accepté sans modification.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-15T19:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.paper.update({
    where: { id: slidesMods.id },
    data: {
      slidesStatus: SlidesStatus.NEEDS_MODS,
      sessionComment: 'Réduire le nombre de slides.\nClarifier la slide résultats.',
    },
  });
  await prisma.presentationRemark.createMany({
    data: [
      {
        paperId: slidesMods.id,
        text: 'Réduire le nombre de slides.',
        status: RemarkStatus.OPEN,
        round: 1,
        sortOrder: 0,
      },
      {
        paperId: slidesMods.id,
        text: 'Clarifier la slide résultats.',
        status: RemarkStatus.ADDRESSED,
        round: 1,
        sortOrder: 1,
        addressedAt: new Date('2026-10-16T09:00:00.000Z'),
      },
    ],
  });

  const slidesWill = await submittedPaper(conference.id, theory?.id, lea, {
    publicId: 'DEMO-2027-0015',
    title: 'Presentation will deposer — nouvelle version PPT',
    abstract: 'Nouvelle version déposée après mods. État : Presentation will deposer.',
    keywords: ['présentation', 'will-deposer'],
  });
  await addFile(
    conference.id,
    slidesWill.id,
    PaperFileKind.MANUSCRIPT,
    'pres-will.pdf',
    lea.id,
  );
  await addFile(
    conference.id,
    slidesWill.id,
    PaperFileKind.SLIDES,
    'pres-will-slides.pdf',
    lea.id,
  );
  await assign(
    slidesWill.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-slides-will',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 8,
        confidence: 4,
        commentsToAuthor: 'OK.',
        commentsToCommittee: 'OK.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: slidesWill.id,
      outcome: 'ACCEPTED',
      letter: 'DEMO-2027-0015 est accepté sans modification.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-15T20:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.paper.update({
    where: { id: slidesWill.id },
    data: { slidesStatus: SlidesStatus.WILL_DEPOSIT },
  });
  await prisma.presentationRemark.createMany({
    data: [
      {
        paperId: slidesWill.id,
        text: 'Ajouter le logo de la conférence.',
        status: RemarkStatus.VALIDATED,
        round: 1,
        sortOrder: 0,
        validatedAt: new Date('2026-10-16T11:00:00.000Z'),
        validatedById: admin.id,
      },
      {
        paperId: slidesWill.id,
        text: 'Corriger la typo slide 4.',
        status: RemarkStatus.ADDRESSED,
        round: 1,
        sortOrder: 1,
        addressedAt: new Date('2026-10-16T10:00:00.000Z'),
      },
    ],
  });

  const cameraOpen = await submittedPaper(conference.id, systems?.id, lea, {
    publicId: 'DEMO-2027-0016',
    title: 'Camera ready is open — dépôt version finale',
    abstract: 'Présentation validée. État : Camera ready is open.',
    keywords: ['camera', 'ouvert'],
  });
  await addFile(
    conference.id,
    cameraOpen.id,
    PaperFileKind.MANUSCRIPT,
    'cam-open.pdf',
    lea.id,
  );
  await addFile(conference.id, cameraOpen.id, PaperFileKind.SLIDES, 'cam-open.ppt', lea.id);
  await assign(
    cameraOpen.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-camera-open',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 8,
        confidence: 4,
        commentsToAuthor: 'OK.',
        commentsToCommittee: 'OK.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: cameraOpen.id,
      outcome: 'ACCEPTED',
      letter: 'DEMO-2027-0016 est accepté sans modification.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-16T12:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.paper.update({
    where: { id: cameraOpen.id },
    data: {
      slidesStatus: SlidesStatus.VALIDATED,
      presentedAt: new Date('2026-10-16T13:00:00.000Z'),
      cameraReadyStatus: CameraReadyStatus.OPEN,
    },
  });

  const cameraCheck = await submittedPaper(conference.id, systems?.id, lea, {
    publicId: 'DEMO-2027-0017',
    title: 'Camera ready under checking',
    abstract: 'PDF + Word déposés. État : Under checking.',
    keywords: ['camera', 'vérification'],
  });
  await addFile(
    conference.id,
    cameraCheck.id,
    PaperFileKind.MANUSCRIPT,
    'cam-check.pdf',
    lea.id,
  );
  await addFile(
    conference.id,
    cameraCheck.id,
    PaperFileKind.SLIDES,
    'cam-check.ppt',
    lea.id,
  );
  await addFile(
    conference.id,
    cameraCheck.id,
    PaperFileKind.CAMERA_READY,
    'cam-check-final.pdf',
    lea.id,
  );
  await addFile(
    conference.id,
    cameraCheck.id,
    PaperFileKind.EDITABLE,
    'cam-check-final.docx',
    lea.id,
  );
  await assign(
    cameraCheck.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-camera-check',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 8,
        confidence: 4,
        commentsToAuthor: 'OK.',
        commentsToCommittee: 'OK.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: cameraCheck.id,
      outcome: 'ACCEPTED',
      letter: 'DEMO-2027-0017 est accepté sans modification.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-16T14:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.paper.update({
    where: { id: cameraCheck.id },
    data: {
      slidesStatus: SlidesStatus.VALIDATED,
      presentedAt: new Date('2026-10-16T15:00:00.000Z'),
      cameraReadyStatus: CameraReadyStatus.DEPOSITED,
    },
  });

  const cameraMods = await submittedPaper(conference.id, systems?.id, lea, {
    publicId: 'DEMO-2027-0018',
    title: 'Camera ready not comfort — checklist mods',
    abstract: 'Admin a demandé des modifications sur la version finale.',
    keywords: ['camera', 'mods'],
  });
  await addFile(
    conference.id,
    cameraMods.id,
    PaperFileKind.MANUSCRIPT,
    'cam-mods.pdf',
    lea.id,
  );
  await addFile(conference.id, cameraMods.id, PaperFileKind.SLIDES, 'cam-mods.ppt', lea.id);
  await addFile(
    conference.id,
    cameraMods.id,
    PaperFileKind.CAMERA_READY,
    'cam-mods-final.pdf',
    lea.id,
  );
  await addFile(
    conference.id,
    cameraMods.id,
    PaperFileKind.EDITABLE,
    'cam-mods-final.docx',
    lea.id,
  );
  await assign(
    cameraMods.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-camera-mods',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 7,
        confidence: 4,
        commentsToAuthor: 'OK.',
        commentsToCommittee: 'OK.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: cameraMods.id,
      outcome: 'ACCEPTED',
      letter: 'DEMO-2027-0018 est accepté sans modification.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-16T16:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.paper.update({
    where: { id: cameraMods.id },
    data: {
      slidesStatus: SlidesStatus.VALIDATED,
      presentedAt: new Date('2026-10-16T17:00:00.000Z'),
      cameraReadyStatus: CameraReadyStatus.NEEDS_MODS,
    },
  });
  await prisma.cameraReadyRemark.createMany({
    data: [
      {
        paperId: cameraMods.id,
        text: 'Corriger la numérotation des figures.',
        status: RemarkStatus.OPEN,
        round: 1,
        sortOrder: 0,
      },
      {
        paperId: cameraMods.id,
        text: 'Remplacer le PDF par la version avec DOI interne.',
        status: RemarkStatus.OPEN,
        round: 1,
        sortOrder: 1,
      },
    ],
  });

  const cameraWill = await submittedPaper(conference.id, systems?.id, lea, {
    publicId: 'DEMO-2027-0019',
    title: 'Camera ready will deposer — nouvelle version',
    abstract: 'Auteur a redéposé après remarques. État : will deposer.',
    keywords: ['camera', 'will'],
  });
  await addFile(
    conference.id,
    cameraWill.id,
    PaperFileKind.MANUSCRIPT,
    'cam-will.pdf',
    lea.id,
  );
  await addFile(conference.id, cameraWill.id, PaperFileKind.SLIDES, 'cam-will.ppt', lea.id);
  await addFile(
    conference.id,
    cameraWill.id,
    PaperFileKind.CAMERA_READY,
    'cam-will-final.pdf',
    lea.id,
  );
  await addFile(
    conference.id,
    cameraWill.id,
    PaperFileKind.EDITABLE,
    'cam-will-final.zip',
    lea.id,
  );
  await assign(
    cameraWill.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-camera-will',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 8,
        confidence: 4,
        commentsToAuthor: 'OK.',
        commentsToCommittee: 'OK.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: cameraWill.id,
      outcome: 'ACCEPTED',
      letter: 'DEMO-2027-0019 est accepté sans modification.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-16T18:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.paper.update({
    where: { id: cameraWill.id },
    data: {
      slidesStatus: SlidesStatus.VALIDATED,
      presentedAt: new Date('2026-10-16T19:00:00.000Z'),
      cameraReadyStatus: CameraReadyStatus.WILL_DEPOSIT,
    },
  });
  await prisma.cameraReadyRemark.createMany({
    data: [
      {
        paperId: cameraWill.id,
        text: 'Corriger la numérotation des figures.',
        status: RemarkStatus.VALIDATED,
        round: 1,
        sortOrder: 0,
        validatedAt: new Date('2026-10-17T09:00:00.000Z'),
        validatedById: admin.id,
      },
      {
        paperId: cameraWill.id,
        text: 'Mettre à jour la bibliographie.',
        status: RemarkStatus.ADDRESSED,
        round: 1,
        sortOrder: 1,
        addressedAt: new Date('2026-10-17T08:00:00.000Z'),
      },
    ],
  });

  const simOpen = await submittedPaper(conference.id, systems?.id, lea, {
    publicId: 'DEMO-2027-0020',
    title: 'Similarity is open — dépôt rapport',
    abstract: 'Camera ready validée. État : Similarity is open.',
    keywords: ['similarité', 'ouvert'],
  });
  await addFile(conference.id, simOpen.id, PaperFileKind.MANUSCRIPT, 'sim-open.pdf', lea.id);
  await addFile(conference.id, simOpen.id, PaperFileKind.SLIDES, 'sim-open.ppt', lea.id);
  await addFile(
    conference.id,
    simOpen.id,
    PaperFileKind.CAMERA_READY,
    'sim-open-final.pdf',
    lea.id,
  );
  await addFile(
    conference.id,
    simOpen.id,
    PaperFileKind.EDITABLE,
    'sim-open-final.docx',
    lea.id,
  );
  await assign(
    simOpen.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-sim-open',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 8,
        confidence: 4,
        commentsToAuthor: 'OK.',
        commentsToCommittee: 'OK.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: simOpen.id,
      outcome: 'ACCEPTED',
      letter: 'DEMO-2027-0020 est accepté sans modification.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-17T10:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.paper.update({
    where: { id: simOpen.id },
    data: {
      slidesStatus: SlidesStatus.VALIDATED,
      presentedAt: new Date('2026-10-17T11:00:00.000Z'),
      cameraReadyStatus: CameraReadyStatus.VALIDATED,
      templateValidatedAt: new Date('2026-10-17T11:30:00.000Z'),
      similarityStatus: SimilarityStatus.OPEN,
    },
  });

  const simCheck = await submittedPaper(conference.id, systems?.id, lea, {
    publicId: 'DEMO-2027-0021',
    title: 'Similarity under checking',
    abstract: 'Rapport déposé (< 20 %). État : Under checking.',
    keywords: ['similarité', 'vérification'],
  });
  await addFile(
    conference.id,
    simCheck.id,
    PaperFileKind.MANUSCRIPT,
    'sim-check.pdf',
    lea.id,
  );
  await addFile(conference.id, simCheck.id, PaperFileKind.SLIDES, 'sim-check.ppt', lea.id);
  await addFile(
    conference.id,
    simCheck.id,
    PaperFileKind.CAMERA_READY,
    'sim-check-final.pdf',
    lea.id,
  );
  await addFile(
    conference.id,
    simCheck.id,
    PaperFileKind.EDITABLE,
    'sim-check-final.docx',
    lea.id,
  );
  await addFile(
    conference.id,
    simCheck.id,
    PaperFileKind.SIMILARITY,
    'sim-check-report.pdf',
    lea.id,
  );
  await assign(
    simCheck.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-sim-check',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 8,
        confidence: 4,
        commentsToAuthor: 'OK.',
        commentsToCommittee: 'OK.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: simCheck.id,
      outcome: 'ACCEPTED',
      letter: 'DEMO-2027-0021 est accepté sans modification.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-17T12:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.similarityReport.create({
    data: {
      paperId: simCheck.id,
      percentage: 14.2,
      note: 'Rapport déposé, en attente de validation admin.',
    },
  });
  await prisma.paper.update({
    where: { id: simCheck.id },
    data: {
      slidesStatus: SlidesStatus.VALIDATED,
      presentedAt: new Date('2026-10-17T13:00:00.000Z'),
      cameraReadyStatus: CameraReadyStatus.VALIDATED,
      templateValidatedAt: new Date('2026-10-17T13:30:00.000Z'),
      similarityStatus: SimilarityStatus.DEPOSITED,
    },
  });

  const copyOpen = await submittedPaper(conference.id, systems?.id, lea, {
    publicId: 'DEMO-2027-0022',
    title: 'Copyright is open — dépôt formulaire',
    abstract: 'Similarité validée. État : Copyright is open.',
    keywords: ['copyright', 'ouvert'],
  });
  await addFile(conference.id, copyOpen.id, PaperFileKind.MANUSCRIPT, 'copy-open.pdf', lea.id);
  await addFile(conference.id, copyOpen.id, PaperFileKind.SLIDES, 'copy-open.ppt', lea.id);
  await addFile(
    conference.id,
    copyOpen.id,
    PaperFileKind.CAMERA_READY,
    'copy-open-final.pdf',
    lea.id,
  );
  await addFile(
    conference.id,
    copyOpen.id,
    PaperFileKind.EDITABLE,
    'copy-open-final.docx',
    lea.id,
  );
  await addFile(
    conference.id,
    copyOpen.id,
    PaperFileKind.SIMILARITY,
    'copy-open-sim.pdf',
    lea.id,
  );
  await assign(
    copyOpen.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-copy-open',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 8,
        confidence: 4,
        commentsToAuthor: 'OK.',
        commentsToCommittee: 'OK.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: copyOpen.id,
      outcome: 'ACCEPTED',
      letter: 'DEMO-2027-0022 est accepté sans modification.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-17T14:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.similarityReport.create({
    data: {
      paperId: copyOpen.id,
      percentage: 11.5,
      note: 'Validé.',
      verifiedAt: new Date('2026-10-17T14:30:00.000Z'),
    },
  });
  await prisma.paper.update({
    where: { id: copyOpen.id },
    data: {
      slidesStatus: SlidesStatus.VALIDATED,
      presentedAt: new Date('2026-10-17T15:00:00.000Z'),
      cameraReadyStatus: CameraReadyStatus.VALIDATED,
      templateValidatedAt: new Date('2026-10-17T15:10:00.000Z'),
      similarityStatus: SimilarityStatus.VALIDATED,
      copyrightStageStatus: CopyrightStageStatus.OPEN,
    },
  });

  const copyCheck = await submittedPaper(conference.id, systems?.id, lea, {
    publicId: 'DEMO-2027-0023',
    title: 'Copyright under checking',
    abstract: 'Formulaire déposé. État : Under checking.',
    keywords: ['copyright', 'vérification'],
  });
  await addFile(
    conference.id,
    copyCheck.id,
    PaperFileKind.MANUSCRIPT,
    'copy-check.pdf',
    lea.id,
  );
  await addFile(conference.id, copyCheck.id, PaperFileKind.SLIDES, 'copy-check.ppt', lea.id);
  await addFile(
    conference.id,
    copyCheck.id,
    PaperFileKind.CAMERA_READY,
    'copy-check-final.pdf',
    lea.id,
  );
  await addFile(
    conference.id,
    copyCheck.id,
    PaperFileKind.EDITABLE,
    'copy-check-final.docx',
    lea.id,
  );
  await addFile(
    conference.id,
    copyCheck.id,
    PaperFileKind.SIMILARITY,
    'copy-check-sim.pdf',
    lea.id,
  );
  await addFile(
    conference.id,
    copyCheck.id,
    PaperFileKind.COPYRIGHT,
    'copy-check-form.pdf',
    lea.id,
  );
  await assign(
    copyCheck.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.COMPLETED,
    'completed-copy-check',
    {
      form: {
        recommendation: 'ACCEPT',
        score: 8,
        confidence: 4,
        commentsToAuthor: 'OK.',
        commentsToCommittee: 'OK.',
      },
    },
  );
  await prisma.decision.create({
    data: {
      paperId: copyCheck.id,
      outcome: 'ACCEPTED',
      letter: 'DEMO-2027-0023 est accepté sans modification.',
      status: 'PUBLISHED',
      publishedAt: new Date('2026-10-17T16:00:00.000Z'),
      decidedById: admin.id,
    },
  });
  await prisma.similarityReport.create({
    data: {
      paperId: copyCheck.id,
      percentage: 9.8,
      note: 'Validé.',
      verifiedAt: new Date('2026-10-17T16:20:00.000Z'),
    },
  });
  await prisma.copyrightRecord.create({
    data: { paperId: copyCheck.id, status: 'PENDING' },
  });
  await prisma.paper.update({
    where: { id: copyCheck.id },
    data: {
      slidesStatus: SlidesStatus.VALIDATED,
      presentedAt: new Date('2026-10-17T17:00:00.000Z'),
      cameraReadyStatus: CameraReadyStatus.VALIDATED,
      templateValidatedAt: new Date('2026-10-17T17:10:00.000Z'),
      similarityStatus: SimilarityStatus.VALIDATED,
      copyrightStageStatus: CopyrightStageStatus.DEPOSITED,
    },
  });

  await prisma.conflictDeclaration.create({
    data: {
      conferenceId: conference.id,
      userId: reviewer.id,
      paperId: waiting.id,
      authorEmail: lea.email,
      reason: 'Julien a déjà publié avec Léa. Il décline cette évaluation.',
      declaredById: reviewer.id,
    },
  });
  await assign(
    copyrightRejected.id,
    reviewer.id,
    admin.id,
    AssignmentStatus.INVITED,
    'invited-copyright',
  );

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
      modality: 'IN_PERSON',
      score: 8,
      comment: 'Exposé clair, questions sur l’identifiant public.',
      presentedAt: new Date('2026-10-12T15:00:00.000Z'),
    },
  });
  await prisma.presentation.create({
    data: {
      sessionId: afternoon.id,
      paperId: cameraOpen.id,
      modality: 'ONLINE',
      comment: '',
    },
  });
  await prisma.paper.update({
    where: { id: cameraOpen.id },
    data: {
      sessionChairIds: [reviewer.id],
      presentedAt: null,
      sessionComment: '',
    },
  });
  await prisma.presentation.create({
    data: {
      sessionId: morning.id,
      paperId: cameraCheck.id,
      modality: 'IN_PERSON',
      score: 9,
      comment: 'Bonne présentation, questions sur le camera-ready.',
      presentedAt: new Date('2026-10-16T15:00:00.000Z'),
    },
  });
  await prisma.paper.update({
    where: { id: cameraCheck.id },
    data: {
      sessionChairIds: [admin.id],
      sessionComment: 'Bonne présentation, questions sur le camera-ready.',
    },
  });
  await prisma.presentation.create({
    data: {
      sessionId: afternoon.id,
      paperId: conditional.id,
      modality: 'IN_PERSON',
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
        userId: auteur2.id,
        status: 'REQUESTED',
        paymentStatus: 'PENDING',
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

  console.log(`
Seed OK — comptes (mot de passe ${DEMO_PASSWORD}) :
  admin@demo.scholarflow.test       Admin / chair
  chercheur@demo.scholarflow.test   Auteur Léa (présentations / workflow)
  auteur2@demo.scholarflow.test     Auteur Samir (paiement under check)
  reviewer@demo.scholarflow.test    Évaluateur
  committee@demo.scholarflow.test   Comité
  superadmin@demo.scholarflow.test  Superadmin

États utiles :
  0001  Accepté + Presented (planning + remarques chair) + paiement OK
  0005  Mods mineures + checklist remarques
  0006  Mods majeures + checklist + révision déposée
  0007  Non accepté
  0010  Accepté, présentation OPEN, copyright rejeté
  0011  Under check receipt (compte auteur2)
  0012  Presentation is open
  0013  Presentation deposited
  0014  Presentation not comfort + checklist
  0015  Presentation will deposer
  0016  Scheduled (online) + Camera ready is open — session chair = reviewer
  0017  Camera ready under checking
  0018  Camera ready not comfort + checklist
  0019  Camera ready will deposer
  0020  Similarity is open
  0021  Similarity under checking
  0022  Copyright is open
  0023  Copyright under checking
`);

  const doctoral = await prisma.conference.create({
    data: {
      slug: 'doctorales-2027',
      name: 'Journées doctorales Rhône 2027',
      shortName: 'DOC2027',
      description:
        'Seconde conférence. Léa et Julien sont invités : ils acceptent ou refusent depuis la liste des conférences. Une invitation externe reste en attente.',
      city: 'Lyon',
      country: 'France',
      startsOn: new Date('2027-09-10T00:00:00.000Z'),
      endsOn: new Date('2027-09-11T00:00:00.000Z'),
      status: 'PUBLISHED',
      visibility: 'PUBLIC',
      reviewMode: 'SINGLE_BLIND',
      createdById: admin.id,
      nextPaperNumber: 1,
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
            userId: admin.id,
            role: ConferenceRole.CHAIR,
            status: MembershipStatus.ACTIVE,
          },
          {
            userId: chercheur.id,
            role: ConferenceRole.AUTHOR,
            status: MembershipStatus.INVITED,
          },
          {
            userId: reviewer.id,
            role: ConferenceRole.REVIEWER,
            status: MembershipStatus.INVITED,
          },
        ],
      },
    },
  });
  const inviteUntil = new Date('2027-06-01T23:59:00.000Z');
  await prisma.conferenceInvitation.createMany({
    data: [
      {
        conferenceId: doctoral.id,
        email: chercheur.email,
        role: ConferenceRole.AUTHOR,
        tokenHash: createHash('sha256').update('invite-lea-doctorales').digest('hex'),
        expiresAt: inviteUntil,
        invitedById: admin.id,
      },
      {
        conferenceId: doctoral.id,
        email: reviewer.email,
        role: ConferenceRole.REVIEWER,
        tokenHash: createHash('sha256').update('invite-julien-doctorales').digest('hex'),
        expiresAt: inviteUntil,
        invitedById: admin.id,
      },
      {
        conferenceId: doctoral.id,
        email: 'collegue@demo.scholarflow.test',
        role: ConferenceRole.AUTHOR,
        tokenHash: createHash('sha256')
          .update('invite-collegue-doctorales')
          .digest('hex'),
        expiresAt: inviteUntil,
        invitedById: admin.id,
      },
    ],
  });

  await prisma.conference.create({
    data: {
      slug: 'atelier-brouillon',
      name: 'Atelier encore en brouillon',
      shortName: 'ATELIER',
      description: 'Conférence non publiée. Camille peut la publier depuis sa fiche.',
      city: 'Lyon',
      country: 'France',
      startsOn: new Date('2027-11-04T00:00:00.000Z'),
      endsOn: new Date('2027-11-04T00:00:00.000Z'),
      status: 'DRAFT',
      visibility: 'UNLISTED',
      reviewMode: 'DOUBLE_BLIND',
      createdById: admin.id,
      memberships: {
        create: [
          {
            userId: admin.id,
            role: ConferenceRole.CHAIR,
            status: MembershipStatus.ACTIVE,
          },
        ],
      },
    },
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
      submittedAt: new Date('2026-10-11T12:00:00.000Z'),
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
      respondedAt:
        extra?.respondedAt ??
        (status === AssignmentStatus.INVITED
          ? null
          : new Date('2026-10-11T12:30:00.000Z')),
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
