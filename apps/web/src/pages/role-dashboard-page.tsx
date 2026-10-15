import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate } from 'react-router';
import { PaperWorkCard, type WorkPaper } from '@/components/paper-work-card';
import { Button } from '@/components/ui/button';
import { focusStep, type PaperStep } from '@/components/step-bar';
import { useCurrentUser } from '@/features/auth/use-account';
import { homePathFor } from '@/features/navigation/home-path';
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
  const memberships = useQuery({ queryKey: ['conferences'], queryFn: loadMemberships });
  if (memberships.isPending) {
    return <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>;
  }
  const roles =
    memberships.data?.filter((item) => item.membershipStatus === 'ACTIVE').map((item) => item.role) ??
    [];
  return <Navigate to={homePathFor(roles)} replace />;
}

export function RoleDashboardPage({ role }: { role: WorkspaceRole }) {
  if (role === 'reviewer') {
    return <ReviewerDashboard />;
  }
  if (role === 'administrator' || role === 'committee' || role === 'system') {
    return <ChairDashboard />;
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
      papers.data?.filter((paper) => focusStep(paper.steps ?? [])?.state === 'pending').length ?? 0,
    blocked:
      papers.data?.filter((paper) => focusStep(paper.steps ?? [])?.state === 'failed').length ?? 0,
    clear:
      papers.data?.filter(
        (paper) => focusStep(paper.steps ?? []) === null && paper.status !== 'DRAFT',
      ).length ?? 0,
  };
  const visiblePapers =
    papers.data?.filter((paper) =>
      needle.length === 0 ? true : paper.title.toLowerCase().includes(needle),
    ) ?? [];
  const queryClient = useQueryClient();
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
  const directory = useQuery({
    queryKey: ['directory'],
    queryFn: async () => {
      const response = await apiFetch('/api/v1/directory');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<{ id: string; name: string; shortName: string; city: string | null }[]>;
    },
    enabled: memberships.isSuccess && !conference,
  });
  const join = useMutation({
    mutationFn: async (conferenceId: string) => {
      const response = await apiFetch(`/api/v1/conferences/${conferenceId}/join`, {
        method: 'POST',
        body: '{}',
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['conferences'] });
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
    },
  });

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
    <div className="space-y-5">
      <header className="flex flex-col gap-4 rounded-2xl border border-[#e4e7ee] bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          {profile?.photoPath ? (
            <img src={profile.photoPath} alt="" className="size-12 rounded-full object-cover" />
          ) : (
            <div className="grid size-12 place-items-center rounded-full bg-[#eef2ff] text-base font-extrabold text-[#3d4fd4]">
              {firstName.slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold">{fullName}</h1>
            <p className="truncate text-sm text-[#5c6578]">
              {[profile?.academicTitle, conference?.name, roleLabel].filter(Boolean).join(' · ') ||
                t('home.noConference')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/workspace/account"
            className="rounded-full bg-[#f4f7ff] px-3 py-2 text-sm font-bold text-[#3d4fd4] no-underline"
          >
            {t('auth.profileTitle')}
          </Link>
          <Button asChild>
            <Link to="/workspace/submissions/new">{t('papers.new')}</Link>
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric tone="blue" label={t('home.papersCount')} value={papers.data ? counts.total : '—'} hint={papers.data ? t('home.completeOf', { done: counts.clear, total: counts.total }) : '—'} />
        <Metric tone="green" label={t('home.submitted')} value={papers.data ? counts.submitted : '—'} hint={`${t('home.drafts')} · ${counts.draft}`} />
        <Metric tone="amber" label={t('home.waiting')} value={papers.data ? counts.waiting : '—'} hint={t('home.waitingHint')} />
        <Metric tone="red" label={t('home.blocked')} value={papers.data ? counts.blocked : '—'} hint={t('home.blockedHint')} />
      </section>

      <section className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5">
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
                    className={`rounded-full px-3 py-1.5 text-sm font-extrabold ${
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
          {papers.isPending ? <p className="mt-4 text-sm text-[#8b909a]">{t('common.loading')}</p> : null}
          {papers.isError ? <p className="mt-4 text-sm text-[#c54545]" role="alert">{papers.error.message}</p> : null}
          {boardPapers.length === 0 && !papers.isPending ? (
            <div className="mt-4 rounded-3xl bg-[#f6f7fb] px-5 py-5">
              <p className="text-sm text-[#5c6370]">{conference ? t('home.empty') : t('home.joinBody')}</p>
              {!conference ? (
                <ul className="mt-3 space-y-2">
                  {directory.data?.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-bold">
                        {item.name}
                        {item.city ? ` · ${item.city}` : ''}
                      </span>
                      <button
                        type="button"
                        className="rounded-full bg-[#5d74ff]/80 px-3 py-1.5 text-sm font-bold text-white"
                        disabled={join.isPending}
                        onClick={() => void join.mutate(item.id)}
                      >
                        {t('home.join')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {join.isError ? <p className="mt-2 text-sm text-[#c54545]" role="alert">{join.error.message}</p> : null}
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

function ChairDashboard() {
  const { t } = useTranslation();
  const account = useCurrentUser();
  const memberships = useQuery({ queryKey: ['conferences'], queryFn: loadMemberships });
  const managed = memberships.data?.find(
    (item) =>
      item.membershipStatus === 'ACTIVE' &&
      (item.role === 'CHAIR' || item.role === 'ADMINISTRATOR' || item.role === 'COMMITTEE'),
  );
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
      return response.json() as Promise<{ id: string; title: string; status: string; publicId: string | null }[]>;
    },
    enabled: Boolean(managed),
  });
  const profile = account.data?.profile;
  const firstName = profile?.firstName ?? t('top.guest');
  const fullName = profile ? `${profile.firstName} ${profile.lastName}` : firstName;
  const roleLabel = managed ? t(`conferences.roles.${managed.role}`, { defaultValue: managed.role }) : null;
  const byStatus = stats.data?.papersByStatus ?? {};

  return (
    <div className="space-y-5">
      <Identity
        name={fullName}
        photo={profile?.photoPath}
        initial={firstName.slice(0, 1)}
        line={[profile?.academicTitle, managed?.name, roleLabel].filter(Boolean).join(' · ') || t('home.noConference')}
      >
        {managed ? (
          <Link
            to={`/workspace/conferences/${managed.id}`}
            className="rounded-full bg-[#f4f7ff] px-3 py-2 text-sm font-bold text-[#3d4fd4] no-underline"
          >
            {t('home.manage')}
          </Link>
        ) : null}
        <Link
          to="/workspace/follow-up"
          className="rounded-full bg-[#5d74ff]/85 px-3 py-2 text-sm font-bold text-white no-underline"
        >
          {t('home.decisions')}
        </Link>
      </Identity>
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric tone="blue" label={t('home.submitted')} value={stats.data ? (byStatus.SUBMITTED ?? 0) : '—'} hint={t('home.chairPapers')} />
        <Metric tone="green" label={t('home.drafts')} value={stats.data ? (byStatus.DRAFT ?? 0) : '—'} hint={managed?.name ?? '—'} />
        <Metric tone="amber" label={t('workflow.openReviews')} value={stats.data ? stats.data.openReviews : '—'} hint={t('home.openReviewsHint')} />
        <Metric tone="red" label={t('workflow.overdue')} value={stats.data ? stats.data.overdueReviews : '—'} hint={t('home.overdueHint')} />
      </section>
      <section className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5">
        <h2 className="text-lg">{t('home.chairPapers')}</h2>
        {papers.isPending ? <p className="mt-4 text-sm text-[#8b909a]">{t('common.loading')}</p> : null}
        {papers.data?.length === 0 ? <p className="mt-4 text-sm text-[#5c6370]">{t('home.chairEmpty')}</p> : null}
        <ul className="mt-4 grid gap-3">
          {papers.data?.map((paper) => (
            <li key={paper.id}>
              <Link
                to={paper.status === 'DRAFT' ? `/workspace/submissions/${paper.id}` : `/workspace/follow-up?paper=${paper.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e4e7ee] px-4 py-3 text-[#1c2744] no-underline"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-extrabold">{paper.title}</span>
                  {paper.publicId ? <span className="mt-1 block text-xs text-[#8b909a]">{paper.publicId}</span> : null}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                    paper.status === 'DRAFT'
                      ? 'bg-[#f0a04b]/16 text-[#9a6410]'
                      : paper.status === 'WITHDRAWN'
                        ? 'bg-[#e35d5d]/12 text-[#c54545]'
                        : 'bg-[#2fbf71]/14 text-[#1c9a57]'
                  }`}
                >
                  {paper.status === 'DRAFT'
                    ? t('papers.draft')
                    : paper.status === 'WITHDRAWN'
                      ? t('papers.withdrawn')
                      : t('papers.submitted')}
                </span>
              </Link>
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
  const memberships = useQuery({ queryKey: ['conferences'], queryFn: loadMemberships });
  const reviews = useQuery({
    queryKey: ['reviews'],
    queryFn: async () => {
      const response = await apiFetch('/api/v1/reviews/mine');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<
        { id: string; paperTitle: string; publicId: string | null; status: string; score: number | null; expiresAt: string }[]
      >;
    },
  });
  const conference = memberships.data?.find((item) => item.membershipStatus === 'ACTIVE');
  const profile = account.data?.profile;
  const firstName = profile?.firstName ?? t('top.guest');
  const fullName = profile ? `${profile.firstName} ${profile.lastName}` : firstName;
  const roleLabel = conference ? t(`conferences.roles.${conference.role}`, { defaultValue: conference.role }) : null;
  const items = reviews.data ?? [];
  const invited = items.filter((item) => item.status === 'INVITED').length;
  const active = items.filter((item) => item.status === 'ACCEPTED' || item.status === 'IN_PROGRESS' || item.status === 'OVERDUE').length;
  const done = items.filter((item) => item.status === 'COMPLETED').length;

  return (
    <div className="space-y-5">
      <Identity
        name={fullName}
        photo={profile?.photoPath}
        initial={firstName.slice(0, 1)}
        line={[profile?.academicTitle, conference?.name, roleLabel].filter(Boolean).join(' · ') || t('home.noConference')}
      >
        <Link
          to="/workspace/reviews"
          className="rounded-full bg-[#5d74ff]/85 px-3 py-2 text-sm font-bold text-white no-underline"
        >
          {t('home.reviewQueue')}
        </Link>
      </Identity>
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Metric tone="blue" label={t('home.invitations')} value={reviews.data ? items.length : '—'} hint={conference?.name ?? '—'} />
        <Metric tone="amber" label={t('home.toAccept')} value={reviews.data ? invited : '—'} hint={t('reviews.statuses.INVITED')} />
        <Metric tone="green" label={t('home.inProgress')} value={reviews.data ? active : '—'} hint={t('home.openReviewsHint')} />
        <Metric tone="red" label={t('home.returned')} value={reviews.data ? done : '—'} hint={t('reviews.statuses.COMPLETED')} />
      </section>
      <section className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5">
        <h2 className="text-lg">{t('home.reviewQueue')}</h2>
        {reviews.isPending ? <p className="mt-4 text-sm text-[#8b909a]">{t('common.loading')}</p> : null}
        {reviews.data?.length === 0 ? <p className="mt-4 text-sm text-[#5c6370]">{t('home.reviewEmpty')}</p> : null}
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to="/workspace/reviews"
                className="block rounded-2xl border border-[#e4e7ee] px-4 py-3 text-[#1c2744] no-underline"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold">{item.paperTitle}</span>
                    <span className="mt-1 block text-xs text-[#8b909a]">
                      {item.publicId ? `${item.publicId} · ` : ''}
                      {new Date(item.expiresAt).toLocaleDateString()}
                      {item.score !== null ? ` · ${item.score}/10` : ''}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${
                      item.status === 'COMPLETED'
                        ? 'bg-[#2fbf71]/14 text-[#1c9a57]'
                        : item.status === 'OVERDUE' || item.status === 'DECLINED'
                          ? 'bg-[#e35d5d]/12 text-[#c54545]'
                          : item.status === 'INVITED'
                            ? 'bg-[#f0a04b]/16 text-[#9a6410]'
                            : 'bg-[#5d74ff]/12 text-[#3d4fd4]'
                    }`}
                  >
                    {t(`reviews.statuses.${item.status}`, { defaultValue: item.status })}
                  </span>
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
    <header className="flex flex-col gap-4 rounded-2xl border border-[#e4e7ee] bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        {photo ? (
          <img src={photo} alt="" className="size-12 rounded-full object-cover" />
        ) : (
          <div className="grid size-12 place-items-center rounded-full bg-[#eef2ff] text-base font-extrabold text-[#3d4fd4]">
            {initial}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-extrabold">{name}</h1>
          <p className="truncate text-sm text-[#5c6578]">{line}</p>
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
    <div className={`rounded-[24px] px-5 py-4 ${color}`}>
      <dt className="text-sm font-extrabold opacity-90">{label}</dt>
      <dd className="mt-1 text-4xl font-extrabold tracking-tight">{value}</dd>
      <p className="mt-2 text-xs font-bold opacity-90">{hint}</p>
    </div>
  );
}
