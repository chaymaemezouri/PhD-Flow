import { focusStep, type PaperStep } from '@/components/step-bar';

export type AdminBoard =
  | 'all'
  | 'todo'
  | 'scope'
  | 'reviews'
  | 'decisions'
  | 'registration'
  | 'presentation'
  | 'camera'
  | 'copyright'
  | 'published'
  | 'blocked'
  | 'clear';

export const ADMIN_BOARDS: AdminBoard[] = [
  'all',
  'todo',
  'scope',
  'reviews',
  'decisions',
  'registration',
  'presentation',
  'camera',
  'copyright',
  'published',
  'blocked',
  'clear',
];

const CAMERA_KEYS = new Set(['editable', 'cameraPdf', 'template', 'similarity']);

export interface AdminPaper {
  status: string;
  doi?: string | null;
  scopeStatus?: string;
  assignmentCount?: number;
  decision?: { outcome: string; status: string } | null;
  steps?: PaperStep[];
}

export function parseAdminBoard(value: string | null): AdminBoard {
  if (value === 'waiting') {
    return 'todo';
  }
  return ADMIN_BOARDS.includes(value as AdminBoard) ? (value as AdminBoard) : 'all';
}

function stepOf(paper: AdminPaper, key: string): PaperStep | undefined {
  return paper.steps?.find((step) => step.key === key);
}

/** UI lane only — same admin procedure, grouped so the board is easy to scan. */
export function adminLane(paper: AdminPaper): Exclude<AdminBoard, 'all' | 'todo'> {
  if (paper.status === 'WITHDRAWN' || paper.status === 'CANCELLED') {
    return 'blocked';
  }
  if (paper.status === 'DRAFT') {
    return 'clear';
  }
  if (paper.doi) {
    return 'published';
  }
  if (paper.scopeStatus === 'REFUSED') {
    return 'blocked';
  }

  const notification = stepOf(paper, 'notification');
  const revisionOpen =
    paper.decision?.outcome === 'REVISION_REQUIRED' ||
    paper.decision?.outcome === 'CONDITIONALLY_ACCEPTED';
  const beforeDecision =
    revisionOpen || notification?.state !== 'done' || !notification;

  if (beforeDecision) {
    if (notification?.state === 'failed' || paper.decision?.outcome === 'REJECTED') {
      return 'blocked';
    }
    if (revisionOpen) {
      return 'decisions';
    }
    if (paper.scopeStatus !== 'ACCEPTED' && (paper.assignmentCount ?? 0) === 0) {
      return 'scope';
    }
    return (paper.assignmentCount ?? 0) === 0 ? 'reviews' : 'decisions';
  }

  const registration = stepOf(paper, 'registration');
  if (registration && registration.state !== 'done') {
    return registration.state === 'failed' ? 'blocked' : 'registration';
  }

  const presentation = stepOf(paper, 'presentation');
  if (presentation && presentation.state !== 'done') {
    return presentation.state === 'failed' ? 'blocked' : 'presentation';
  }

  for (const key of CAMERA_KEYS) {
    const camera = stepOf(paper, key);
    if (camera && camera.state !== 'done') {
      return camera.state === 'failed' ? 'blocked' : 'camera';
    }
  }

  const copyright = stepOf(paper, 'copyright');
  if (copyright && copyright.state !== 'done') {
    return copyright.state === 'failed' ? 'blocked' : 'copyright';
  }

  return 'clear';
}

export function matchesAdminBoard(paper: AdminPaper, board: AdminBoard): boolean {
  if (board === 'all') {
    return true;
  }
  const lane = adminLane(paper);
  if (board === 'todo') {
    return lane !== 'published' && lane !== 'clear' && paper.status !== 'DRAFT';
  }
  if (board === 'blocked') {
    return lane === 'blocked' || focusStep(paper.steps ?? [])?.state === 'failed';
  }
  if (board === 'clear') {
    return lane === 'clear' && paper.status !== 'DRAFT';
  }
  return lane === board;
}

export function adminBoardCounts(papers: AdminPaper[]): Record<AdminBoard, number> {
  const counts = Object.fromEntries(ADMIN_BOARDS.map((board) => [board, 0])) as Record<
    AdminBoard,
    number
  >;
  counts.all = papers.length;
  for (const paper of papers) {
    for (const board of ADMIN_BOARDS) {
      if (board === 'all') {
        continue;
      }
      if (matchesAdminBoard(paper, board)) {
        counts[board] += 1;
      }
    }
  }
  return counts;
}

export function isPublishedPaper(paper: AdminPaper): boolean {
  if (
    paper.status === 'DRAFT' ||
    paper.status === 'WITHDRAWN' ||
    paper.status === 'CANCELLED'
  ) {
    return false;
  }
  return Boolean(paper.doi);
}

export function isReadyToPublish(paper: AdminPaper): boolean {
  if (isPublishedPaper(paper)) {
    return false;
  }
  return adminLane(paper) === 'clear' && paper.status !== 'DRAFT';
}
