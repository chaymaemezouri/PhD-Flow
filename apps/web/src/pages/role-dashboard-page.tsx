import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useSearchParams } from 'react-router';
import { PaperWorkCard, type WorkPaper } from '@/components/paper-work-card';
import { Button } from '@/components/ui/button';
import { focusStep, type PaperStep } from '@/components/step-bar';
import { useCurrentUser } from '@/features/auth/use-account';
import {
  canStartSubmission,
  canSubmitToConference,
} from '@/features/navigation/can-submit';
import { homePathFor } from '@/features/navigation/home-path';
import { pickConference } from '@/features/navigation/pick-conference';
import type { WorkspaceRole } from '@/features/navigation/modules';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface PaperSummary extends WorkPaper {
  steps?: PaperStep[];
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
  const manager = roles.some((role) => role === 'CHAIR' || role === 'ADMINISTRATOR');
  if (manager && !account.data?.unlockedConferenceId) {
    return <Navigate to="/workspace/conference-access" replace />;
  }
  return <Navigate to={homePathFor(roles)} replace />;
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
  const account = useCurrentUser();
  const [query, setQuery] = useState('');
  const [board, setBoard] = useState<'all' | 'waiting' | 'blocked' | 'clear'>('all');
  const needle = query.trim().toLowerCase();
  const papers = useQuery({ queryKey: ['papers'], queryFn: loadPapers });
  const memberships = useQuery({ queryKey: ['conferences'], queryFn: loadMemberships });
  const profile = account.data?.profile;
  const firstName = profile?.firstName ?? t('top.guest');
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
    papers.data?.filter((paper) =>
      needle.length === 0 ? true : paper.title.toLowerCase().includes(needle),
    ) ?? [];
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
  const conference = memberships.data?.find((item) => item.membershipStatus === 'ACTIVE');
  const openConferences =
    memberships.data?.filter((item) => item.membershipStatus === 'OPEN') ?? [];

  const filters = [
    ['all', 'home.boardAll'],
    ['waiting', 'home.boardWaiting'],
    ['blocked', 'home.boardBlocked'],
    ['clear', 'home.boardClear'],
  ] as const;

  const fullName = profile ? `${profile.firstName} ${profile.lastName}` : firstName;
  const roleLabel = conference
    ? t(`conferences.roles.${conference.role}`, { defaultValue: conference.role })
    : null;

  return (
    <div className="space-y-5 lg:space-y-3">
      <header className="flex flex-col gap-4 rounded-2xl border border-[#e4e7ee] bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 lg:gap-3 lg:px-4 lg:py-3">
        <div className="flex min-w-0 items-center gap-3 lg:gap-2.5">
          {profile?.photoPath ? (
            <img
              src={profile.photoPath}
              alt=""
              className="size-12 rounded-full object-cover lg:size-10"
            />
          ) : (
            <div className="grid size-12 place-items-center rounded-full bg-[#eef2ff] text-base font-extrabold text-[#3d4fd4] lg:size-10 lg:text-sm">
              {firstName.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold lg:text-base">{fullName}</h1>
            <p className="truncate text-sm text-[#5c6578] lg:text-xs">
              {[profile?.academicTitle, conference?.name, roleLabel]
                .filter(Boolean)
                .join(' · ') || t('home.noConference')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/workspace/account"
            className="rounded-full bg-[#f4f7ff] px-3 py-2 text-sm font-bold text-[#3d4fd4] no-underline lg:px-2.5 lg:py-1.5 lg:text-xs"
          >
            {t('auth.profileTitle')}
          </Link>
          {canStartSubmission(false, memberships.data) ? (
            <Button asChild>
              <Link to="/workspace/submissions/new">{t('papers.new')}</Link>
            </Button>
          ) : null}
        </div>
      </header>

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
        <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {boardPapers.map((paper) => (
            <li key={paper.id}>
              <PaperWorkCard paper={paper} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ChairDashboard({ variant = 'admin' }: { variant?: 'admin' | 'committee' }) {
  const { t } = useTranslation();
  const account = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const boardParam = params.get('board');
  const board =
    boardParam === 'waiting' ||
    boardParam === 'blocked' ||
    boardParam === 'decisions' ||
    boardParam === 'clear'
      ? boardParam
      : 'all';
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
  const profile = account.data?.profile;
  const firstName = profile?.firstName ?? t('top.guest');
  const fullName = profile ? `${profile.firstName} ${profile.lastName}` : firstName;
  const roleLabel = managed
    ? t(`conferences.roles.${managed.role}`, { defaultValue: managed.role })
    : null;
  const byStatus = stats.data?.papersByStatus ?? {};
  const rows = papers.data ?? [];
  const decisionCount = rows.filter(
    (paper) => focusStep(paper.steps ?? [])?.key === 'notification',
  ).length;
  const waitingCount = rows.filter(
    (paper) => focusStep(paper.steps ?? [])?.state === 'pending',
  ).length;
  const blockedCount = rows.filter(
    (paper) => focusStep(paper.steps ?? [])?.state === 'failed',
  ).length;
  const clearCount = rows.filter(
    (paper) => focusStep(paper.steps ?? []) === null && paper.status !== 'DRAFT',
  ).length;
  const boardPapers = [...rows]
    .filter((paper) =>
      needle.length === 0 ? true : paper.title.toLowerCase().includes(needle),
    )
    .sort((left, right) => rank(left) - rank(right))
    .filter((paper) => {
      const focus = focusStep(paper.steps ?? []);
      if (board === 'waiting') {
        return focus?.state === 'pending';
      }
      if (board === 'blocked') {
        return focus?.state === 'failed';
      }
      if (board === 'decisions') {
        return focus?.key === 'notification';
      }
      if (board === 'clear') {
        return focus === null && paper.status !== 'DRAFT';
      }
      return true;
    });
  const filters = [
    ['all', 'home.boardAll', rows.length],
    ['waiting', 'home.boardWaiting', waitingCount],
    ['decisions', 'home.boardDecisions', decisionCount],
    ['blocked', 'home.boardBlocked', blockedCount],
    ['clear', 'home.boardClear', clearCount],
  ] as const;

  function setBoard(next: string) {
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

  return (
    <div className="space-y-5 lg:space-y-3">
      <Identity
        name={fullName}
        photo={profile?.photoPath}
        initial={firstName.slice(0, 1)}
        line={
          [profile?.academicTitle, managed?.name, roleLabel]
            .filter(Boolean)
            .join(' · ') || t('home.noConference')
        }
      >
        {managed ? (
          <Link
            to={`/workspace/conferences/${managed.id}`}
            className="rounded-full bg-[#f4f7ff] px-3 py-2 text-sm font-bold text-[#3d4fd4] no-underline lg:px-2.5 lg:py-1.5 lg:text-xs"
          >
            {t('home.manage')}
          </Link>
        ) : null}
        <Link
          to="/workspace/reviews"
          className="rounded-full bg-[#f4f7ff] px-3 py-2 text-sm font-bold text-[#3d4fd4] no-underline lg:px-2.5 lg:py-1.5 lg:text-xs"
        >
          {t('nav.reviews')}
        </Link>
        <button
          type="button"
          onClick={() => setBoard('decisions')}
          className="rounded-full bg-[#5d74ff] px-3 py-2 text-sm font-bold text-white lg:px-2.5 lg:py-1.5 lg:text-xs"
        >
          {t('home.decisions')}
          {decisionCount > 0 ? ` · ${decisionCount}` : ''}
        </button>
      </Identity>
      <p className="text-sm text-[#5c6578]">
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
          tone="blue"
          label={t('home.submitted')}
          value={
            stats.data
              ? (byStatus.SUBMITTED ?? 0)
              : rows.filter((paper) => paper.status === 'SUBMITTED').length || '—'
          }
          hint={t('home.chairPapers')}
        />
        <Metric
          tone="green"
          label={t('home.drafts')}
          value={
            stats.data
              ? (byStatus.DRAFT ?? 0)
              : rows.filter((paper) => paper.status === 'DRAFT').length || '—'
          }
          hint={managed?.name ?? '—'}
        />
        <Metric
          tone="amber"
          label={t('workflow.openReviews')}
          value={stats.data ? stats.data.openReviews : '—'}
          hint={t('home.openReviewsHint')}
        />
        <Metric
          tone="red"
          label={t('workflow.overdue')}
          value={stats.data ? stats.data.overdueReviews : '—'}
          hint={t('home.overdueHint')}
        />
      </section>
      <section className="space-y-3 rounded-2xl border border-[#e4e7ee] bg-white p-3 sm:space-y-4 sm:p-5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
          <div>
            <h2 className="text-base font-extrabold sm:text-lg">{t('home.chairPapers')}</h2>
            <p className="mt-0.5 text-xs text-[#5c6578] sm:mt-1 sm:text-sm">
              {t('home.chairBoardHint')}
            </p>
          </div>
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
        <div className="touch-scroll flex gap-1.5 overflow-x-auto pb-1 sm:gap-2">
          {filters.map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              aria-pressed={board === id}
              onClick={() => setBoard(id)}
              className={`shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-extrabold sm:px-3 sm:py-2 sm:text-sm ${
                board === id ? 'bg-[#3d4fd4] text-white' : 'bg-[#f6f7fb] text-[#5c6578]'
              }`}
            >
              {t(label)} · {count}
            </button>
          ))}
        </div>
        {papers.isPending ? (
          <p className="text-xs text-[#8b909a] sm:text-sm">{t('common.loading')}</p>
        ) : null}
        {!papers.isPending && boardPapers.length === 0 ? (
          <p className="text-xs text-[#5c6370] sm:text-sm">{t('home.chairEmpty')}</p>
        ) : null}
        <ul className="grid gap-2 sm:grid-cols-2 sm:gap-3 xl:grid-cols-3">
          {boardPapers.map((paper) => (
            <li key={paper.id}>
              <PaperWorkCard paper={paper} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ReviewerDashboard() {
  const { t } = useTranslation();
  const account = useCurrentUser();
  const [board, setBoard] = useState<'all' | 'invited' | 'active' | 'done'>('all');
  const memberships = useQuery({ queryKey: ['conferences'], queryFn: loadMemberships });
  const reviews = useQuery({
    queryKey: ['reviews'],
    queryFn: async () => {
      const response = await apiFetch('/api/v1/reviews/mine');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<
        {
          id: string;
          paperId: string;
          paperTitle: string;
          publicId: string | null;
          status: string;
          score: number | null;
          expiresAt: string;
        }[]
      >;
    },
  });
  const conference = memberships.data?.find((item) => item.membershipStatus === 'ACTIVE');
  const profile = account.data?.profile;
  const firstName = profile?.firstName ?? t('top.guest');
  const fullName = profile ? `${profile.firstName} ${profile.lastName}` : firstName;
  const roleLabel = conference
    ? t(`conferences.roles.${conference.role}`, { defaultValue: conference.role })
    : null;
  const items = reviews.data ?? [];
  const invited = items.filter((item) => item.status === 'INVITED');
  const active = items.filter(
    (item) =>
      item.status === 'ACCEPTED' ||
      item.status === 'IN_PROGRESS' ||
      item.status === 'OVERDUE',
  );
  const done = items.filter((item) => item.status === 'COMPLETED');
  const visible =
    board === 'invited'
      ? invited
      : board === 'active'
        ? active
        : board === 'done'
          ? done
          : items;
  const filters = [
    ['all', 'home.boardAll', items.length],
    ['invited', 'home.toAccept', invited.length],
    ['active', 'home.inProgress', active.length],
    ['done', 'home.returned', done.length],
  ] as const;

  function hrefFor(item: (typeof items)[number]) {
    if (
      item.status === 'ACCEPTED' ||
      item.status === 'IN_PROGRESS' ||
      item.status === 'OVERDUE' ||
      item.status === 'COMPLETED'
    ) {
      return `/workspace/submissions/${item.paperId}`;
    }
    return `/workspace/reviews#${item.id}`;
  }

  return (
    <div className="space-y-5 lg:space-y-3">
      <Identity
        name={fullName}
        photo={profile?.photoPath}
        initial={firstName.slice(0, 1)}
        line={
          [profile?.academicTitle, conference?.name, roleLabel]
            .filter(Boolean)
            .join(' · ') || t('home.noConference')
        }
      >
        <Link
          to="/workspace/reviews"
          className="rounded-full bg-[#5d74ff] px-3 py-2 text-sm font-bold text-white no-underline lg:px-2.5 lg:py-1.5 lg:text-xs"
        >
          {t('home.reviewQueue')}
        </Link>
      </Identity>
      <p className="text-sm text-[#5c6578]">{t('home.reviewerIntro')}</p>
      <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <Metric
          tone="blue"
          label={t('home.invitations')}
          value={reviews.data ? items.length : '—'}
          hint={conference?.name ?? '—'}
        />
        <Metric
          tone="amber"
          label={t('home.toAccept')}
          value={reviews.data ? invited.length : '—'}
          hint={t('reviews.statuses.INVITED')}
        />
        <Metric
          tone="green"
          label={t('home.inProgress')}
          value={reviews.data ? active.length : '—'}
          hint={t('home.openReviewsHint')}
        />
        <Metric
          tone="red"
          label={t('home.returned')}
          value={reviews.data ? done.length : '—'}
          hint={t('reviews.statuses.COMPLETED')}
        />
      </section>
      <section className="space-y-3 rounded-2xl border border-[#e4e7ee] bg-white p-3 sm:space-y-4 sm:p-5">
        <div>
          <h2 className="text-base font-extrabold sm:text-lg">{t('home.reviewQueue')}</h2>
          <p className="mt-0.5 text-xs text-[#5c6578] sm:mt-1 sm:text-sm">
            {t('home.reviewBoardHint')}
          </p>
        </div>
        <div className="touch-scroll flex gap-1.5 overflow-x-auto pb-1 sm:gap-2">
          {filters.map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              aria-pressed={board === id}
              onClick={() => setBoard(id)}
              className={`shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-extrabold sm:px-3 sm:py-2 sm:text-sm ${
                board === id ? 'bg-[#3d4fd4] text-white' : 'bg-[#f6f7fb] text-[#5c6578]'
              }`}
            >
              {t(label)} · {count}
            </button>
          ))}
        </div>
        {reviews.isPending ? (
          <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
        ) : null}
        {!reviews.isPending && visible.length === 0 ? (
          <p className="text-sm text-[#5c6370]">{t('home.reviewEmpty')}</p>
        ) : null}
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((item) => (
            <li key={item.id}>
              <Link
                to={hrefFor(item)}
                className="flex h-full flex-col rounded-xl border border-[#e4e7ee] bg-[#f6f7fb] p-3 text-[#1c2744] no-underline sm:p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs font-bold tracking-wide text-[#6d7585]">
                    {item.publicId ?? t('reviews.title')}
                  </p>
                  <span
                    className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${
                      item.status === 'COMPLETED'
                        ? 'bg-[#2fbf71]/12 text-[#1c9a57]'
                        : item.status === 'OVERDUE' || item.status === 'DECLINED'
                          ? 'bg-[#e35d5d]/10 text-[#c54545]'
                          : item.status === 'INVITED'
                            ? 'bg-[#f0a04b]/14 text-[#9a6410]'
                            : 'bg-[#5d74ff]/12 text-[#3d4fd4]'
                    }`}
                  >
                    {t(`reviews.statuses.${item.status}`, { defaultValue: item.status })}
                  </span>
                </div>
                <h3 className="mt-2 truncate text-base font-extrabold">
                  {item.paperTitle}
                </h3>
                <p className="mt-1 text-xs font-semibold text-[#8b909a]">
                  {new Date(item.expiresAt).toLocaleDateString()}
                  {item.score !== null ? ` · ${item.score}/10` : ''}
                </p>
                <span className="mt-4 inline-flex min-h-9 items-center justify-center rounded-full bg-white px-3 text-xs font-extrabold text-[#3d4fd4]">
                  {item.status === 'INVITED'
                    ? t('reviews.accept')
                    : item.status === 'COMPLETED'
                      ? t('reviews.openPaper')
                      : t('home.open')}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Identity({
  name,
  photo,
  initial,
  line,
  children,
}: {
  name: string;
  photo?: string | null;
  initial: string;
  line: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 rounded-2xl border border-[#e4e7ee] bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5 lg:gap-3 lg:px-4 lg:py-3">
      <div className="flex min-w-0 items-center gap-3 lg:gap-2.5">
        {photo ? (
          <img
            src={photo}
            alt=""
            className="size-12 rounded-full object-cover lg:size-10"
          />
        ) : (
          <div className="grid size-12 place-items-center rounded-full bg-[#eef2ff] text-base font-extrabold text-[#3d4fd4] lg:size-10 lg:text-sm">
            {initial}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold lg:text-base">{name}</h1>
          <p className="truncate text-sm text-[#5c6578] lg:text-xs">{line}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </header>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | string;
  hint: string;
  tone: 'blue' | 'green' | 'amber' | 'red';
}) {
  const color = {
    blue: 'bg-[#5d74ff]/12 text-[#3d4fd4]',
    green: 'bg-[#2fbf71]/14 text-[#1c9a57]',
    amber: 'bg-[#f0a04b]/16 text-[#9a6410]',
    red: 'bg-[#e35d5d]/12 text-[#c54545]',
  }[tone];
  return (
    <div
      className={`metric-card rounded-[24px] px-5 py-4 lg:rounded-lg lg:px-2.5 lg:py-2 ${color}`}
    >
      <dt className="text-sm font-extrabold opacity-90 lg:text-[10px]">{label}</dt>
      <dd className="mt-1 text-4xl font-extrabold tracking-tight lg:mt-0 lg:text-xl">
        {value}
      </dd>
      <p className="mt-2 text-xs font-bold opacity-90 lg:mt-0.5 lg:text-[9px]">{hint}</p>
    </div>
  );
}
