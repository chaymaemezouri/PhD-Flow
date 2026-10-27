import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { AssignmentField } from '@/components/assignment-picker';
import {
  ConferenceTeamNav,
  ConferenceWorkNav,
} from '@/components/conference-work-nav';
import { CreateSessionChairDialog } from '@/components/create-session-chair-dialog';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/use-account';
import { useFeedback } from '@/features/feedback/feedback';
import { isSessionChair } from '@/features/navigation/home-path';
import { pickConference } from '@/features/navigation/pick-conference';
import {
  parseSessionChairBoard,
  sessionChairCounts,
  visiblePresentations,
  type AssignedPresentation,
  type SessionChairBoard,
} from '@/features/presentations/session-chair-queue';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface Membership {
  id: string;
  name: string;
  shortName?: string;
  role: string;
  membershipStatus: string;
  status: string;
  city?: string | null;
  country?: string | null;
  startsOn: string | null;
  endsOn?: string | null;
}

interface SessionChairCandidate {
  userId: string;
  firstName: string;
  lastName: string;
  email?: string;
  academicTitle?: string;
  loginPassword?: string | null;
}

interface AssignPaper {
  id: string;
  title: string;
  publicId: string | null;
  sessionChairs: { userId: string; name: string }[];
}

export function SessionChairPage() {
  const { t } = useTranslation();
  const account = useCurrentUser();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const feedback = useFeedback();
  const board = parseSessionChairBoard(params.get('board'));
  const [query, setQuery] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [conferenceOpen, setConferenceOpen] = useState(false);
  const [search, setSearch] = useState('');
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
  const sessionChairSelf = isSessionChair(account.data?.profile?.academicTitle);
  const canManage =
    !sessionChairSelf &&
    (platformAdmin ||
      conference?.role === 'CHAIR' ||
      conference?.role === 'ADMINISTRATOR');
  const waitingRole =
    account.isPending ||
    (!sessionChairSelf && !platformAdmin && conferences.isPending);
  const [chairPick, setChairPick] = useState<Record<string, string>>({});
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
      return response.json() as Promise<SessionChairCandidate[]>;
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
      return response.json() as Promise<AssignPaper[]>;
    },
  });
  const dedicated =
    chairs.data?.filter((item) => item.academicTitle === 'Session chair') ?? [];
  const needle = search.trim().toLowerCase();
  const conferenceChoices = needle
    ? active.filter((item) =>
        `${item.name} ${item.shortName ?? ''}`.toLowerCase().includes(needle),
      )
    : active;
  const visiblePapers = needle
    ? (papers.data ?? []).filter((paper) =>
        `${paper.title} ${paper.publicId ?? ''} ${paper.sessionChairs.map((item) => item.name).join(' ')}`
          .toLowerCase()
          .includes(needle),
      )
    : (papers.data ?? []);
  const assigned = useQuery({
    queryKey: ['presentations-mine'],
    enabled: Boolean(account.data) && !canManage && !waitingRole,
    queryFn: async () => {
      const response = await apiFetch('/api/v1/presentations/mine');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<AssignedPresentation[]>;
    },
  });

  const mine = useMemo(() => {
    return (assigned.data ?? [])
      .filter((item) => item.role === 'CHAIR')
      .filter((item) => (conference ? item.conferenceId === conference.id : true))
      .sort((left, right) => {
        const a = left.schedule ? new Date(left.schedule.startsAt).getTime() : 0;
        const b = right.schedule ? new Date(right.schedule.startsAt).getTime() : 0;
        return a - b;
      });
  }, [assigned.data, conference]);

  const counts = useMemo(() => sessionChairCounts(mine), [mine]);
  const visible = useMemo(
    () => visiblePresentations(mine, board, query),
    [board, mine, query],
  );

  function setBoard(next: SessionChairBoard) {
    const nextParams = new URLSearchParams(params);
    if (next === 'all') {
      nextParams.delete('board');
    } else {
      nextParams.set('board', next);
    }
    if (conference?.id) {
      nextParams.set('conference', conference.id);
    }
    setParams(nextParams);
  }

  const field =
    'mt-1 block w-full rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-sm';

  async function assess(presentationId: string, form: FormData) {
    const scoreRaw = String(form.get('score') ?? '');
    const score = scoreRaw ? Number(scoreRaw) : undefined;
    const comment = String(form.get('comment') ?? '');
    const response = await apiFetch(`/api/v1/presentations/${presentationId}/assessment`, {
      method: 'POST',
      body: JSON.stringify({ score, comment, presented: true }),
    });
    if (response.ok) {
      feedback.success(t('workflow.saved'));
    } else {
      feedback.error(await apiErrorMessage(response));
    }
    if (response.ok) {
      await queryClient.invalidateQueries({ queryKey: ['program'] });
      await queryClient.invalidateQueries({ queryKey: ['paper'] });
      await queryClient.invalidateQueries({ queryKey: ['presentations-mine'] });
    }
  }

  async function assignChair(paperId: string, userId: string) {
    if (!userId) {
      return;
    }
    const response = await apiFetch(`/api/v1/papers/${paperId}/session-chair`, {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    if (!response.ok) {
      feedback.error(await apiErrorMessage(response));
      return;
    }
    setChairPick((current) => ({ ...current, [paperId]: '' }));
    feedback.success(t('workflow.saved'));
    await queryClient.invalidateQueries({ queryKey: ['conference-papers'] });
    await queryClient.invalidateQueries({ queryKey: ['program'] });
    await queryClient.invalidateQueries({ queryKey: ['paper'] });
    await queryClient.invalidateQueries({ queryKey: ['presentations-mine'] });
  }

  return (
    <div className={canManage ? 'space-y-6' : 'space-y-5 lg:space-y-4'}>
      {canManage ? (
        <div className="space-y-3">
          {conference ? (
            <ConferenceWorkNav
              conferenceId={conference.id}
              conferenceName={conference.name}
              role={conference.role}
              current="team"
            />
          ) : (
            <header className="border-b border-[#e6e8ec] pb-4 sm:pb-5">
              <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl lg:text-3xl">
                {t('nav.sessionChair')}
              </h1>
            </header>
          )}
          {conference ? (
            <ConferenceTeamNav conferenceId={conference.id} current="sessionChairs" />
          ) : null}
        </div>
      ) : waitingRole ? null : (
        <div>
          <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl">
            {conference?.name ?? t('sessionChair.queue')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[#5c6578]">{t('sessionChair.intro')}</p>
        </div>
      )}

      {canManage ? (
        <>
          {conferences.isPending ? (
            <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
          ) : null}

          {active.length === 0 && !conferences.isPending ? (
            <p className="rounded-xl border border-dashed border-[#d8dce6] bg-white px-4 py-8 text-center text-sm text-[#5c6578]">
              {t('home.noConference')}
            </p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="relative min-w-0 flex-1">
                <p className="text-sm font-bold text-[#1c2744]">{t('nav.conferences')}</p>
                <button
                  type="button"
                  aria-expanded={conferenceOpen}
                  onClick={() => setConferenceOpen((open) => !open)}
                  className="mt-1.5 flex min-h-10 w-full items-center justify-between gap-2 rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-left text-sm font-semibold text-[#1c2744]"
                >
                  <span className={conference ? 'truncate' : 'truncate text-[#8b909a]'}>
                    {conference
                      ? conference.shortName
                        ? `${conference.name} · ${conference.shortName}`
                        : conference.name
                      : t('sessionChair.filterPlaceholder')}
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-[#8b909a]" />
                </button>
                {conferenceOpen ? (
                  <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-[#e4e7ee] bg-white py-1 shadow-[0_12px_32px_rgba(28,39,68,0.12)]">
                    {conferenceChoices.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setParams({ conference: item.id });
                            setConferenceOpen(false);
                          }}
                          className={`flex w-full px-3 py-2 text-left text-sm ${
                            item.id === conference?.id
                              ? 'bg-[#f6f7fb] font-extrabold text-[#1c2744]'
                              : 'font-semibold text-[#1c2744] hover:bg-[#f6f7fb]'
                          }`}
                        >
                          {item.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <label className="min-w-0 flex-1 text-sm font-bold text-[#1c2744]">
                {t('top.search')}
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('superadmin.searchHint')}
                  className="mt-1.5 block min-h-10 w-full rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-sm font-semibold text-[#1c2744] outline-none placeholder:font-medium placeholder:text-[#8b909a]"
                />
              </label>
            </div>
          )}

          {conference ? (
            <>
              <CreateSessionChairDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                conferenceId={conference.id}
              />

              <section className="rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-extrabold text-[#1c2744]">
                    {t('sessionChair.accounts')}
                  </h2>
                  <Button type="button" onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4" />
                    {t('sessionChair.createTitle')}
                  </Button>
                </div>
                {dedicated.length === 0 ? (
                  <p className="mt-4 text-sm text-[#5c6578]">{t('sessionChair.accountsEmpty')}</p>
                ) : (
                  <ul className="mt-4 grid gap-3">
                    {dedicated.map((item) => (
                      <li
                        key={item.userId}
                        className="rounded-2xl bg-[#f6f7fb] px-4 py-3"
                      >
                        <p className="text-sm font-extrabold text-[#1c2744]">
                          {`${item.firstName} ${item.lastName}`.trim()}
                        </p>
                        <p className="mt-0.5 text-xs text-[#8b909a]">{item.email}</p>
                        {item.loginPassword ? (
                          <p className="mt-2 text-xs font-extrabold text-[#1c2744]">
                            {t('superadmin.loginPassword')}: {item.loginPassword}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5">
                <div>
                  <h2 className="text-lg font-extrabold text-[#1c2744]">
                    {t('sessionChair.assignTitle')}
                  </h2>
                  <p className="mt-1 text-xs font-bold text-[#8b909a]">
                    {visiblePapers.length} / {papers.data?.length ?? 0}
                  </p>
                </div>
                {papers.isPending ? (
                  <p className="mt-4 text-sm text-[#8b909a]">{t('common.loading')}</p>
                ) : visiblePapers.length === 0 ? (
                  <p className="mt-4 text-sm text-[#5c6578]">{t('sessionChair.noPapers')}</p>
                ) : (
                  <ul className="mt-4 grid gap-3">
                    {visiblePapers.map((paper) => {
                      const assigned = (paper.sessionChairs ?? []).length > 0;
                      return (
                        <li
                          key={paper.id}
                          className={`grid gap-3 rounded-2xl px-4 py-4 sm:grid-cols-[minmax(0,1fr)_16rem] sm:items-center ${
                            assigned ? 'bg-[#2fbf71]/14' : 'bg-[#f0a04b]/16'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#8b909a]">
                              {paper.publicId ?? '—'}
                            </p>
                            <p className="mt-1 text-sm font-extrabold text-[#1c2744]">
                              {paper.title}
                            </p>
                            <p className="mt-2 text-xs font-bold text-[#5c6578]">
                              {assigned
                                ? paper.sessionChairs.map((item) => item.name).join(', ')
                                : t('dossier.noChair')}
                            </p>
                          </div>
                          <AssignmentField
                            className="min-w-0 text-xs font-extrabold text-[#1c2744]"
                            label={t('dossier.sessionChair')}
                            title={t('dossier.assignChair')}
                            hint={t('dossier.chooseChair')}
                            placeholder={t('dossier.chooseChair')}
                            value={chairPick[paper.id] ?? ''}
                            onChange={(id) => {
                              setChairPick((current) => ({ ...current, [paper.id]: id }));
                              void assignChair(paper.id, id);
                            }}
                            options={dedicated.map((item) => ({
                              id: item.userId,
                              title: `${item.firstName} ${item.lastName}`.trim(),
                              subtitle: item.email,
                            }))}
                          />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </>
      ) : waitingRole ? (
        <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
      ) : active.length === 0 && !conferences.isPending ? (
        <p className="rounded-xl border border-dashed border-[#d8dce6] bg-white px-4 py-8 text-center text-sm text-[#5c6578]">
          {t('home.noConference')}
        </p>
      ) : null}

      {!canManage && !waitingRole ? (
        <SessionChairDashboard
          conferenceId={conference?.id}
          conferences={active}
          counts={counts}
          board={board}
          onBoard={setBoard}
          query={query}
          onQuery={setQuery}
          loading={assigned.isPending}
          items={visible}
          empty={mine.length === 0 ? t('sessionChair.empty') : t('sessionChair.noneMatch')}
          field={field}
          onAssess={assess}
          onPickConference={(id) => setParams({ conference: id })}
        />
      ) : null}
    </div>
  );
}

const CHAIR_FILTERS: { id: SessionChairBoard; label: string }[] = [
  { id: 'all', label: 'home.boardAll' },
  { id: 'pending', label: 'home.boardTodo' },
  { id: 'scheduled', label: 'sessionChair.scheduled' },
  { id: 'waiting', label: 'sessionChair.waiting' },
  { id: 'presented', label: 'dossier.presentationPresented' },
];

function SessionChairDashboard({
  conferenceId,
  conferences,
  counts,
  board,
  onBoard,
  query,
  onQuery,
  loading,
  items,
  empty,
  field,
  onAssess,
  onPickConference,
}: {
  conferenceId?: string;
  conferences: Membership[];
  counts: Record<SessionChairBoard, number>;
  board: SessionChairBoard;
  onBoard: (board: SessionChairBoard) => void;
  query: string;
  onQuery: (value: string) => void;
  loading: boolean;
  items: AssignedPresentation[];
  empty: string;
  field: string;
  onAssess: (presentationId: string, form: FormData) => Promise<void>;
  onPickConference: (id: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {conferences.length > 1 ? (
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {conferences.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === conferenceId}
              className={`rounded-full px-2.5 py-1.5 text-xs font-bold sm:px-3 sm:py-2 sm:text-sm ${
                item.id === conferenceId
                  ? 'bg-[#5d74ff]/15 text-[#3d4fd4]'
                  : 'bg-white text-[#5c6578]'
              }`}
              onClick={() => onPickConference(item.id)}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <Metric
          tone="amber"
          label={t('home.boardTodo')}
          value={loading ? '—' : counts.pending}
          hint={t('sessionChair.todoHint')}
          active={board === 'pending'}
          onClick={() => onBoard('pending')}
        />
        <Metric
          tone="blue"
          label={t('sessionChair.scheduled')}
          value={loading ? '—' : counts.scheduled}
          hint={t('sessionChair.scheduledHint')}
          active={board === 'scheduled'}
          onClick={() => onBoard('scheduled')}
        />
        <Metric
          tone="red"
          label={t('sessionChair.waiting')}
          value={loading ? '—' : counts.waiting}
          hint={t('sessionChair.waitingHint')}
          active={board === 'waiting'}
          onClick={() => onBoard('waiting')}
        />
        <Metric
          tone="green"
          label={t('dossier.presentationPresented')}
          value={loading ? '—' : counts.presented}
          hint={t('sessionChair.presentedHint')}
          active={board === 'presented'}
          onClick={() => onBoard('presented')}
        />
      </section>
      <section className="space-y-3 rounded-2xl border border-[#e4e7ee] bg-white p-3 sm:space-y-4 sm:p-5">
        <div>
          <h2 className="text-base font-extrabold sm:text-lg">{t('sessionChair.queue')}</h2>
          <p className="mt-0.5 text-xs text-[#5c6578] sm:mt-1 sm:text-sm">
            {t('sessionChair.queueHint')}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="touch-scroll flex gap-1.5 overflow-x-auto pb-1 sm:gap-2">
            {CHAIR_FILTERS.filter(
              (item) => item.id !== 'waiting' || counts.waiting > 0 || board === 'waiting',
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={board === item.id}
                onClick={() => onBoard(item.id)}
                className={`shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-extrabold sm:px-3 sm:py-2 sm:text-sm ${
                  board === item.id
                    ? 'bg-[#3d4fd4] text-white'
                    : 'bg-[#f6f7fb] text-[#5c6578]'
                }`}
              >
                {t(item.label)} · {counts[item.id]}
              </button>
            ))}
          </div>
          <label className="flex min-w-0 items-center gap-2 rounded-full bg-[#f4f7ff] px-3 py-2 sm:w-72">
            <Search className="size-4 shrink-0 text-[#8b909a]" />
            <span className="sr-only">{t('sessionChair.searchPlaceholder')}</span>
            <input
              value={query}
              onChange={(event) => onQuery(event.target.value)}
              placeholder={t('sessionChair.searchPlaceholder')}
              className="w-full bg-transparent text-sm outline-none placeholder:text-[#a0a6b2]"
            />
          </label>
        </div>
        {loading ? (
          <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
        ) : items.length === 0 ? (
          <p className="rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm text-[#5c6578]">{empty}</p>
        ) : (
          <ul className="grid gap-3">
            {items.map((item) => (
              <li
                key={item.paperId}
                className="rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold tracking-wide text-[#6d7585]">
                      {item.publicId ?? '—'}
                      {' · '}
                      {item.presented
                        ? t('dossier.presentationPresented')
                        : item.schedule
                          ? t('dossier.presentationScheduled')
                          : t('dossier.waitingSchedule')}
                    </p>
                    <h3 className="mt-1 text-base font-extrabold text-[#1c2744]">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-[#5c6578]">
                      {item.schedule
                        ? `${item.schedule.sessionTitle} · ${item.schedule.roomName}`
                        : t('dossier.waitingSchedule')}
                    </p>
                    {item.schedule ? (
                      <p className="mt-0.5 text-xs text-[#8b909a]">
                        {new Date(item.schedule.startsAt).toLocaleString()} –{' '}
                        {new Date(item.schedule.endsAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {' · '}
                        {item.schedule.modality === 'ONLINE'
                          ? t('dossier.modalityOnline')
                          : t('dossier.modalityInPerson')}
                        {item.score !== null ? ` · ${item.score}/10` : ''}
                      </p>
                    ) : null}
                  </div>
                  <Link
                    to={`/workspace/submissions/${item.paperId}`}
                    className="rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-[#3d4fd4] no-underline"
                  >
                    {t('home.open')}
                  </Link>
                </div>
                {item.presented && item.comment ? (
                  <div className="mt-3 rounded-xl border border-[#2fbf71]/30 bg-[#e8f8ef] px-3 py-3">
                    <p className="text-xs font-extrabold uppercase tracking-wide text-[#1c9a57]">
                      {t('dossier.chairRemarks')}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[#1c2744]">{item.comment}</p>
                  </div>
                ) : null}
                {!item.presented && item.schedule ? (
                  <form
                    className="mt-3 grid gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void onAssess(
                        item.schedule!.presentationId,
                        new FormData(event.currentTarget),
                      );
                    }}
                  >
                    <p className="text-xs font-extrabold text-[#1c2744]">
                      {t('dossier.chairFollowUp')}
                    </p>
                    <p className="text-xs text-[#8b909a]">{t('dossier.chairFollowUpHint')}</p>
                    <label className="text-xs font-bold text-[#5c6578]">
                      {t('workflow.presentationScore')}
                      <input
                        name="score"
                        type="number"
                        min={1}
                        max={10}
                        defaultValue={item.score ?? ''}
                        className="mt-1 block w-24 rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-sm"
                      />
                    </label>
                    <label className="text-xs font-bold text-[#5c6578]">
                      {t('dossier.chairRemarks')}
                      <textarea
                        name="comment"
                        className={`${field} min-h-20`}
                        placeholder={t('dossier.chairRemarksPlaceholder')}
                        defaultValue={item.comment ?? ''}
                        required
                      />
                    </label>
                    <div>
                      <Button type="submit" size="sm">
                        {t('dossier.markPresented')}
                      </Button>
                    </div>
                  </form>
                ) : null}
                {!item.presented && !item.schedule ? (
                  <p className="mt-3 text-xs font-semibold text-[#8b909a]">
                    {t('dossier.waitingScheduleHint')}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  hint: string;
  tone: 'blue' | 'green' | 'amber' | 'red';
  active?: boolean;
  onClick?: () => void;
}) {
  const color = {
    blue: 'bg-[#5d74ff]/12 text-[#3d4fd4]',
    green: 'bg-[#2fbf71]/14 text-[#1c9a57]',
    amber: 'bg-[#f0a04b]/16 text-[#9a6410]',
    red: 'bg-[#e35d5d]/12 text-[#c54545]',
  }[tone];
  const className = `metric-card w-full rounded-[24px] px-5 py-4 text-left lg:rounded-lg lg:px-2.5 lg:py-2 ${color} ${
    active ? 'ring-2 ring-[#3d4fd4]/40' : ''
  }`;
  const body = (
    <>
      <dt className="text-sm font-extrabold opacity-90 lg:text-[10px]">{label}</dt>
      <dd className="mt-1 text-4xl font-extrabold tracking-tight lg:mt-0 lg:text-xl">
        {value}
      </dd>
      <p className="mt-2 text-xs font-bold opacity-90 lg:mt-0.5 lg:text-[9px]">{hint}</p>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
