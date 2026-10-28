export type SessionChairBoard =
  | 'all'
  | 'pending'
  | 'scheduled'
  | 'waiting'
  | 'presented'
  | 'absent';

export interface AssignedPresentation {
  paperId: string;
  title: string;
  publicId: string | null;
  conferenceId: string;
  conferenceName: string;
  role: 'CHAIR' | 'REVIEWER';
  slidesStatus: string;
  presented: boolean;
  absent?: boolean;
  presentationLanguage?: 'FR' | 'AR' | 'EN' | null;
  score: number | null;
  comment: string | null;
  slides?: {
    kind: 'SLIDES';
    originalName: string;
    contentType: string;
    sizeBytes: number;
  } | null;
  schedule: {
    presentationId: string;
    sessionTitle: string;
    roomName: string;
    startsAt: string;
    endsAt: string;
    modality: 'IN_PERSON' | 'ONLINE';
  } | null;
}

const BOARDS: SessionChairBoard[] = [
  'all',
  'pending',
  'scheduled',
  'waiting',
  'presented',
  'absent',
];

export function parseSessionChairBoard(value: string | null): SessionChairBoard {
  return BOARDS.includes(value as SessionChairBoard)
    ? (value as SessionChairBoard)
    : 'all';
}

export function sessionChairLane(
  item: AssignedPresentation,
): Exclude<SessionChairBoard, 'all' | 'pending'> {
  if (item.presented) {
    return 'presented';
  }
  if (item.absent) {
    return 'absent';
  }
  if (item.schedule) {
    return 'scheduled';
  }
  return 'waiting';
}

export function sessionChairCounts(
  items: AssignedPresentation[],
): Record<SessionChairBoard, number> {
  const counts: Record<SessionChairBoard, number> = {
    all: items.length,
    pending: 0,
    scheduled: 0,
    waiting: 0,
    presented: 0,
    absent: 0,
  };
  for (const item of items) {
    if (!item.presented && !item.absent) {
      counts.pending += 1;
    }
    counts[sessionChairLane(item)] += 1;
  }
  return counts;
}

export function visiblePresentations(
  items: AssignedPresentation[],
  board: SessionChairBoard,
  query: string,
): AssignedPresentation[] {
  const needle = query.trim().toLowerCase();
  return items.filter((item) => {
    if (board === 'pending' && (item.presented || item.absent)) {
      return false;
    }
    if (board !== 'all' && board !== 'pending' && sessionChairLane(item) !== board) {
      return false;
    }
    if (!needle) {
      return true;
    }
    const haystack = [
      item.title,
      item.publicId ?? '',
      item.conferenceName,
      item.schedule?.sessionTitle ?? '',
      item.schedule?.roomName ?? '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(needle);
  });
}
