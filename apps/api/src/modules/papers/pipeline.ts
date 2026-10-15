export type StepState = 'done' | 'pending' | 'failed';

export interface PaperStep {
  key: string;
  state: StepState;
}

interface PipelinePaper {
  status: string;
  trackId: string | null;
  createdById: string;
  conferenceId: string;
  templateValidatedAt: Date | null;
  decision: { status: string; outcome: string } | null;
  similarity: { percentage: number; verifiedAt: Date | null } | null;
  copyright: { status: string } | null;
  presentation: { id: string } | null;
  files: { kind: string }[];
}

interface RegistrationFact {
  conferenceId: string;
  userId: string;
  status: string;
}

const ACCEPTED = new Set(['ACCEPTED', 'CONDITIONALLY_ACCEPTED']);

export function paperSteps(
  paper: PipelinePaper,
  registrations: RegistrationFact[],
): PaperStep[] {
  const submitted = paper.status === 'SUBMITTED' || paper.status === 'WITHDRAWN';
  const published = paper.decision?.status === 'PUBLISHED' ? paper.decision : null;
  const registration = registrations.find(
    (item) =>
      item.conferenceId === paper.conferenceId && item.userId === paper.createdById,
  );
  const has = (kind: string) => paper.files.some((file) => file.kind === kind);

  return [
    { key: 'submission', state: submissionState(paper.status, submitted) },
    { key: 'notification', state: notificationState(published) },
    { key: 'track', state: paper.trackId ? 'done' : 'pending' },
    { key: 'presentation', state: paper.presentation ? 'done' : 'pending' },
    { key: 'registration', state: registrationState(registration?.status) },
    { key: 'editable', state: has('EDITABLE') ? 'done' : 'pending' },
    { key: 'cameraPdf', state: has('CAMERA_READY') ? 'done' : 'pending' },
    { key: 'template', state: paper.templateValidatedAt ? 'done' : 'pending' },
    { key: 'similarity', state: similarityState(paper.similarity) },
    { key: 'copyright', state: copyrightState(paper.copyright?.status) },
  ];
}

function submissionState(status: string, submitted: boolean): StepState {
  if (status === 'WITHDRAWN') {
    return 'failed';
  }
  return submitted ? 'done' : 'pending';
}

function notificationState(decision: { outcome: string } | null): StepState {
  if (!decision) {
    return 'pending';
  }
  if (decision.outcome === 'REJECTED') {
    return 'failed';
  }
  return ACCEPTED.has(decision.outcome) || decision.outcome === 'REVISION_REQUIRED'
    ? 'done'
    : 'pending';
}

function registrationState(status: string | undefined): StepState {
  if (status === 'VERIFIED') {
    return 'done';
  }
  if (status === 'REJECTED') {
    return 'failed';
  }
  return 'pending';
}

function similarityState(
  report: { percentage: number; verifiedAt: Date | null } | null,
): StepState {
  if (!report) {
    return 'pending';
  }
  if (report.percentage >= 20) {
    return 'failed';
  }
  return report.verifiedAt ? 'done' : 'pending';
}

function copyrightState(status: string | undefined): StepState {
  if (status === 'VALIDATED') {
    return 'done';
  }
  if (status === 'REJECTED') {
    return 'failed';
  }
  return 'pending';
}
