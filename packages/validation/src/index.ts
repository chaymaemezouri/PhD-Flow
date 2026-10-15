import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.literal('scholarflow-api'),
  version: z.string().min(1),
  timestamp: z.iso.datetime(),
  checks: z.object({
    api: z.literal('up'),
    database: z.enum(['up', 'down']),
  }),
});

export const interfacePreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  language: z.enum(['en', 'fr']),
});

const passwordSchema = z
  .string()
  .min(12)
  .max(128)
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .refine(
    (value) => value === '' || /^https?:\/\//.test(value),
    'Use an http or https URL',
  );

export const registerSchema = z.object({
  email: z.email(),
  password: passwordSchema,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(128),
  mfaCode: z.string().trim().max(8).optional(),
});

export const reviewFormSchema = z.object({
  recommendation: z.enum([
    'ACCEPT',
    'WEAK_ACCEPT',
    'BORDERLINE',
    'WEAK_REJECT',
    'REJECT',
  ]),
  score: z.number().int().min(1).max(10),
  confidence: z.number().int().min(1).max(5),
  commentsToAuthor: z.string().trim().min(10).max(4000),
  commentsToCommittee: z.string().trim().max(4000).default(''),
});

export const decisionSchema = z.object({
  outcome: z.enum([
    'ACCEPTED',
    'CONDITIONALLY_ACCEPTED',
    'REVISION_REQUIRED',
    'REJECTED',
  ]),
  letter: z.string().trim().min(10).max(4000),
  publish: z.boolean().default(false),
});

export const similaritySchema = z.object({
  percentage: z.number().min(0).max(100),
  note: z.string().trim().max(500).default(''),
});

export const roomSchema = z.object({
  name: z.string().trim().min(1).max(80),
  capacity: z.number().int().min(1).max(2000).default(40),
});

export const sessionSchema = z.object({
  roomId: z.uuid(),
  title: z.string().trim().min(1).max(160),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

export const presentationSchema = z.object({
  paperId: z.uuid(),
});

export const assessmentSchema = z.object({
  score: z.number().int().min(1).max(10),
  comment: z.string().trim().max(1000).default(''),
});

export const mfaConfirmSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});

export const emailOnlySchema = z.object({
  email: z.email(),
});

export const tokenSchema = z.object({
  token: z.string().trim().min(20).max(200),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20).max(200),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const educationStepSchema = z.object({
  year: z.string().trim().min(1).max(32),
  title: z.string().trim().min(1).max(160),
  place: z.string().trim().min(1).max(160),
});

export const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  academicTitle: z.string().trim().max(80),
  institution: z.string().trim().max(160),
  laboratory: z.string().trim().max(160),
  department: z.string().trim().max(160),
  country: z.string().trim().max(80),
  city: z.string().trim().max(80),
  disciplines: z.array(z.string().trim().min(1).max(80)).max(20),
  interests: z.string().trim().max(500),
  biography: z.string().trim().max(2000),
  education: z.array(educationStepSchema).max(12),
  orcid: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i.test(value),
      'Invalid ORCID',
    ),
  googleScholarUrl: optionalUrl,
  website: optionalUrl,
  language: z.enum(['en', 'fr']),
});

export const currentUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  platformRole: z.enum(['RESEARCHER', 'SYSTEM_ADMIN']),
  emailVerified: z.boolean(),
  mfaEnabled: z.boolean(),
  profile: z.object({
    firstName: z.string(),
    lastName: z.string(),
    academicTitle: z.string().nullable(),
    institution: z.string().nullable(),
    laboratory: z.string().nullable(),
    department: z.string().nullable(),
    country: z.string().nullable(),
    city: z.string().nullable(),
    disciplines: z.array(z.string()),
    interests: z.string().nullable(),
    biography: z.string().nullable(),
    photoPath: z.string().nullable(),
    education: z.array(educationStepSchema),
    orcid: z.string().nullable(),
    googleScholarUrl: z.string().nullable(),
    website: z.string().nullable(),
    language: z.enum(['en', 'fr']),
  }),
});

const daySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const conferenceFieldsSchema = z.object({
  name: z.string().trim().min(3).max(160),
  shortName: z.string().trim().min(2).max(40),
  description: z.string().trim().max(4000).default(''),
  website: optionalUrl.default(''),
  city: z.string().trim().max(80).default(''),
  country: z.string().trim().max(80).default(''),
  startsOn: daySchema.nullable().default(null),
  endsOn: daySchema.nullable().default(null),
  timezone: z.string().trim().min(1).max(64).default('UTC'),
  visibility: z.enum(['PUBLIC', 'UNLISTED']).default('PUBLIC'),
  reviewMode: z.enum(['SINGLE_BLIND', 'DOUBLE_BLIND', 'OPEN']).default('DOUBLE_BLIND'),
  paymentsEnabled: z.boolean().default(false),
});

function datesInOrder(value: {
  startsOn?: string | null;
  endsOn?: string | null;
}): boolean {
  return !value.startsOn || !value.endsOn || value.endsOn >= value.startsOn;
}

export const createConferenceSchema = conferenceFieldsSchema.refine(datesInOrder, {
  path: ['endsOn'],
  message: 'The end date is before the start date',
});

export const updateConferenceSchema = z
  .object({
    name: z.string().trim().min(3).max(160).optional(),
    shortName: z.string().trim().min(2).max(40).optional(),
    description: z.string().trim().max(4000).optional(),
    website: optionalUrl.optional(),
    city: z.string().trim().max(80).optional(),
    country: z.string().trim().max(80).optional(),
    startsOn: daySchema.nullable().optional(),
    endsOn: daySchema.nullable().optional(),
    timezone: z.string().trim().min(1).max(64).optional(),
    visibility: z.enum(['PUBLIC', 'UNLISTED']).optional(),
    reviewMode: z.enum(['SINGLE_BLIND', 'DOUBLE_BLIND', 'OPEN']).optional(),
    paymentsEnabled: z.boolean().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  })
  .refine(datesInOrder, {
    path: ['endsOn'],
    message: 'The end date is before the start date',
  });

export const trackSchema = z.object({
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .min(2)
    .max(12)
    .regex(/^[A-Za-z0-9]+$/, 'Use letters and numbers only'),
  description: z.string().trim().max(1000).default(''),
});

export const deadlineSchema = z.object({
  kind: z.enum(['SUBMISSION', 'REVIEW', 'NOTIFICATION', 'CAMERA_READY', 'REGISTRATION']),
  label: z.string().trim().max(120).default(''),
  dueAt: z.iso.datetime(),
  trackId: z.uuid().nullable().default(null),
});

export const templateSchema = z.object({
  kind: z.enum(['INVITATION', 'DECISION_LETTER', 'COPYRIGHT', 'NOTIFICATION']),
  language: z.enum(['en', 'fr']),
  subject: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(8000),
});

export const inviteMemberSchema = z.object({
  email: z.email(),
  role: z.enum(['ADMINISTRATOR', 'COMMITTEE', 'REVIEWER', 'AUTHOR']),
});

export const invitationResponseSchema = z.object({
  accept: z.boolean(),
});

export const membershipStatusSchema = z.object({
  status: z.enum(['REMOVED']),
});

const paperAuthorSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.email(),
  affiliation: z.string().trim().max(160).default(''),
  corresponding: z.boolean().default(false),
});

export const createPaperSchema = z.object({
  title: z.string().trim().min(3).max(300),
  abstract: z.string().trim().max(5000).default(''),
  keywords: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  trackId: z.uuid().nullable().default(null),
  authors: z.array(paperAuthorSchema).max(20).default([]),
});

export const updatePaperSchema = z.object({
  title: z.string().trim().min(3).max(300).optional(),
  abstract: z.string().trim().max(5000).optional(),
  keywords: z.array(z.string().trim().min(1).max(40)).max(12).optional(),
  trackId: z.uuid().nullable().optional(),
});

export const replaceAuthorsSchema = z.object({
  authors: z.array(paperAuthorSchema).min(1).max(20),
});

export const withdrawPaperSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const assignReviewerSchema = z.object({
  reviewerId: z.uuid(),
});

export const conflictSchema = z
  .object({
    userId: z.uuid(),
    paperId: z.uuid().nullable().default(null),
    authorEmail: z.email().nullable().default(null),
    reason: z.string().trim().max(500).default(''),
  })
  .refine((value) => value.paperId !== null || value.authorEmail !== null, {
    message: 'Name a paper or an author email',
  });

export const declineAssignmentSchema = z.object({
  reason: z.string().trim().max(500).default(''),
});

export const apiErrorSchema = z.object({
  statusCode: z.number().int(),
  error: z.string(),
  message: z.string(),
  path: z.string(),
  timestamp: z.iso.datetime(),
  requestId: z.string().nullable(),
});
