import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarRange,
  ChevronDown,
  DoorOpen,
  Download,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { AssignmentField } from '@/components/assignment-picker';
import {
  ConferenceProgramNav,
  ConferenceWorkNav,
} from '@/components/conference-work-nav';
import { CreateSessionChairDialog } from '@/components/create-session-chair-dialog';
import { IconAction } from '@/components/icon-action';
import { PrintPageButton } from '@/components/print-page-button';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCurrentUser } from '@/features/auth/use-account';
import { useFeedback } from '@/features/feedback/feedback';
import { useBoardShortcuts } from '@/hooks/use-board-shortcuts';
import { pickConference } from '@/features/navigation/pick-conference';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface Membership {
  id: string;
  name: string;
  shortName?: string;
  role: string;
  membershipStatus: string;
  status: string;
}

interface SchedulePaper {
  id: string;
  title: string;
  publicId: string | null;
  decision: { outcome: string; status: string } | null;
  sessionChairs?: { userId: string; name: string }[];
}

interface RoomRow {
  id: string;
  name: string;
  capacity?: number;
}

interface SessionRow {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  room: { id?: string; name: string; capacity?: number };
  presentations: {
    id: string;
    paper: {
      id: string;
      title: string;
      publicId: string | null;
      sessionChairs: { userId: string; name: string }[];
    };
  }[];
}

interface ProgramView {
  sessions: SessionRow[];
  rooms: RoomRow[];
}

interface ChairRow {
  userId: string;
  firstName: string;
  lastName: string;
  email?: string;
  academicTitle?: string;
}

type BoardStep = 'setup' | 'papers' | 'chairs';
type PaperFilter = 'unscheduled' | 'scheduled' | 'all';

function conferenceLabel(item: Membership) {
  return item.shortName ? `${item.name} · ${item.shortName}` : item.name;
}

function isAccepted(paper: SchedulePaper) {
  return (
    paper.decision?.status === 'PUBLISHED' && paper.decision.outcome === 'ACCEPTED'
  );
}

function formatSessionWhen(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return `${start.toLocaleString()} – ${end.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function toLocalInput(value?: string | Date) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function addMinutesLocal(localValue: string, minutes: number) {
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) {
    return localValue;
  }
  date.setMinutes(date.getMinutes() + minutes);
  return toLocalInput(date);
}

function roomCapacity(room: { capacity?: number } | undefined) {
  return room?.capacity && room.capacity > 0 ? room.capacity : 40;
}

export function SessionBoardPage() {
  const { t } = useTranslation();
  const account = useCurrentUser();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [step, setStep] = useState<BoardStep>('setup');
  const [paperFilter, setPaperFilter] = useState<PaperFilter>('unscheduled');
  const [paperQuery, setPaperQuery] = useState('');
  const [chairQuery, setChairQuery] = useState('');
  const [sessionQuery, setSessionQuery] = useState('');
  const [selectedPapers, setSelectedPapers] = useState<Set<string>>(new Set());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedChairId, setSelectedChairId] = useState<string | null>(null);
  const [placeChairId, setPlaceChairId] = useState('');
  const [modality, setModality] = useState<'IN_PERSON' | 'ONLINE'>('IN_PERSON');
  const [pending, setPending] = useState(false);
  const [conferenceOpen, setConferenceOpen] = useState(false);
  const [conferenceSearch, setConferenceSearch] = useState('');
  const [addSessionOpen, setAddSessionOpen] = useState(false);
  const [editSession, setEditSession] = useState<SessionRow | null>(null);
  const [editRoom, setEditRoom] = useState<RoomRow | null>(null);
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const [createChairOpen, setCreateChairOpen] = useState(false);
  const [roomMode, setRoomMode] = useState<'existing' | 'new'>('new');
  const [roomId, setRoomId] = useState('');
  const [startsLocal, setStartsLocal] = useState(() => toLocalInput());
  const [endsLocal, setEndsLocal] = useState(() => addMinutesLocal(toLocalInput(), 90));
  const conferenceMenuRef = useRef<HTMLDivElement>(null);
  const field =
    'mt-1 block w-full rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2 text-sm font-semibold text-[#1c2744]';

  const conferences = useQuery({
    queryKey: ['conferences'],
    queryFn: async () => {
      const response = await apiFetch('/api/v1/conferences');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<Membership[]>;
    },
  });
  const active =
    conferences.data?.filter((item) => item.membershipStatus === 'ACTIVE') ?? [];
  const conference = pickConference(active, params.get('conference'));
  const platformAdmin = account.data?.platformRole === 'SYSTEM_ADMIN';
  const canManage =
    platformAdmin ||
    conference?.role === 'CHAIR' ||
    conference?.role === 'ADMINISTRATOR' ||
    conference?.role === 'COMMITTEE';

  const program = useQuery({
    queryKey: ['program', conference?.id],
    enabled: Boolean(conference?.id && canManage),
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${conference!.id}/program`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<ProgramView>;
    },
  });

  const papers = useQuery({
    queryKey: ['conference-papers', conference?.id],
    enabled: Boolean(conference?.id && canManage),
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${conference!.id}/papers`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<SchedulePaper[]>;
    },
  });

  const chairs = useQuery({
    queryKey: ['session-chairs', conference?.id],
    enabled: Boolean(conference?.id && canManage),
    queryFn: async () => {
      const response = await apiFetch(
        `/api/v1/conferences/${conference!.id}/session-chairs`,
      );
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<ChairRow[]>;
    },
  });

  useEffect(() => {
    setSelectedPapers(new Set());
    setSelectedSessionId(null);
    setSelectedChairId(null);
    setPlaceChairId('');
    setPaperQuery('');
    setChairQuery('');
    setSessionQuery('');
    setPaperFilter('unscheduled');
    setStep('setup');
    setConferenceOpen(false);
    setConferenceSearch('');
    setRoomId('');
  }, [conference?.id]);

  useEffect(() => {
    if (!conferenceOpen) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (
        conferenceMenuRef.current &&
        !conferenceMenuRef.current.contains(event.target as Node)
      ) {
        setConferenceOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [conferenceOpen]);

  const paperSession = useMemo(() => {
    const map = new Map<string, { sessionId: string; sessionTitle: string }>();
    for (const session of program.data?.sessions ?? []) {
      for (const item of session.presentations) {
        map.set(item.paper.id, { sessionId: session.id, sessionTitle: session.title });
      }
    }
    return map;
  }, [program.data?.sessions]);

  const acceptedPapers = useMemo(
    () => (papers.data ?? []).filter(isAccepted),
    [papers.data],
  );

  const summary = useMemo(() => {
    const sessions = program.data?.sessions ?? [];
    let unscheduled = 0;
    let scheduled = 0;
    for (const paper of acceptedPapers) {
      if (paperSession.has(paper.id)) {
        scheduled += 1;
      } else {
        unscheduled += 1;
      }
    }
    const emptySessions = sessions.filter((item) => item.presentations.length === 0).length;
    const withoutChair = sessions.filter((session) =>
      session.presentations.some((item) => (item.paper.sessionChairs ?? []).length === 0),
    ).length;
    return {
      unscheduled,
      scheduled,
      sessions: sessions.length,
      rooms: program.data?.rooms.length ?? 0,
      emptySessions,
      withoutChair,
    };
  }, [acceptedPapers, paperSession, program.data]);

  const filterCounts = useMemo(
    () => ({
      all: acceptedPapers.length,
      unscheduled: summary.unscheduled,
      scheduled: summary.scheduled,
    }),
    [acceptedPapers.length, summary.scheduled, summary.unscheduled],
  );

  const visiblePapers = useMemo(() => {
    const needle = paperQuery.trim().toLowerCase();
    return acceptedPapers.filter((paper) => {
      const scheduled = paperSession.has(paper.id);
      if (paperFilter === 'unscheduled' && scheduled) {
        return false;
      }
      if (paperFilter === 'scheduled' && !scheduled) {
        return false;
      }
      if (!needle) {
        return true;
      }
      const placed = paperSession.get(paper.id)?.sessionTitle ?? '';
      const chairsLabel = (paper.sessionChairs ?? []).map((item) => item.name).join(' ');
      return `${paper.publicId ?? ''} ${paper.title} ${placed} ${chairsLabel}`
        .toLowerCase()
        .includes(needle);
    });
  }, [acceptedPapers, paperFilter, paperQuery, paperSession]);

  const dedicatedChairs = useMemo(
    () =>
      (chairs.data ?? []).filter((item) => item.academicTitle === 'Session chair'),
    [chairs.data],
  );

  const visibleChairs = useMemo(() => {
    const needle = chairQuery.trim().toLowerCase();
    if (!needle) {
      return dedicatedChairs;
    }
    return dedicatedChairs.filter((item) =>
      `${item.firstName} ${item.lastName} ${item.email ?? ''}`
        .toLowerCase()
        .includes(needle),
    );
  }, [chairQuery, dedicatedChairs]);

  const visibleSessions = useMemo(() => {
    const needle = sessionQuery.trim().toLowerCase();
    const list = [...(program.data?.sessions ?? [])].sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
    if (!needle) {
      return list;
    }
    return list.filter((session) =>
      `${session.title} ${session.room.name}`.toLowerCase().includes(needle),
    );
  }, [program.data?.sessions, sessionQuery]);

  const selectedSession =
    program.data?.sessions.find((item) => item.id === selectedSessionId) ?? null;

  const sessionFocusIndex = Math.max(
    0,
    visibleSessions.findIndex((item) => item.id === selectedSessionId),
  );

  function selectSessionByOffset(delta: number) {
    if (visibleSessions.length === 0) {
      return;
    }
    const current = Math.max(
      0,
      visibleSessions.findIndex((item) => item.id === selectedSessionId),
    );
    const next =
      visibleSessions[(current + delta + visibleSessions.length) % visibleSessions.length];
    if (next) {
      setSelectedSessionId(next.id);
    }
  }

  useBoardShortcuts({
    enabled: Boolean(canManage && conference && step !== 'setup'),
    count: visibleSessions.length,
    index: sessionFocusIndex >= 0 ? sessionFocusIndex : 0,
    onIndexChange: (next) => {
      const session = visibleSessions[next];
      if (session) {
        setSelectedSessionId(session.id);
      }
    },
    onPrevGroup: () => selectSessionByOffset(-1),
    onNextGroup: () => selectSessionByOffset(1),
  });

  const selectedCapacity = selectedSession
    ? roomCapacity(selectedSession.room)
    : null;
  const overCapacity =
    selectedCapacity != null &&
    selectedPapers.size > 0 &&
    selectedSession != null &&
    selectedSession.presentations.length + selectedPapers.size > selectedCapacity;

  const conferenceChoices = useMemo(() => {
    const needle = conferenceSearch.trim().toLowerCase();
    if (!needle) {
      return active;
    }
    return active.filter((item) =>
      `${item.name} ${item.shortName ?? ''}`.toLowerCase().includes(needle),
    );
  }, [active, conferenceSearch]);

  const setupReady = summary.rooms > 0 && summary.sessions > 0;

  function pickConferenceId(id: string) {
    setParams({ conference: id });
    setConferenceOpen(false);
    setConferenceSearch('');
  }

  function openCreateSession() {
    const now = toLocalInput();
    const hasRooms = (program.data?.rooms.length ?? 0) > 0;
    setEditSession(null);
    setRoomMode(hasRooms ? 'existing' : 'new');
    setRoomId(program.data?.rooms[0]?.id ?? '');
    setStartsLocal(now);
    setEndsLocal(addMinutesLocal(now, 90));
    setAddSessionOpen(true);
  }

  function openEditSession(session: SessionRow) {
    setEditSession(session);
    setRoomMode('existing');
    setRoomId(
      session.room.id ??
        program.data?.rooms.find((r) => r.name === session.room.name)?.id ??
        '',
    );
    setStartsLocal(toLocalInput(session.startsAt));
    setEndsLocal(toLocalInput(session.endsAt));
    setAddSessionOpen(true);
  }

  function openEditRoom(room: RoomRow) {
    setEditRoom(room);
    setAddRoomOpen(true);
  }

  function togglePaper(id: string) {
    setSelectedPapers((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectVisiblePapers() {
    setSelectedPapers(new Set(visiblePapers.map((paper) => paper.id)));
  }

  async function refreshSchedule() {
    await queryClient.invalidateQueries({ queryKey: ['program'] });
    await queryClient.invalidateQueries({ queryKey: ['conference-papers'] });
    await queryClient.invalidateQueries({ queryKey: ['presentations-mine'] });
    await queryClient.invalidateQueries({ queryKey: ['session-chairs'] });
  }

  async function placePapers() {
    if (!selectedSessionId || selectedPapers.size === 0) {
      feedback.error(t('sessionBoard.needPapersAndSession'));
      return;
    }
    if (overCapacity) {
      feedback.error(
        t('sessionBoard.capacityExceeded', {
          capacity: selectedCapacity,
          count: selectedSession!.presentations.length + selectedPapers.size,
        }),
      );
      return;
    }
    setPending(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const paperId of selectedPapers) {
        const response = await apiFetch(
          `/api/v1/sessions/${selectedSessionId}/presentations`,
          {
            method: 'POST',
            body: JSON.stringify({ paperId, modality }),
          },
        );
        if (!response.ok) {
          failed += 1;
          continue;
        }
        ok += 1;
        if (placeChairId) {
          const chairResponse = await apiFetch(`/api/v1/papers/${paperId}/session-chair`, {
            method: 'POST',
            body: JSON.stringify({ userId: placeChairId }),
          });
          if (!chairResponse.ok) {
            failed += 1;
          }
        }
      }
      if (ok > 0) {
        feedback.success(
          failed > 0
            ? t('sessionBoard.placedWithSkipped', { ok, failed })
            : t('sessionBoard.placed', { ok }),
        );
        setSelectedPapers(new Set());
        await refreshSchedule();
      } else {
        feedback.error(t('sessionBoard.allFailed'));
      }
    } finally {
      setPending(false);
    }
  }

  async function assignChairToSession() {
    if (!selectedSessionId || !selectedChairId) {
      feedback.error(t('sessionBoard.needChairAndSession'));
      return;
    }
    const paperIds =
      selectedSession?.presentations.map((item) => item.paper.id) ?? [];
    if (paperIds.length === 0) {
      feedback.error(t('sessionBoard.sessionEmptyForChair'));
      return;
    }
    setPending(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const paperId of paperIds) {
        const response = await apiFetch(`/api/v1/papers/${paperId}/session-chair`, {
          method: 'POST',
          body: JSON.stringify({ userId: selectedChairId }),
        });
        if (response.ok) {
          ok += 1;
        } else {
          failed += 1;
        }
      }
      if (ok > 0) {
        feedback.success(
          failed > 0
            ? t('sessionBoard.chairDoneWithSkipped', { ok, failed })
            : t('sessionBoard.chairDone', { ok }),
        );
        setSelectedChairId(null);
        await refreshSchedule();
      } else {
        feedback.error(t('sessionBoard.allFailed'));
      }
    } finally {
      setPending(false);
    }
  }

  async function saveRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conference) {
      return;
    }
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    const capacity = Number(data.get('capacity') || 40);
    const body = JSON.stringify({ name, capacity });
    const response = editRoom
      ? await apiFetch(`/api/v1/rooms/${editRoom.id}`, { method: 'PATCH', body })
      : await apiFetch(`/api/v1/conferences/${conference.id}/rooms`, {
          method: 'POST',
          body,
        });
    if (!response.ok) {
      feedback.error(await apiErrorMessage(response));
      return;
    }
    feedback.success(t('workflow.saved'));
    setAddRoomOpen(false);
    setEditRoom(null);
    await refreshSchedule();
  }

  async function saveSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!conference) {
      return;
    }
    const data = new FormData(event.currentTarget);
    let nextRoomId = roomId || String(data.get('roomId') ?? '');
    if (!editSession && roomMode === 'new') {
      const roomName = String(data.get('newRoomName') ?? '').trim();
      const capacity = Number(data.get('newRoomCapacity') || 40);
      if (!roomName) {
        feedback.error(t('sessionBoard.needRoomName'));
        return;
      }
      const roomResponse = await apiFetch(`/api/v1/conferences/${conference.id}/rooms`, {
        method: 'POST',
        body: JSON.stringify({ name: roomName, capacity }),
      });
      if (!roomResponse.ok) {
        feedback.error(await apiErrorMessage(roomResponse));
        return;
      }
      const room = (await roomResponse.json()) as { id: string };
      nextRoomId = room.id;
    }
    if (!nextRoomId) {
      feedback.error(t('sessionBoard.needRoomFirst'));
      return;
    }
    const payload = {
      roomId: nextRoomId,
      title: String(data.get('title')),
      startsAt: new Date(String(data.get('startsAt'))).toISOString(),
      endsAt: new Date(String(data.get('endsAt'))).toISOString(),
    };
    const response = editSession
      ? await apiFetch(`/api/v1/sessions/${editSession.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        })
      : await apiFetch(`/api/v1/conferences/${conference.id}/sessions`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
    if (!response.ok) {
      feedback.error(await apiErrorMessage(response));
      return;
    }
    const created = (await response.json()) as { id?: string };
    feedback.success(t('workflow.saved'));
    setAddSessionOpen(false);
    const newId = editSession?.id ?? created.id ?? null;
    setEditSession(null);
    setRoomId('');
    await refreshSchedule();
    if (newId) {
      setSelectedSessionId(newId);
      setStep('papers');
      setPaperFilter('unscheduled');
    }
  }

  async function deleteRoom(room: RoomRow) {
    if (!window.confirm(t('sessionBoard.confirmDeleteRoom', { name: room.name }))) {
      return;
    }
    const response = await apiFetch(`/api/v1/rooms/${room.id}`, { method: 'DELETE' });
    if (!response.ok) {
      feedback.error(await apiErrorMessage(response));
      return;
    }
    feedback.success(t('sessionBoard.deleted'));
    await refreshSchedule();
  }

  async function deleteSession(session: SessionRow) {
    if (
      !window.confirm(t('sessionBoard.confirmDeleteSession', { title: session.title }))
    ) {
      return;
    }
    const response = await apiFetch(`/api/v1/sessions/${session.id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      feedback.error(await apiErrorMessage(response));
      return;
    }
    if (selectedSessionId === session.id) {
      setSelectedSessionId(null);
    }
    feedback.success(t('sessionBoard.deleted'));
    await refreshSchedule();
  }

  const canPlace =
    canManage &&
    step === 'papers' &&
    selectedPapers.size > 0 &&
    Boolean(selectedSessionId) &&
    !pending;
  const canAssignChair =
    canManage &&
    step === 'chairs' &&
    Boolean(selectedChairId) &&
    Boolean(selectedSessionId) &&
    (selectedSession?.presentations.length ?? 0) > 0 &&
    !pending;

  const paperFilters: { id: PaperFilter; label: string; count: number }[] = [
    {
      id: 'unscheduled',
      label: t('sessionBoard.filterUnscheduled'),
      count: filterCounts.unscheduled,
    },
    {
      id: 'scheduled',
      label: t('sessionBoard.filterScheduled'),
      count: filterCounts.scheduled,
    },
    { id: 'all', label: t('sessionBoard.filterAll'), count: filterCounts.all },
  ];

  const steps: { id: BoardStep; label: string; hint: string; tone: string }[] = [
    {
      id: 'setup',
      label: t('sessionBoard.stepSetup'),
      hint: t('sessionBoard.stepSetupHint'),
      tone: 'bg-[#fff4e5] text-[#9a5b00] ring-[#f0c48a]',
    },
    {
      id: 'papers',
      label: t('sessionBoard.stepPapers'),
      hint: t('sessionBoard.stepPapersHint'),
      tone: 'bg-[#eef2ff] text-[#3d4fd4] ring-[#c5cad6]',
    },
    {
      id: 'chairs',
      label: t('sessionBoard.stepChairs'),
      hint: t('sessionBoard.stepChairsHint'),
      tone: 'bg-[#e8f8ef] text-[#1f7a4d] ring-[#9ad4b3]',
    },
  ];

  return (
    <div className="space-y-5 pb-4 sm:pb-0">
      {conference && canManage ? (
        <div className="space-y-3">
          <ConferenceWorkNav
            conferenceId={conference.id}
            conferenceName={conference.name}
            role={conference.role}
            current="program"
          />
          <ConferenceProgramNav conferenceId={conference.id} current="sessionBoard" />
        </div>
      ) : (
        <header className="border-b border-[#e6e8ec] pb-4">
          <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl">
            {t('sessionBoard.title')}
          </h1>
          <p className="mt-1 text-sm text-[#5c6578]">{t('sessionBoard.intro')}</p>
        </header>
      )}

      {!canManage ? (
        <p className="rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm text-[#5c6578]">
          {t('sessionBoard.manageOnly')}
        </p>
      ) : conferences.isPending ? (
        <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
      ) : active.length === 0 || !conference ? (
        <p className="text-sm text-[#8b909a]">{t('home.noConference')}</p>
      ) : (
        <>
          <CreateSessionChairDialog
            open={createChairOpen}
            onOpenChange={setCreateChairOpen}
            conferenceId={conference.id}
          />

          <section className="overflow-hidden rounded-[28px] border border-[#e4e7ee] bg-white">
            <div className="border-b border-[#eef1f8] bg-gradient-to-r from-[#eef2ff] via-white to-[#e8f8ef] px-4 py-4 sm:px-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:items-end">
                <div className="relative min-w-0" ref={conferenceMenuRef}>
                  <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#8b909a]">
                    {t('sessionBoard.conference')}
                  </p>
                  <button
                    type="button"
                    aria-expanded={conferenceOpen}
                    onClick={() => setConferenceOpen((open) => !open)}
                    className="mt-1.5 flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl border border-[#dfe5f5] bg-white px-3 py-2 text-left text-sm font-semibold text-[#1c2744]"
                  >
                    <span className="min-w-0 truncate">{conferenceLabel(conference)}</span>
                    <ChevronDown className="size-4 shrink-0 text-[#8b909a]" />
                  </button>
                  {conferenceOpen ? (
                    <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-2xl border border-[#e4e7ee] bg-white shadow-[0_12px_32px_rgba(28,39,68,0.12)]">
                      {active.length > 5 ? (
                        <label className="flex items-center gap-2 border-b border-[#e4e7ee] px-3 py-2">
                          <Search className="size-4 shrink-0 text-[#8b909a]" />
                          <input
                            autoFocus
                            value={conferenceSearch}
                            onChange={(event) => setConferenceSearch(event.target.value)}
                            placeholder={t('sessionBoard.searchConferences')}
                            className="w-full bg-transparent text-sm outline-none"
                          />
                        </label>
                      ) : null}
                      <ul className="max-h-64 overflow-y-auto py-1">
                        {conferenceChoices.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              onClick={() => pickConferenceId(item.id)}
                              className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left ${
                                item.id === conference.id
                                  ? 'bg-[#eef2ff]'
                                  : 'hover:bg-[#f6f7fb]'
                              }`}
                            >
                              <span className="text-sm font-extrabold text-[#1c2744]">
                                {item.name}
                              </span>
                              {item.shortName ? (
                                <span className="text-xs font-semibold text-[#8b909a]">
                                  {item.shortName}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
              <SummaryCard
                label={t('sessionBoard.statUnscheduled')}
                value={summary.unscheduled}
                tone="bg-[#fff4e5] text-[#9a5b00]"
                icon={<CalendarRange className="size-4" />}
              />
              <SummaryCard
                label={t('sessionBoard.statSessions')}
                value={summary.sessions}
                tone="bg-[#eef2ff] text-[#3d4fd4]"
                icon={<DoorOpen className="size-4" />}
              />
              <SummaryCard
                label={t('sessionBoard.statEmpty')}
                value={summary.emptySessions}
                tone="bg-[#f6f7fb] text-[#5c6578]"
                icon={<DoorOpen className="size-4" />}
              />
              <SummaryCard
                label={t('sessionBoard.statNoChair')}
                value={summary.withoutChair}
                tone="bg-[#e8f8ef] text-[#1f7a4d]"
                icon={<Users className="size-4" />}
              />
            </div>

            <div className="flex flex-wrap gap-2 border-t border-[#eef1f8] px-4 py-3 sm:px-5">
              {steps.map((item, index) => {
                const activeStep = step === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setStep(item.id)}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-2xl px-3.5 text-left text-sm font-extrabold ring-1 ${
                      activeStep
                        ? item.tone
                        : 'bg-white text-[#5c6578] ring-[#e4e7ee] hover:bg-[#f6f7fb]'
                    }`}
                  >
                    <span
                      className={`inline-flex size-6 items-center justify-center rounded-full text-xs ${
                        activeStep ? 'bg-white/70' : 'bg-[#f6f7fb]'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <span>
                      <span className="block">{item.label}</span>
                      <span className="block text-[11px] font-semibold opacity-80">
                        {item.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {step === 'setup' ? (
            <section className="rounded-[28px] border border-[#e4e7ee] bg-gradient-to-b from-white to-[#f7f9ff] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold text-[#1c2744]">
                    {t('sessionBoard.sessionsTitle')}
                  </h2>
                  <p className="mt-1 text-sm text-[#5c6578]">
                    {t('sessionBoard.sessionsInlineHint')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 print:hidden">
                  <PrintPageButton labelKey="print.program" variant="outline" />
                  {conference ? (
                    <IconAction
                      icon={Download}
                      label={`${t('workflow.export')} — ${t('workflow.exportHint')}`}
                      href={`/api/v1/conferences/${conference.id}/export`}
                      tone="accent"
                    />
                  ) : null}
                  <Button type="button" size="sm" onClick={openCreateSession}>
                    <Plus className="size-4" />
                    {t('workflow.addSession')}
                  </Button>
                </div>
              </div>
              {(program.data?.rooms.length ?? 0) > 0 ? (
                <ul className="mt-4 flex flex-wrap gap-2">
                  {program.data!.rooms.map((room) => (
                    <li
                      key={room.id}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#e4e7ee] bg-white px-2 py-1.5"
                    >
                      <DoorOpen className="size-3.5 text-[#3d4fd4]" />
                      <span className="text-xs font-extrabold text-[#1c2744]">
                        {room.name}
                      </span>
                      <span className="text-[11px] font-semibold text-[#8b909a]">
                        · {roomCapacity(room)}
                      </span>
                      <IconAction
                        icon={Pencil}
                        label={t('sessionBoard.editRoom')}
                        onClick={() => openEditRoom(room)}
                      />
                      <IconAction
                        icon={Trash2}
                        label={t('common.delete')}
                        tone="danger"
                        onClick={() => void deleteRoom(room)}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
              {program.isPending ? (
                <p className="mt-4 text-sm text-[#8b909a]">{t('common.loading')}</p>
              ) : (program.data?.sessions.length ?? 0) === 0 ? (
                <p className="mt-4 rounded-2xl bg-[#eef2ff] px-4 py-3 text-sm font-semibold text-[#3d4fd4]">
                  {t('sessionBoard.createSessionFirst')}
                </p>
              ) : (
                <ul className="mt-4 grid gap-2">
                  {[...(program.data?.sessions ?? [])]
                    .sort(
                      (a, b) =>
                        new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
                    )
                    .map((session) => {
                      const capacity = roomCapacity(session.room);
                      const count = session.presentations.length;
                      const full = count >= capacity;
                      const noChair = session.presentations.some(
                        (item) => (item.paper.sessionChairs ?? []).length === 0,
                      );
                      return (
                        <li
                          key={session.id}
                          className="rounded-2xl border border-[#eef1f8] bg-white px-4 py-3"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-extrabold text-[#1c2744]">
                                {session.title}
                              </p>
                              <p className="mt-1 text-xs font-semibold text-[#5c6578]">
                                {session.room.name} ·{' '}
                                {formatSessionWhen(session.startsAt, session.endsAt)}
                              </p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <span
                                  className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold ${
                                    full
                                      ? 'bg-[#fde8e8] text-[#b42318]'
                                      : count === 0
                                        ? 'bg-[#fff4e5] text-[#9a5b00]'
                                        : 'bg-[#eef2ff] text-[#3d4fd4]'
                                  }`}
                                >
                                  {t('sessionBoard.sessionFill', { count, capacity })}
                                </span>
                                {noChair ? (
                                  <span className="rounded-lg bg-[#e8f8ef] px-2.5 py-1 text-[11px] font-extrabold text-[#1f7a4d]">
                                    {t('sessionBoard.needsChair')}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setSelectedSessionId(session.id);
                                  setStep('papers');
                                }}
                              >
                                {t('sessionBoard.placeHere')}
                              </Button>
                              <IconAction
                                icon={Pencil}
                                label={t('sessionBoard.editSession')}
                                onClick={() => openEditSession(session)}
                              />
                              <IconAction
                                icon={Trash2}
                                label={t('common.delete')}
                                tone="danger"
                                onClick={() => void deleteSession(session)}
                              />
                            </div>
                          </div>
                        </li>
                      );
                    })}
                </ul>
              )}
              {setupReady ? (
                <div className="mt-4">
                  <Button type="button" onClick={() => setStep('papers')}>
                    {t('sessionBoard.continuePlace')}
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          {step === 'papers' || step === 'chairs' ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-stretch">
              {step === 'papers' ? (
                <section className="flex min-h-[28rem] flex-col rounded-[28px] border border-[#e4e7ee] bg-white">
                  <div className="border-b border-[#e4e7ee] bg-[#fbfcff] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-base font-extrabold text-[#1c2744]">
                        {t('sessionBoard.papers')}
                      </h2>
                      <div className="flex flex-wrap items-center gap-3">
                        {selectedPapers.size > 0 ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-extrabold text-[#8b909a]"
                            onClick={() => setSelectedPapers(new Set())}
                          >
                            <X className="size-3.5" />
                            {t('sessionBoard.clearSelection')}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="text-xs font-extrabold text-[#3d4fd4]"
                          onClick={selectVisiblePapers}
                        >
                          {t('sessionBoard.selectVisible')}
                        </button>
                      </div>
                    </div>
                    <label className="mt-3 block text-xs font-extrabold uppercase tracking-[0.08em] text-[#8b909a]">
                      {t('sessionBoard.paperFilters')}
                      <select
                        value={paperFilter}
                        onChange={(event) =>
                          setPaperFilter(event.target.value as PaperFilter)
                        }
                        className="mt-1.5 block min-h-10 w-full rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-[#1c2744]"
                      >
                        {paperFilters.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label} · {item.count}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="mt-2 text-xs text-[#8b909a]">
                      {t('sessionBoard.papersHint', { count: selectedPapers.size })}
                      {' · '}
                      {t('sessionBoard.showingCount', { count: visiblePapers.length })}
                    </p>
                    <label className="mt-3 flex items-center gap-2 rounded-full border border-[#e4e7ee] bg-white px-3 py-2">
                      <Search className="size-4 shrink-0 text-[#8b909a]" />
                      <input
                        value={paperQuery}
                        onChange={(event) => setPaperQuery(event.target.value)}
                        placeholder={t('sessionBoard.searchPapers')}
                        className="w-full bg-transparent text-sm outline-none"
                      />
                    </label>
                  </div>
                  <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
                    {papers.isPending || program.isPending ? (
                      <li className="px-2 py-3 text-sm text-[#8b909a]">
                        {t('common.loading')}
                      </li>
                    ) : visiblePapers.length === 0 ? (
                      <li className="px-2 py-3 text-sm text-[#8b909a]">
                        {t('sessionBoard.noPapers')}
                      </li>
                    ) : (
                      visiblePapers.map((paper) => {
                        const checked = selectedPapers.has(paper.id);
                        const placed = paperSession.get(paper.id);
                        return (
                          <li key={paper.id}>
                            <label
                              className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ${
                                checked ? 'bg-[#eef2ff]' : 'hover:bg-[#f6f7fb]'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-1"
                                checked={checked}
                                onChange={() => togglePaper(paper.id)}
                              />
                              <span className="min-w-0">
                                <span className="block text-xs font-bold text-[#8b909a]">
                                  {paper.publicId ?? '—'}
                                  {' · '}
                                  {placed
                                    ? t('sessionBoard.alreadyScheduled')
                                    : t('sessionBoard.ready')}
                                </span>
                                <span className="mt-0.5 block text-sm font-extrabold text-[#1c2744]">
                                  {paper.title}
                                </span>
                                {placed ? (
                                  <span className="mt-0.5 block text-xs font-semibold text-[#5c6578]">
                                    {placed.sessionTitle}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </section>
              ) : (
                <section className="flex min-h-[28rem] flex-col rounded-[28px] border border-[#e4e7ee] bg-white">
                  <div className="border-b border-[#e4e7ee] bg-[#f3fbf6] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-base font-extrabold text-[#1c2744]">
                        {t('sessionBoard.chairs')}
                      </h2>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => setCreateChairOpen(true)}
                      >
                        <Plus className="size-4" />
                        {t('sessionChair.createTitle')}
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-[#8b909a]">
                      {t('sessionBoard.chairsHint')}
                    </p>
                    <label className="mt-3 flex items-center gap-2 rounded-full border border-[#e4e7ee] bg-white px-3 py-2">
                      <Search className="size-4 shrink-0 text-[#8b909a]" />
                      <input
                        value={chairQuery}
                        onChange={(event) => setChairQuery(event.target.value)}
                        placeholder={t('sessionBoard.searchChairs')}
                        className="w-full bg-transparent text-sm outline-none"
                      />
                    </label>
                  </div>
                  <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
                    {chairs.isPending ? (
                      <li className="px-2 py-3 text-sm text-[#8b909a]">
                        {t('common.loading')}
                      </li>
                    ) : visibleChairs.length === 0 ? (
                      <li className="px-2 py-3 text-sm text-[#8b909a]">
                        {t('sessionBoard.noChairs')}
                      </li>
                    ) : (
                      visibleChairs.map((item) => {
                        const checked = selectedChairId === item.userId;
                        const name =
                          `${item.firstName} ${item.lastName}`.trim() ||
                          item.email ||
                          item.userId;
                        return (
                          <li key={item.userId}>
                            <label
                              className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ${
                                checked ? 'bg-[#e8f8ef]' : 'hover:bg-[#f6f7fb]'
                              }`}
                            >
                              <input
                                type="radio"
                                name="session-board-chair"
                                className="mt-1"
                                checked={checked}
                                onChange={() => setSelectedChairId(item.userId)}
                              />
                              <span className="min-w-0">
                                <span className="block text-sm font-extrabold text-[#1c2744]">
                                  {name}
                                </span>
                                {item.email ? (
                                  <span className="mt-0.5 block text-xs font-semibold text-[#5c6578]">
                                    {item.email}
                                  </span>
                                ) : null}
                              </span>
                            </label>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </section>
              )}

              <div className="flex flex-col items-center justify-center gap-3 lg:px-1">
                {step === 'papers' ? (
                  <>
                    <label className="w-full max-w-[11rem] text-xs font-extrabold uppercase tracking-[0.08em] text-[#8b909a]">
                      {t('dossier.scheduleModality')}
                      <select
                        value={modality}
                        onChange={(event) =>
                          setModality(event.target.value as 'IN_PERSON' | 'ONLINE')
                        }
                        className="mt-1.5 block min-h-10 w-full rounded-2xl border border-[#e4e7ee] bg-white px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-[#1c2744]"
                      >
                        <option value="IN_PERSON">{t('dossier.modalityInPerson')}</option>
                        <option value="ONLINE">{t('dossier.modalityOnline')}</option>
                      </select>
                    </label>
                    <label className="w-full max-w-[11rem] text-xs font-extrabold uppercase tracking-[0.08em] text-[#8b909a]">
                      {t('sessionBoard.optionalChair')}
                      <select
                        value={placeChairId}
                        onChange={(event) => setPlaceChairId(event.target.value)}
                        className="mt-1.5 block min-h-10 w-full rounded-2xl border border-[#e4e7ee] bg-white px-2 py-1.5 text-xs font-semibold normal-case tracking-normal text-[#1c2744]"
                      >
                        <option value="">{t('sessionBoard.noChairNow')}</option>
                        {dedicatedChairs.map((item) => (
                          <option key={item.userId} value={item.userId}>
                            {`${item.firstName} ${item.lastName}`.trim() || item.email}
                          </option>
                        ))}
                      </select>
                    </label>
                    {overCapacity ? (
                      <p className="max-w-[11rem] text-center text-[11px] font-bold text-[#b42318]">
                        {t('sessionBoard.capacityWarning', {
                          capacity: selectedCapacity,
                        })}
                      </p>
                    ) : null}
                    <Button
                      type="button"
                      size="lg"
                      disabled={!canPlace || overCapacity}
                      onClick={() => void placePapers()}
                      className="min-h-12 gap-2 px-5"
                    >
                      <ArrowRight className="size-5" />
                      <span className="hidden sm:inline">{t('sessionBoard.placeAction')}</span>
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    size="lg"
                    disabled={!canAssignChair}
                    onClick={() => void assignChairToSession()}
                    className="min-h-12 gap-2 bg-[#1f7a4d] px-5 hover:bg-[#196640]"
                  >
                    <ArrowRight className="size-5" />
                    <span className="hidden sm:inline">{t('sessionBoard.chairAction')}</span>
                  </Button>
                )}
              </div>

              <section className="flex min-h-[28rem] flex-col rounded-[28px] border border-[#e4e7ee] bg-white">
                <div className="border-b border-[#e4e7ee] bg-[#fbfcff] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-base font-extrabold text-[#1c2744]">
                        {t('sessionBoard.sessions')}
                      </h2>
                      <p className="mt-1 text-xs text-[#8b909a]">
                        {selectedSession
                          ? t('sessionBoard.sessionSelected', {
                              title: selectedSession.title,
                              count: selectedSession.presentations.length,
                            })
                          : t('sessionBoard.pickSession')}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={visibleSessions.length < 2}
                        onClick={() => selectSessionByOffset(-1)}
                        aria-label={t('sessionBoard.prevSession')}
                      >
                        ←
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={visibleSessions.length < 2}
                        onClick={() => selectSessionByOffset(1)}
                        aria-label={t('sessionBoard.nextSession')}
                      >
                        →
                      </Button>
                    </div>
                  </div>
                  <p className="mt-2 hidden text-[11px] font-semibold text-[#8b909a] sm:block">
                    {t('sessionBoard.shortcuts')}
                  </p>
                  <label className="mt-3 flex items-center gap-2 rounded-full border border-[#e4e7ee] bg-white px-3 py-2">
                    <Search className="size-4 shrink-0 text-[#8b909a]" />
                    <input
                      value={sessionQuery}
                      onChange={(event) => setSessionQuery(event.target.value)}
                      placeholder={t('sessionBoard.searchSessions')}
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  </label>
                </div>
                <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
                  {program.isPending ? (
                    <li className="px-2 py-3 text-sm text-[#8b909a]">{t('common.loading')}</li>
                  ) : visibleSessions.length === 0 ? (
                    <li className="px-2 py-3 text-sm text-[#8b909a]">
                      {t('sessionBoard.noSessions')}
                    </li>
                  ) : (
                    visibleSessions.map((session) => {
                      const checked = selectedSessionId === session.id;
                      const capacity = roomCapacity(session.room);
                      const count = session.presentations.length;
                      return (
                        <li key={session.id}>
                          <label
                            className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ${
                              checked ? 'bg-[#eef2ff]' : 'hover:bg-[#f6f7fb]'
                            }`}
                          >
                            <input
                              type="radio"
                              name="session-board-session"
                              className="mt-1"
                              checked={checked}
                              onChange={() => setSelectedSessionId(session.id)}
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-extrabold text-[#1c2744]">
                                {session.title}
                              </span>
                              <span className="mt-0.5 block text-xs font-semibold text-[#5c6578]">
                                {session.room.name} ·{' '}
                                {formatSessionWhen(session.startsAt, session.endsAt)}
                              </span>
                              <span className="mt-0.5 block text-xs font-bold text-[#8b909a]">
                                {t('sessionBoard.sessionFill', { count, capacity })}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })
                  )}
                </ul>
              </section>
            </div>
          ) : null}

          <Dialog
            open={addRoomOpen}
            onOpenChange={(open) => {
              setAddRoomOpen(open);
              if (!open) {
                setEditRoom(null);
              }
            }}
          >
            <DialogContent>
              <DialogTitle>
                {editRoom ? t('sessionBoard.editRoom') : t('workflow.addRoom')}
              </DialogTitle>
              <DialogDescription>{t('sessionBoard.roomDialogHint')}</DialogDescription>
              <form className="grid gap-3" onSubmit={(event) => void saveRoom(event)}>
                <label className="text-sm font-bold text-[#1c2744]">
                  {t('workflow.room')}
                  <input
                    name="name"
                    required
                    defaultValue={editRoom?.name ?? ''}
                    className={field}
                  />
                </label>
                <label className="text-sm font-bold text-[#1c2744]">
                  {t('sessionBoard.capacity')}
                  <input
                    name="capacity"
                    type="number"
                    min={1}
                    max={2000}
                    required
                    defaultValue={editRoom?.capacity ?? 40}
                    className={field}
                  />
                </label>
                <Button type="submit">{t('workflow.save')}</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog
            open={addSessionOpen}
            onOpenChange={(open) => {
              setAddSessionOpen(open);
              if (!open) {
                setEditSession(null);
              }
            }}
          >
            <DialogContent>
              <DialogTitle>
                {editSession ? t('sessionBoard.editSession') : t('workflow.addSession')}
              </DialogTitle>
              <DialogDescription>{t('sessionBoard.sessionDialogHint')}</DialogDescription>
              {program.data ? (
                <form className="grid gap-3" onSubmit={(event) => void saveSession(event)}>
                  {!editSession ? (
                    <div className="grid gap-2">
                      <p className="text-sm font-bold text-[#1c2744]">
                        {t('workflow.room')}
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          className={`rounded-xl border px-3 py-2 text-left text-sm font-extrabold ${
                            roomMode === 'new'
                              ? 'border-[#3d4fd4] bg-[#eef2ff] text-[#3d4fd4]'
                              : 'border-[#e4e7ee] bg-white text-[#5c6578]'
                          }`}
                          onClick={() => setRoomMode('new')}
                        >
                          {t('sessionBoard.newRoomOption')}
                        </button>
                        <button
                          type="button"
                          disabled={program.data.rooms.length === 0}
                          className={`rounded-xl border px-3 py-2 text-left text-sm font-extrabold disabled:opacity-40 ${
                            roomMode === 'existing'
                              ? 'border-[#3d4fd4] bg-[#eef2ff] text-[#3d4fd4]'
                              : 'border-[#e4e7ee] bg-white text-[#5c6578]'
                          }`}
                          onClick={() => setRoomMode('existing')}
                        >
                          {t('sessionBoard.existingRoomOption')}
                        </button>
                      </div>
                      {roomMode === 'new' ? (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="text-sm font-bold text-[#1c2744]">
                            {t('workflow.room')}
                            <input name="newRoomName" required className={field} />
                          </label>
                          <label className="text-sm font-bold text-[#1c2744]">
                            {t('sessionBoard.capacity')}
                            <input
                              name="newRoomCapacity"
                              type="number"
                              min={1}
                              max={2000}
                              defaultValue={40}
                              required
                              className={field}
                            />
                          </label>
                        </div>
                      ) : (
                        <AssignmentField
                          label={t('workflow.room')}
                          title={t('workflow.room')}
                          placeholder={t('workflow.room')}
                          value={roomId}
                          onChange={setRoomId}
                          options={program.data.rooms.map((room) => ({
                            id: room.id,
                            title: room.name,
                            subtitle: t('sessionBoard.capacityValue', {
                              capacity: roomCapacity(room),
                            }),
                          }))}
                        />
                      )}
                    </div>
                  ) : (
                    <AssignmentField
                      label={t('workflow.room')}
                      title={t('workflow.room')}
                      placeholder={t('workflow.room')}
                      value={roomId}
                      onChange={setRoomId}
                      options={program.data.rooms.map((room) => ({
                        id: room.id,
                        title: room.name,
                        subtitle: t('sessionBoard.capacityValue', {
                          capacity: roomCapacity(room),
                        }),
                      }))}
                    />
                  )}
                  <label className="text-sm font-bold text-[#1c2744]">
                    {t('workflow.sessionTitle')}
                    <input
                      name="title"
                      required
                      defaultValue={editSession?.title ?? ''}
                      className={field}
                    />
                  </label>
                  <label className="text-sm font-bold text-[#1c2744]">
                    {t('workflow.starts')}
                    <input
                      name="startsAt"
                      type="datetime-local"
                      required
                      value={startsLocal}
                      onChange={(event) => {
                        const next = event.target.value;
                        setStartsLocal(next);
                        setEndsLocal(addMinutesLocal(next, 90));
                      }}
                      className={field}
                    />
                  </label>
                  <label className="text-sm font-bold text-[#1c2744]">
                    {t('workflow.ends')}
                    <input
                      name="endsAt"
                      type="datetime-local"
                      required
                      value={endsLocal}
                      onChange={(event) => setEndsLocal(event.target.value)}
                      className={field}
                    />
                  </label>
                  <p className="text-xs font-semibold text-[#8b909a]">
                    {t('sessionBoard.durationHint')}
                  </p>
                  <Button
                    type="submit"
                    disabled={
                      editSession
                        ? !roomId
                        : roomMode === 'existing'
                          ? !roomId
                          : false
                    }
                  >
                    {t('workflow.save')}
                  </Button>
                </form>
              ) : null}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: string;
  icon: ReactNode;
}) {
  return (
    <div className={`rounded-2xl px-4 py-3 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-extrabold uppercase tracking-[0.06em] opacity-80">
          {label}
        </p>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-extrabold">{value}</p>
    </div>
  );
}
