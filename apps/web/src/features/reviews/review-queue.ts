import { apiErrorMessage, apiFetch } from '@/services/api';

export type ReviewBoard = 'all' | 'invited' | 'active' | 'waiting' | 'done';

export interface ReviewAssignment {
  id: string;
  paperId: string;
  conferenceId?: string;
  conferenceName?: string | null;
  paperTitle: string;
  publicId: string | null;
  status: string;
  score: number | null;
  recommendation: string | null;
  commentsToAuthor: string | null;
  expiresAt: string;
  decisionOutcome?: string | null;
  hasRevision?: boolean;
  revisionFile?: {
    kind: string;
    originalName: string;
    contentType?: string | null;
    sizeBytes?: number | null;
  } | null;
  awaitingAuthorRevision?: boolean;
  needsRereview?: boolean;
}

const REVIEW_BOARDS: ReviewBoard[] = ['all', 'invited', 'active', 'waiting', 'done'];

export function parseReviewBoard(value: string | null): ReviewBoard {
  return REVIEW_BOARDS.includes(value as ReviewBoard) ? (value as ReviewBoard) : 'all';
}

export function reviewTodoCount(counts: Record<ReviewBoard, number>): number {
  return counts.invited + counts.active;
}

export function reviewHref(id: string): string {
  return `/workspace/reviews/${id}`;
}

export async function loadMyReviews(): Promise<ReviewAssignment[]> {
  const response = await apiFetch('/api/v1/reviews/mine');
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<ReviewAssignment[]>;
}

export function reviewBoardOf(item: ReviewAssignment): ReviewBoard {
  if (item.awaitingAuthorRevision) {
    return 'waiting';
  }
  if (item.needsRereview) {
    return 'active';
  }
  if (item.status === 'INVITED') {
    return 'invited';
  }
  if (
    item.status === 'ACCEPTED' ||
    item.status === 'IN_PROGRESS' ||
    item.status === 'OVERDUE'
  ) {
    return 'active';
  }
  if (item.status === 'COMPLETED') {
    return 'done';
  }
  return 'all';
}

export function reviewQueueCounts(items: ReviewAssignment[]): Record<ReviewBoard, number> {
  const counts: Record<ReviewBoard, number> = {
    all: items.length,
    invited: 0,
    active: 0,
    waiting: 0,
    done: 0,
  };
  for (const item of items) {
    const board = reviewBoardOf(item);
    if (board !== 'all') {
      counts[board] += 1;
    }
  }
  return counts;
}

export function matchesReviewSearch(item: ReviewAssignment, needle: string): boolean {
  if (!needle) {
    return true;
  }
  return (
    item.paperTitle.toLowerCase().includes(needle) ||
    (item.publicId ?? '').toLowerCase().includes(needle)
  );
}

function reviewQueueRank(item: ReviewAssignment): number {
  if (item.needsRereview) {
    return 0;
  }
  switch (item.status) {
    case 'OVERDUE':
      return 1;
    case 'INVITED':
      return 2;
    case 'ACCEPTED':
      return 3;
    case 'IN_PROGRESS':
      return 4;
    case 'COMPLETED':
      return 5;
    default:
      return 6;
  }
}

export function visibleReviews(
  items: ReviewAssignment[],
  board: ReviewBoard,
  query: string,
  conferenceId?: string,
): ReviewAssignment[] {
  const needle = query.trim().toLowerCase();
  return items
    .filter((item) =>
      conferenceId ? item.conferenceId === conferenceId : true,
    )
    .filter((item) => matchesReviewSearch(item, needle))
    .filter((item) => board === 'all' || reviewBoardOf(item) === board)
    .sort((a, b) => reviewQueueRank(a) - reviewQueueRank(b));
}

export function reviewQueueMeta(item: ReviewAssignment): {
  badge: string;
  bar: string;
  hint: string;
  nextKey: string;
  actionKey: string;
  actionClass: string;
} {
  if (item.needsRereview) {
    return {
      badge: 'bg-[#f0a04b]/16 text-[#9a6410]',
      bar: 'bg-[#f0a04b]',
      hint: 'text-[#9a6410]',
      nextKey: 'home.reviewNext.REREVIEW',
      actionKey: 'home.reviewAction.REREVIEW',
      actionClass: 'bg-[#f0a04b] text-white',
    };
  }
  if (item.awaitingAuthorRevision) {
    return {
      badge: 'bg-[#eef1f6] text-[#5c6578]',
      bar: 'bg-[#8b909a]',
      hint: 'text-[#5c6578]',
      nextKey: 'home.reviewNext.WAITING',
      actionKey: 'home.reviewAction.DONE',
      actionClass: 'bg-[#eef2ff] text-[#3d4fd4]',
    };
  }
  if (item.status === 'INVITED') {
    return {
      badge: 'bg-[#f0a04b]/16 text-[#9a6410]',
      bar: 'bg-[#f0a04b]',
      hint: 'text-[#9a6410]',
      nextKey: 'home.reviewNext.INVITED',
      actionKey: 'home.reviewAction.INVITED',
      actionClass: 'bg-[#f0a04b] text-white',
    };
  }
  if (item.status === 'OVERDUE') {
    return {
      badge: 'bg-[#e35d5d]/12 text-[#c54545]',
      bar: 'bg-[#e35d5d]',
      hint: 'text-[#c54545]',
      nextKey: 'home.reviewNext.OVERDUE',
      actionKey: 'home.reviewAction.ACTIVE',
      actionClass: 'bg-[#c54545] text-white',
    };
  }
  if (item.status === 'COMPLETED') {
    return {
      badge: 'bg-[#2fbf71]/14 text-[#1c9a57]',
      bar: 'bg-[#2fbf71]',
      hint: 'text-[#1c9a57]',
      nextKey: 'home.reviewNext.COMPLETED',
      actionKey: 'home.reviewAction.DONE',
      actionClass: 'bg-[#eef2ff] text-[#3d4fd4]',
    };
  }
  if (item.status === 'DECLINED' || item.status === 'CANCELLED') {
    return {
      badge: 'bg-[#eef1f6] text-[#5c6578]',
      bar: 'bg-[#c5cad6]',
      hint: 'text-[#5c6578]',
      nextKey: `home.reviewNext.${item.status}`,
      actionKey: 'home.reviewAction.DONE',
      actionClass: 'bg-[#f6f7fb] text-[#5c6578]',
    };
  }
  return {
    badge: 'bg-[#5d74ff]/12 text-[#3d4fd4]',
    bar: 'bg-[#3d4fd4]',
    hint: 'text-[#3d4fd4]',
    nextKey:
      item.status === 'ACCEPTED'
        ? 'home.reviewNext.ACCEPTED'
        : 'home.reviewNext.IN_PROGRESS',
    actionKey: 'home.reviewAction.ACTIVE',
    actionClass: 'bg-[#3d4fd4] text-white',
  };
}
