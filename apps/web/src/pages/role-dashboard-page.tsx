import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router';
import { ConferenceWorkNav } from '@/components/conference-work-nav';
import { PaperWorkQueueList, type WorkPaper } from '@/components/paper-work-card';
import { PapersLayoutToggle } from '@/components/papers-layout-toggle';
import { PapersLayoutView } from '@/components/papers-layout-view';
import { ReviewQueueList, ReviewQueueToolbar } from '@/components/review-queue-list';
import { focusStep, type PaperStep } from '@/components/step-bar';
import { useCurrentUser } from '@/features/auth/use-account';
import { canSubmitToConference } from '@/features/navigation/can-submit';
import { homePathFor, isCreatedAdmin, isSessionChair } from '@/features/navigation/home-path';
import { pickConference } from '@/features/navigation/pick-conference';
import type { WorkspaceRole } from '@/features/navigation/modules';
import {
  adminBoardCounts,
  matchesAdminBoard,
  parseAdminBoard,
  type AdminBoard,
} from '@/features/papers/admin-board';
import {
  readPapersLayout,
  writePapersLayout,
  type PapersLayout,
} from '@/features/papers/papers-layout';
import {
  loadMyReviews,
  parseReviewBoard,
  reviewQueueCounts,
  reviewTodoCount,
  visibleReviews,
  type ReviewBoard,
} from '@/features/reviews/review-queue';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface PaperSummary extends WorkPaper {
  steps?: PaperStep[];
  scopeStatus?: string;
  doi?: string | null;
  assignmentCount?: number;
  decision?: { outcome: string; status: string } | null;
}

function rank(paper: PaperSummary): number {
  const focus = focusStep(paper.steps ?? []);
  if (focus?.state === 'failed') {
    return 0;
  }
  if (focus) {
    return 1;
  }
  return 2;
}

async function loadPapers(): Promise<PaperSummary[]> {
  const response = await apiFetch('/api/v1/papers');
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<PaperSummary[]>;
}

interface Membership {
  id: string;
  name: string;
  role: string;
  membershipStatus: string;
  status: string;
  startsOn: string | null;
}

async function loadMemberships(): Promise<Membership[]> {
  const response = await apiFetch('/api/v1/conferences');
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<Membership[]>;
}

export function WorkspaceHome() {
  const { t } = useTranslation();
  const account = useCurrentUser();
  const memberships = useQuery({ queryKey: ['conferences'], queryFn: loadMemberships });
  if (account.isPending || memberships.isPending) {
    return <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>;
  }
  if (account.data?.platformRole === 'SYSTEM_ADMIN') {
    return <Navigate to="/workspace/system" replace />;
  }
  const roles =
    memberships.data
      ?.filter((item) => item.membershipStatus === 'ACTIVE')
      .map((item) => item.role) ?? [];
  return (
    <Navigate
      to={homePathFor(roles, {
        createdAdmin: isCreatedAdmin(account.data?.profile?.academicTitle),
        sessionChair: isSessionChair(account.data?.profile?.academicTitle),
      })}
      replace
    />
  );
}

export function RoleDashboardPage({ role }: { role: WorkspaceRole }) {
  if (role === 'reviewer') {
    return <ReviewerDashboard />;
  }
  if (role === 'administrator' || role === 'committee') {
    return <ChairDashboard variant={role === 'committee' ? 'committee' : 'admin'} />;
  }
  return <AuthorDashboard />;
}

function AuthorDashboard() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [board, setBoard] = useState<'all' | 'waiting' | 'blocked' | 'clear'>('all');
  const needle = query.trim().toLowerCase();
  const papers = useQuery({ queryKey: ['papers'], queryFn: loadPapers });
  const memberships = useQuery({ queryKey: ['conferences'], queryFn: loadMemberships });
  const counts = {
    total: papers.data?.length ?? 0,
    draft: papers.data?.filter((paper) => paper.status === 'DRAFT').length ?? 0,
    submitted: papers.data?.filter((paper) => paper.status === 'SUBMITTED').length ?? 0,
    waiting:
      papers.data?.filter((paper) => focusStep(paper.steps ?? [])?.state === 'pending')
        .length ?? 0,
    blocked:
      papers.data?.filter((paper) => focusStep(paper.steps ?? [])?.state === 'failed')
        .length ?? 0,
    clear:
      papers.data?.filter(
        (paper) => focusStep(paper.steps ?? []) === null && paper.status !== 'DRAFT',
      ).length ?? 0,
  };
  const visiblePapers =
    papers.data?.filter((paper) => {
      if (needle.length === 0) {
        return true;
      }
      return [paper.title, paper.publicId ?? '', paper.conferenceName ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle);
    }) ?? [];
  const ordered = [...visiblePapers].sort((left, right) => rank(left) - rank(right));
  const boardPapers = ordered.filter((paper) => {
    const focus = focusStep(paper.steps ?? []);
    if (board === 'waiting') {
      return focus?.state === 'pending';
    }
    if (board === 'blocked') {
      return focus?.state === 'failed';
    }
    if (board === 'clear') {
      return focus === null && paper.status !== 'DRAFT';
    }
    return true;
  });
  const openConferences =
    memberships.data?.filter((item) => item.membershipStatus === 'OPEN') ?? [];
  const conference =
    memberships.data?.find((item) => item.membershipStatus === 'ACTIVE') ??
    openConferences[0] ??
    null;

  const filters = [
    ['all', 'home.boardAll'],
    ['waiting', 'home.boardWaiting'],
    ['blocked', 'home.boardBlocked'],
    ['clear', 'home.boardClear'],
  ] as const;

  return (
    <div className="space-y-5 lg:space-y-3">
      {openConferences.some((item) =>
        canSubmitToConference(false, memberships.data ?? [], item),
      ) ? (
        <section className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5 lg:p-3">
          <h2 className="text-lg font-extrabold lg:text-base">{t('home.openConferences')}</h2>
          <ul className="mt-3 grid gap-2">
            {openConferences
              .filter((item) =>
                canSubmitToConference(false, memberships.data ?? [], item),
              )
              .map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#f6f7fb] px-4 py-3 lg:px-3 lg:py-2.5"
                >
                  <span className="text-sm font-extrabold">{item.name}</span>
                  <span className="flex flex-wrap gap-2">
                    <Link
                      to={`/workspace/submissions/new?conference=${item.id}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#5d74ff] px-4 py-2 text-sm font-extrabold text-white no-underline shadow-[0_6px_16px_rgba(93,116,255,0.28)] lg:min-h-8 lg:px-3 lg:py-1.5 lg:text-xs"
                    >
                      {t('home.submitPaper')}
                    </Link>
                    <Link
                      to={`/workspace/conferences/${item.id}`}
                      className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#c5cad6] bg-white px-3.5 py-2 text-sm font-extrabold text-[#3d4fd4] no-underline lg:min-h-8 lg:px-2.5 lg:py-1.5 lg:text-xs"
                    >
                      {t('home.manage')}
                    </Link>
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric
          tone="blue"
          label={t('home.papersCount')}
          value={papers.data ? counts.total : '—'}
          hint={
            papers.data
              ? t('home.completeOf', { done: counts.clear, total: counts.total })
              : '—'
          }
        />
        <Metric
          tone="green"
          label={t('home.submitted')}
          value={papers.data ? counts.submitted : '—'}
          hint={`${t('home.drafts')} · ${counts.draft}`}
        />
        <Metric
          tone="amber"
          label={t('home.waiting')}
          value={papers.data ? counts.waiting : '—'}
          hint={t('home.waitingHint')}
        />
        <Metric
          tone="red"
          label={t('home.blocked')}
          value={papers.data ? counts.blocked : '—'}
          hint={t('home.blockedHint')}
        />
      </section>

      <section className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5 lg:p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {filters.map(([key, label]) => {
              const active = board === key;
              const tone =
                key === 'blocked'
                  ? 'bg-[#e35d5d]/15 text-[#c54545]'
                  : key === 'waiting'
                    ? 'bg-[#f0a04b]/20 text-[#9a6410]'
                    : key === 'clear'
                      ? 'bg-[#2fbf71]/15 text-[#1c9a57]'
                      : 'bg-[#5d74ff]/15 text-[#3d4fd4]';
              return (
                <button
                  key={key}
                  type="button"
                  className={`rounded-full px-3 py-1.5 text-sm font-extrabold lg:px-2.5 lg:py-1 lg:text-xs ${
                    active ? tone : 'bg-[#f4f7ff] text-[#5c6578]'
                  }`}
                  onClick={() => setBoard(key)}
                >
                  {t(label)}
                  <span className="ml-1.5 tabular-nums opacity-80">
                    {key === 'all'
                      ? counts.total
                      : key === 'waiting'
                        ? counts.waiting
                        : key === 'blocked'
                          ? counts.blocked
                          : counts.clear}
                  </span>
                </button>
              );
            })}
          </div>
          <label className="flex items-center gap-2 rounded-full bg-[#f4f7ff] px-3 py-2">
            <Search className="size-4 text-[#8b909a]" />
            <span className="sr-only">{t('top.search')}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('home.search')}
              className="w-full bg-transparent text-sm outline-none placeholder:text-[#a0a6b2] lg:w-56"
            />
          </label>
        </div>
        {papers.isPending ? (
          <p className="mt-4 text-sm text-[#8b909a]">{t('common.loading')}</p>
        ) : null}
        {papers.isError ? (
          <p className="mt-4 text-sm text-[#c54545]" role="alert">
            {papers.error.message}
          </p>
        ) : null}
        {boardPapers.length === 0 && !papers.isPending ? (
          <div className="mt-4 rounded-3xl bg-[#f6f7fb] px-5 py-5">
            <p className="text-sm text-[#5c6370]">
              {conference ? t('home.empty') : t('home.joinBody')}
            </p>
          </div>
        ) : null}
        {boardPapers.length > 0 ? (
          <div className="mt-4">
            <PaperWorkQueueList papers={boardPapers} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

const CHAIR_FILTERS: { id: AdminBoard; label: string }[] = [
  { id: 'all', label: 'home.boardAll' },
  { id: 'todo', label: 'home.boardTodo' },
  { id: 'scope', label: 'home.boardScope' },
  { id: 'reviews', label: 'home.boardReviews' },
  { id: 'decisions', label: 'home.boardDecisions' },
  { id: 'registration', label: 'home.boardRegistration' },
  { id: 'presentation', label: 'home.boardPresentation' },
  { id: 'camera', label: 'home.boardCamera' },
  { id: 'copyright', label: 'home.boardCopyright' },
  { id: 'clear', label: 'home.boardClear' },
  { id: 'published', label: 'home.boardPublished' },
  { id: 'blocked', label: 'home.boardBlocked' },
];

function ChairDashboard({ variant = 'admin' }: { variant?: 'admin' | 'committee' }) {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState<PapersLayout>(() => readPapersLayout());
  const board = parseAdminBoard(params.get('board'));
  const needle = query.trim().toLowerCase();
  const memberships = useQuery({ queryKey: ['conferences'], queryFn: loadMemberships });
  const managedList =
    memberships.data?.filter(
      (item) =>
        item.membershipStatus === 'ACTIVE' &&
        (item.role === 'CHAIR' ||
          item.role === 'ADMINISTRATOR' ||
          item.role === 'COMMITTEE'),
    ) ?? [];
  const managed = pickConference(managedList, params.get('conference'));
  const canStats = managed?.role === 'CHAIR' || managed?.role === 'ADMINISTRATOR';
  const stats = useQuery({
    queryKey: ['statistics', managed?.id],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${managed!.id}/statistics`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<{
        papersByStatus: Record<string, number>;
        openReviews: number;
        overdueReviews: number;
      }>;
    },
    enabled: Boolean(managed && canStats),
  });
  const papers = useQuery({
    queryKey: ['conference-papers', managed?.id],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${managed!.id}/papers`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<PaperSummary[]>;
    },
    enabled: Boolean(managed),
  });
  const rows = papers.data ?? [];
  const counts = adminBoardCounts(rows);
  const boardPapers = [...rows]
    .filter((paper) =>
      needle.length === 0
        ? true
        : [paper.title, paper.publicId ?? ''].join(' ').toLowerCase().includes(needle),
    )
    .sort((left, right) => rank(left) - rank(right))
    .filter((paper) => matchesAdminBoard(paper, board));

  function setBoard(next: AdminBoard) {
    const nextParams = new URLSearchParams(params);
    if (next === 'all') {
      nextParams.delete('board');
    } else {
      nextParams.set('board', next);
    }
    if (managed?.id) {
      nextParams.set('conference', managed.id);
    }
    setParams(nextParams);
  }

  function chooseLayout(next: PapersLayout) {
    setLayout(next);
    writePapersLayout(next);
  }

  if (!memberships.isPending && managedList.length === 0) {
    return (
      <div className="rounded-2xl border border-[#e4e7ee] bg-white p-5">
        <h1 className="text-xl font-extrabold text-[#1c2744]">{t('home.overview')}</h1>
        <p className="mt-2 text-sm text-[#5c6578]">{t('home.noManagedConference')}</p>
        <Link
          to="/workspace/conferences"
          className="mt-4 inline-flex text-sm font-extrabold text-[#3d4fd4] no-underline"
        >
          {t('nav.conferences')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 lg:space-y-4">
      {managed ? (
        <ConferenceWorkNav
          conferenceId={managed.id}
          conferenceName={managed.name}
          role={managed.role}
          current="papers"
        />
      ) : null}
      <p className="max-w-2xl text-sm text-[#5c6578]">
        {t(variant === 'committee' ? 'home.committeeIntro' : 'home.chairIntro')}
      </p>
      {managedList.length > 1 ? (
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {managedList.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === managed?.id}
              className={`rounded-full px-2.5 py-1.5 text-xs font-bold sm:px-3 sm:py-2 sm:text-sm ${
                item.id === managed?.id
                  ? 'bg-[#5d74ff]/15 text-[#3d4fd4]'
                  : 'bg-white text-[#5c6578]'
              }`}
              onClick={() => setParams({ conference: item.id })}
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
          value={papers.data ? counts.todo : '—'}
          hint={t('home.chairTodoHint')}
          active={board === 'todo'}
          onClick={() => setBoard('todo')}
        />
        <Metric
          tone="blue"
          label={t('home.boardDecisions')}
          value={papers.data ? counts.decisions : '—'}
          hint={t('home.boardReviews')}
          active={board === 'decisions'}
          onClick={() => setBoard('decisions')}
        />
        <Metric
          tone="green"
          label={t('home.boardClear')}
          value={papers.data ? counts.clear : '—'}
          hint={t('home.chairReadyHint')}
          active={board === 'clear'}
          onClick={() => setBoard('clear')}
        />
        <Metric
          tone="red"
          label={t('workflow.overdue')}
          value={stats.data ? stats.data.overdueReviews : '—'}
          hint={t('home.overdueHint')}
        />
      </section>
      {managed && canStats && (stats.data?.openReviews ?? 0) > 0 ? (
        <p className="text-xs font-semibold text-[#5c6578] sm:text-sm">
          {t('workflow.openReviews')}: {stats.data?.openReviews ?? 0}
          {' · '}
          <Link
            to={`/workspace/reviews?conference=${managed.id}`}
            className="font-extrabold text-[#3d4fd4] no-underline"
          >
            {t('home.openReviewsPage')}
          </Link>
        </p>
      ) : null}
      <section className="space-y-3 rounded-2xl border border-[#e4e7ee] bg-white p-3 sm:space-y-4 sm:p-5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
          <div>
            <h2 className="text-base font-extrabold sm:text-lg">{t('home.chairPapers')}</h2>
            <p className="mt-0.5 text-xs text-[#5c6578] sm:mt-1 sm:text-sm">
              {t('home.chairBoardHint')}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <PapersLayoutToggle layout={layout} onChange={chooseLayout} />
            <label className="relative block w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-[#8b909a] sm:size-4" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('home.searchPapers')}
                className="w-full rounded-xl border border-[#d8dce6] bg-[#f6f7fb] py-2 pr-3 pl-8 text-xs font-semibold text-[#1c2744] outline-none focus:border-[#3d4fd4] sm:py-2.5 sm:pl-9 sm:text-sm"
              />
            </label>
          </div>
        </div>
        <div className="touch-scroll flex gap-1.5 overflow-x-auto pb-1 sm:gap-2">
          {CHAIR_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={board === item.id}
              onClick={() => setBoard(item.id)}
              className={`shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-extrabold sm:px-3 sm:py-2 sm:text-sm ${
                board === item.id ? 'bg-[#3d4fd4] text-white' : 'bg-[#f6f7fb] text-[#5c6578]'
              }`}
            >
              {t(item.label)} · {counts[item.id]}
            </button>
          ))}
        </div>
        {papers.isPending ? (
          <p className="text-xs text-[#8b909a] sm:text-sm">{t('common.loading')}</p>
        ) : null}
        {!papers.isPending && boardPapers.length === 0 ? (
          <p className="text-xs text-[#5c6370] sm:text-sm">{t('home.chairEmpty')}</p>
        ) : null}
        {!papers.isPending && boardPapers.length > 0 ? (
          layout === 'list' ? (
            <PaperWorkQueueList papers={boardPapers} />
          ) : (
            <PapersLayoutView layout={layout} papers={boardPapers} />
          )
        ) : null}
      </section>
    </div>
  );
}

function ReviewerDashboard() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const board = parseReviewBoard(params.get('board'));
  const memberships = useQuery({ queryKey: ['conferences'], queryFn: loadMemberships });
  const reviews = useQuery({ queryKey: ['reviews'], queryFn: loadMyReviews });
  const presentations = useQuery({
    queryKey: ['presentations-mine'],
    queryFn: async () => {
      const response = await apiFetch('/api/v1/presentations/mine');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<
        {
          paperId: string;
          conferenceId?: string;
          title: string;
          publicId: string | null;
          conferenceName: string;
          role: 'CHAIR' | 'REVIEWER';
          slidesStatus: string;
          presented: boolean;
          schedule: {
            sessionTitle: string;
            roomName: string;
            startsAt: string;
            endsAt: string;
            modality: 'IN_PERSON' | 'ONLINE';
          } | null;
        }[]
      >;
    },
  });
  const reviewerConferences =
    memberships.data?.filter(
      (item) => item.membershipStatus === 'ACTIVE' && item.role === 'REVIEWER',
    ) ?? [];
  const conference = pickConference(
    reviewerConferences.length > 0 ? reviewerConferences : memberships.data,
    params.get('conference'),
  );
  const conferenceId = conference?.id;
  const scoped = useMemo(
    () =>
      (reviews.data ?? []).filter((item) =>
        conferenceId ? item.conferenceId === conferenceId : true,
      ),
    [conferenceId, reviews.data],
  );
  const counts = useMemo(() => reviewQueueCounts(scoped), [scoped]);
  const visible = useMemo(
    () => visibleReviews(scoped, board, query),
    [board, query, scoped],
  );
  const myTalks = (presentations.data ?? []).filter(
    (item) =>
      item.role === 'REVIEWER' &&
      (!conferenceId || item.conferenceId === conferenceId || !item.conferenceId),
  );
  const overdueCount = scoped.filter((item) => item.status === 'OVERDUE').length;

  function setBoard(next: ReviewBoard) {
    const nextParams = new URLSearchParams(params);
    if (next === 'all') {
      nextParams.delete('board');
    } else {
      nextParams.set('board', next);
    }
    if (conferenceId) {
      nextParams.set('conference', conferenceId);
    }
    setParams(nextParams);
  }

  return (
    <div className="space-y-5 lg:space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl">
          {conference?.name ?? t('home.reviewQueue')}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[#5c6578]">{t('home.reviewerIntro')}</p>
      </div>
      {reviewerConferences.length > 1 ? (
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {reviewerConferences.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === conferenceId}
              className={`rounded-full px-2.5 py-1.5 text-xs font-bold sm:px-3 sm:py-2 sm:text-sm ${
                item.id === conferenceId
                  ? 'bg-[#5d74ff]/15 text-[#3d4fd4]'
                  : 'bg-white text-[#5c6578]'
              }`}
              onClick={() => setParams({ conference: item.id })}
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
          value={reviews.data ? reviewTodoCount(counts) : '—'}
          hint={t('home.reviewTodoHint')}
          onClick={() =>
            setBoard(
              counts.invited > 0 ? 'invited' : counts.active > 0 ? 'active' : 'all',
            )
          }
        />
        <Metric
          tone="blue"
          label={t('home.toAccept')}
          value={reviews.data ? counts.invited : '—'}
          hint={t('reviews.statuses.INVITED')}
          active={board === 'invited'}
          onClick={() => setBoard('invited')}
        />
        <Metric
          tone="green"
          label={t('home.inProgress')}
          value={reviews.data ? counts.active : '—'}
          hint={
            overdueCount > 0
              ? t('home.overdueHint')
              : t('home.openReviewsHint')
          }
          active={board === 'active'}
          onClick={() => setBoard('active')}
        />
        <Metric
          tone="red"
          label={t('home.returned')}
          value={reviews.data ? counts.done : '—'}
          hint={t('reviews.statuses.COMPLETED')}
          active={board === 'done'}
          onClick={() => setBoard('done')}
        />
      </section>
      <section className="space-y-3 rounded-2xl border border-[#e4e7ee] bg-white p-3 sm:space-y-4 sm:p-5">
        <div>
          <h2 className="text-base font-extrabold sm:text-lg">{t('home.reviewQueue')}</h2>
          <p className="mt-0.5 text-xs text-[#5c6578] sm:mt-1 sm:text-sm">
            {t('home.reviewBoardHint')}
          </p>
        </div>
        <ReviewQueueToolbar
          board={board}
          onBoard={setBoard}
          counts={counts}
          query={query}
          onQuery={setQuery}
        />
        {reviews.isPending ? (
          <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
        ) : (
          <ReviewQueueList
            items={visible}
            empty={
              scoped.length === 0 ? t('home.reviewEmpty') : t('reviews.noneMatch')
            }
          />
        )}
      </section>
      <section className="space-y-3 rounded-2xl border border-[#e4e7ee] bg-white p-3 sm:space-y-4 sm:p-5">
        <div>
          <h2 className="text-base font-extrabold sm:text-lg">
            {t('dossier.myPresentations')}
          </h2>
          <p className="mt-0.5 text-xs text-[#5c6578] sm:mt-1 sm:text-sm">
            {t('dossier.myPresentationsHint')}
          </p>
        </div>
        {presentations.isPending ? (
          <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
        ) : myTalks.length === 0 ? (
          <p className="text-sm text-[#5c6578]">{t('home.reviewPresentationsEmpty')}</p>
        ) : (
          <ul className="grid gap-2">
            {myTalks.map((item) => (
              <li key={item.paperId}>
                <Link
                  to={`/workspace/submissions/${item.paperId}`}
                  className="block rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-4 py-3 no-underline"
                >
                  <p className="text-xs font-bold text-[#8b909a]">
                    {item.publicId ?? '—'} · {t('dossier.presentationRoleReviewer')}
                  </p>
                  <p className="mt-1 text-sm font-extrabold text-[#1c2744]">{item.title}</p>
                  <p className="mt-1 text-xs font-semibold text-[#5c6578]">
                    {item.schedule
                      ? `${item.schedule.sessionTitle} · ${item.schedule.roomName} · ${new Date(
                          item.schedule.startsAt,
                        ).toLocaleString()}`
                      : t('dossier.waitingSchedule')}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
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