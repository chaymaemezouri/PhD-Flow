export type ServiceStatus = 'ok' | 'degraded';
export type CheckStatus = 'up' | 'down';

export interface HealthChecks {
  api: 'up';
  database: CheckStatus;
}

export interface HealthResponse {
  status: ServiceStatus;
  service: 'scholarflow-api';
  version: string;
  timestamp: string;
  checks: HealthChecks;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  path: string;
  timestamp: string;
  requestId: string | null;
}

export type InterfaceTheme = 'light' | 'dark' | 'system';
export type InterfaceLanguage = 'en' | 'fr';

export interface InterfacePreferences {
  theme: InterfaceTheme;
  language: InterfaceLanguage;
}

export type PlatformRole = 'RESEARCHER' | 'SYSTEM_ADMIN';

export interface EducationStep {
  year: string;
  title: string;
  place: string;
}

export interface AccountProfile {
  firstName: string;
  lastName: string;
  academicTitle: string | null;
  institution: string | null;
  laboratory: string | null;
  department: string | null;
  country: string | null;
  city: string | null;
  disciplines: string[];
  interests: string | null;
  biography: string | null;
  photoPath: string | null;
  education: EducationStep[];
  orcid: string | null;
  googleScholarUrl: string | null;
  website: string | null;
  language: InterfaceLanguage;
}

export interface CurrentUser {
  id: string;
  email: string;
  platformRole: PlatformRole;
  emailVerified: boolean;
  mfaEnabled: boolean;
  profile: AccountProfile;
}

export type ConferenceVisibility = 'PUBLIC' | 'UNLISTED';
export type ConferenceStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type ReviewMode = 'SINGLE_BLIND' | 'DOUBLE_BLIND' | 'OPEN';
export type ConferenceRole =
  'CHAIR' | 'ADMINISTRATOR' | 'COMMITTEE' | 'REVIEWER' | 'AUTHOR';
export type MembershipStatus = 'INVITED' | 'ACTIVE' | 'DECLINED' | 'REMOVED';
export type DeadlineKind =
  'SUBMISSION' | 'REVIEW' | 'NOTIFICATION' | 'CAMERA_READY' | 'REGISTRATION';
export type TemplateKind =
  'INVITATION' | 'DECISION_LETTER' | 'COPYRIGHT' | 'NOTIFICATION';

export interface PublicConference {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  description: string;
  website: string | null;
  city: string | null;
  country: string | null;
  startsOn: string | null;
  endsOn: string | null;
  timezone: string;
  reviewMode: ReviewMode;
  tracks: { id: string; name: string; code: string; description: string }[];
  deadlines: {
    id: string;
    kind: DeadlineKind;
    label: string;
    dueAt: string;
    trackId: string | null;
  }[];
}

export interface ConferenceMember {
  id: string;
  email: string;
  role: ConferenceRole;
  status: MembershipStatus;
  firstName: string;
  lastName: string;
}
