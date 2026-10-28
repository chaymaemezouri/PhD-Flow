import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Plus, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { ConferenceFilterList } from '@/components/conference-filter-list';
import {
  ConferenceProgramNav,
  ConferenceWorkNav,
} from '@/components/conference-work-nav';
import { CreateSessionChairDialog } from '@/components/create-session-chair-dialog';
import { RoleContextBanner } from '@/components/role-context-banner';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/use-account';
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

export function SessionChairPage() {
  const { t } = useTranslation();
  const account = useCurrentUser();
  const [params, setParams] = useSearchParams();
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
      conference?.role === 'ADMINISTRATOR' ||
      conference?.role === 'COMMITTEE');
  const waitingRole =
    account.isPending ||
    (!sessionChairSelf && !platformAdmin && conferences.isPending);
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
  const dedicated =
    chairs.data?.filter((item) => item.academicTitle === 'Session chair') ?? [];
  const needle = search.trim().toLowerCase();
  const conferenceChoices = needle
    ? active.filter((item) =>
        `${item.name} ${item.shortName ?? ''}`.toLowerCase().includes(needle),
      )
    : active;
  const visibleAccounts = needle
    ? dedicated.filter((item) =>
        `${item.firstName} ${item.lastName} ${item.email ?? ''}`
          .toLowerCase()
          .includes(needle),
      )
    : dedicated;
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

  return (
    <div className={canManage ? 'space-y-6' : 'space-y-5 lg:space-y-4'}>
      {canManage ? (
        <div className="space-y-3">
          {conference ? (
            <ConferenceWorkNav
              conferenceId={conference.id}
              conferenceName={conference.name}
              role={conference.role}
              current="program"
            />
          ) : (
            <header className="border-b border-[#e6e8ec] pb-4 sm:pb-5">
              <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl lg:text-3xl">
                {t('nav.sessionChair')}
              </h1>
            </header>
          )}
          {conference ? (
            <ConferenceProgramNav conferenceId={conference.id} current="sessionChairs" />
          ) : null}
        </div>
      ) : waitingRole ? null : (
        <>
          <RoleContextBanner
            role="session"
            title={t('sessionChair.role')}
            hint={t('sessionChair.listIntro')}
          />
          <header className="border-b border-[#e6e8ec] pb-4">
            <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl">
              {conference?.name ?? t('sessionChair.queue')}
            </h1>
          </header>
        </>
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
                  placeholder={t('sessionChair.searchAccounts')}
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
                  <div>
                    <h2 className="text-lg font-extrabold text-[#1c2744]">
                      {t('sessionChair.accounts')}
                    </h2>
                    <p className="mt-1 text-sm text-[#5c6578]">
                      {t('sessionChair.accountsManageHint')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild type="button" variant="secondary">
                      <Link to={`/workspace/session-board?conference=${conference.id}`}>
                        {t('sessionChair.goAssignBoard')}
                      </Link>
                    </Button>
                    <Button type="button" onClick={() => setCreateOpen(true)}>
                      <Plus className="size-4" />
                      {t('sessionChair.createTitle')}
                    </Button>
                  </div>
                </div>
                {chairs.isPending ? (
                  <p className="mt-4 text-sm text-[#8b909a]">{t('common.loading')}</p>
                ) : visibleAccounts.length === 0 ? (
                  <p className="mt-4 text-sm text-[#5c6578]">{t('sessionChair.accountsEmpty')}</p>
                ) : (
                  <ul className="mt-4 grid gap-3">
                    {visibleAccounts.map((item) => (
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
  { id: 'absent', label: 'sessionChair.absent' },
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
  onPickConference: (id: string) => void;
}) {
  const { t } = useTranslation();
  const filters = CHAIR_FILTERS.filter((item) => {
    if (item.id === 'waiting') {
      return counts.waiting > 0 || board === 'waiting';
    }
    if (item.id === 'absent') {
      return counts.absent > 0 || board === 'absent';
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <ConferenceFilterList
        items={conferences}
        value={conferenceId}
        onChange={onPickConference}
      />

      <section className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-[#1c2744]">
              {t('sessionChair.queue')}
            </h2>
            <p className="mt-1 text-sm text-[#5c6578]">{t('sessionChair.listHint')}</p>
          </div>
          <label className="flex w-full min-w-0 items-center gap-2 rounded-full border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2">
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

        <div
          className="touch-scroll mt-4 flex gap-2 overflow-x-auto pb-1"
          role="tablist"
          aria-label={t('sessionChair.queue')}
        >
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={board === item.id}
              onClick={() => onBoard(item.id)}
              className={`shrink-0 rounded-full px-3 py-2 text-sm font-extrabold ${
                board === item.id
                  ? 'bg-[#3d4fd4] text-white'
                  : 'bg-[#f6f7fb] text-[#5c6578]'
              }`}
            >
              {t(item.label)} · {loading ? '—' : counts[item.id]}
            </button>
          ))}
        </div>

        <div className="mt-4">
          {loading ? (
            <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
          ) : items.length === 0 ? (
            <p className="rounded-2xl bg-[#f6f7fb] px-4 py-4 text-sm text-[#5c6578]">
              {empty}
            </p>
          ) : (
            <ul className="grid gap-2">
              {items.map((item) => (
                <SessionChairTalkRow key={item.paperId} item={item} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function SessionChairTalkRow({ item }: { item: AssignedPresentation }) {
  const { t, i18n } = useTranslation();
  const statusLabel = item.presented
    ? t('dossier.presentationPresented')
    : item.absent
      ? t('sessionChair.absent')
      : item.schedule
        ? t('dossier.presentationScheduled')
        : t('dossier.waitingSchedule');
  const actionLabel = item.presented
    ? t('sessionChair.editAssessment')
    : item.schedule
      ? t('sessionChair.manageTalk')
      : t('sessionChair.viewTalk');

  return (
    <li>
      <Link
        to={`/workspace/session-chair/${item.paperId}`}
        className="flex items-center justify-between gap-4 rounded-2xl bg-[#f6f7fb] px-4 py-3.5 no-underline transition hover:bg-[#eef2ff]"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-[#8b909a]">
            {item.publicId ?? '—'}
            {' · '}
            {statusLabel}
            {item.presentationLanguage
              ? ` · ${t(`sessionChair.lang${item.presentationLanguage}`)}`
              : ''}
            {item.score !== null ? ` · ${item.score}/10` : ''}
          </p>
          <h3 className="mt-1 truncate text-base font-extrabold text-[#1c2744]">
            {item.title}
          </h3>
          <p className="mt-1 text-xs font-semibold text-[#5c6578]">
            {item.schedule
              ? `${item.schedule.sessionTitle} · ${item.schedule.roomName} · ${new Date(
                  item.schedule.startsAt,
                ).toLocaleString(i18n.language)}`
              : t('dossier.waitingSchedule')}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-[#3d4fd4] px-3.5 py-2 text-xs font-extrabold text-white">
          {actionLabel}
        </span>
      </Link>
    </li>
  );
}
