import { useQuery } from '@tanstack/react-query';
import { Download, Printer, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import {
  ConferenceProgramNav,
  ConferenceWorkNav,
} from '@/components/conference-work-nav';
import { EmptyState } from '@/components/empty-state';
import { IconAction } from '@/components/icon-action';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/use-account';
import { useBoardShortcuts } from '@/hooks/use-board-shortcuts';
import { isSessionChair } from '@/features/navigation/home-path';
import { pickConference } from '@/features/navigation/pick-conference';
import { apiErrorMessage, apiFetch } from '@/services/api';
import { cn } from '@/lib/utils';

interface Membership {
  id: string;
  name: string;
  role: string;
  membershipStatus: string;
  status: string;
  startsOn: string | null;
}

interface SessionRow {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  room: { name: string; capacity: number };
  presentations: {
    id: string;
    modality: 'IN_PERSON' | 'ONLINE';
    score: number | null;
    comment: string;
    presentedAt: string | null;
    paper: {
      id: string;
      title: string;
      publicId: string | null;
      sessionComment: string;
      sessionChairs: { userId: string; name: string; mine: boolean }[];
      presentationReviewers?: { userId: string; name: string; mine: boolean }[];
    };
  }[];
}

interface ProgramView {
  sessions: SessionRow[];
  rooms: { id: string; name: string; capacity?: number }[];
}

export function ProgramPage() {
  const { t } = useTranslation();
  const account = useCurrentUser();
  const [params] = useSearchParams();
  const [query, setQuery] = useState('');
  const [focusIndex, setFocusIndex] = useState(0);
  const sessionChairSelf = isSessionChair(account.data?.profile?.academicTitle);
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
  const manager =
    platformAdmin ||
    conference?.role === 'CHAIR' ||
    conference?.role === 'ADMINISTRATOR' ||
    conference?.role === 'COMMITTEE';
  const program = useQuery({
    queryKey: ['program', conference?.id],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${conference!.id}/program`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<ProgramView>;
    },
    enabled: Boolean(conference?.id),
  });

  const visibleSessions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (
      program.data?.sessions
        .map((session) => ({
          ...session,
          presentations: sessionChairSelf
            ? session.presentations.filter((item) =>
                item.paper.sessionChairs.some((chairItem) => chairItem.mine),
              )
            : session.presentations,
        }))
        .filter((session) =>
          sessionChairSelf ? session.presentations.length > 0 : true,
        )
        .filter((session) => {
          if (!needle) {
            return true;
          }
          const hay = [
            session.title,
            session.room.name,
            ...session.presentations.map((item) => item.paper.title),
            ...session.presentations.map((item) => item.paper.publicId ?? ''),
          ]
            .join(' ')
            .toLowerCase();
          return hay.includes(needle);
        }) ?? []
    );
  }, [program.data?.sessions, query, sessionChairSelf]);

  useEffect(() => {
    setFocusIndex(0);
  }, [conference?.id, query]);

  useBoardShortcuts({
    enabled: visibleSessions.length > 0,
    count: visibleSessions.length,
    index: focusIndex,
    onIndexChange: setFocusIndex,
    onPrevGroup: () =>
      setFocusIndex((current) =>
        visibleSessions.length === 0
          ? 0
          : (current - 1 + visibleSessions.length) % visibleSessions.length,
      ),
    onNextGroup: () =>
      setFocusIndex((current) =>
        visibleSessions.length === 0
          ? 0
          : (current + 1) % visibleSessions.length,
      ),
  });

  return (
    <div className="space-y-5">
      {conference && !sessionChairSelf ? (
        <div className="space-y-3 print:hidden">
          <ConferenceWorkNav
            conferenceId={conference.id}
            conferenceName={conference.name}
            role={conference.role}
            current="program"
          />
          {manager ? (
            <ConferenceProgramNav conferenceId={conference.id} current="program" />
          ) : null}
        </div>
      ) : (
        <div className="print:hidden">
          <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl lg:text-3xl">
            {conference?.name ?? t('workflow.programTitle')}
          </h1>
          {conference ? (
            <p className="mt-1 text-sm font-semibold text-[#5c6578]">
              {sessionChairSelf
                ? t('sessionChair.programHint')
                : t('conferences.workHintProgram')}
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
        <label className="relative block min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8b909a]" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('sessionBoard.searchSessions')}
            className="w-full rounded-2xl border border-[#e4e7ee] bg-white py-2.5 pr-3 pl-9 text-sm font-semibold text-[#1c2744] outline-none"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={visibleSessions.length < 2}
            onClick={() =>
              setFocusIndex(
                (current) =>
                  (current - 1 + visibleSessions.length) % visibleSessions.length,
              )
            }
            aria-label={t('sessionBoard.prevSession')}
          >
            ←
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={visibleSessions.length < 2}
            onClick={() =>
              setFocusIndex((current) => (current + 1) % visibleSessions.length)
            }
            aria-label={t('sessionBoard.nextSession')}
          >
            →
          </Button>
          {conference && manager && !sessionChairSelf ? (
            <Link
              to={`/workspace/session-board?conference=${conference.id}`}
              className="inline-flex min-h-9 items-center rounded-xl bg-[#3d4fd4] px-3.5 text-sm font-extrabold text-white no-underline"
            >
              {t('nav.sessionBoard')}
            </Link>
          ) : null}
          <IconAction
            icon={Printer}
            label={t('print.program')}
            onClick={() => window.print()}
            tone="accent"
          />
          {conference ? (
            <IconAction
              icon={Download}
              label={`${t('workflow.export')} — ${t('workflow.exportHint')}`}
              href={`/api/v1/conferences/${conference.id}/export`}
            />
          ) : null}
        </div>
      </div>
      <p className="text-xs font-semibold text-[#8b909a] print:hidden">
        {t('workflow.exportHint')} · {t('print.hint')} · {t('sessionBoard.shortcuts')}
      </p>

      {program.isError ? (
        <p className="rounded-2xl bg-[#fde8e8] px-4 py-3 text-sm font-semibold text-[#b42318]" role="alert">
          {program.error instanceof Error ? program.error.message : t('common.error')}
        </p>
      ) : null}
      {program.isPending ? (
        <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
      ) : null}
      {program.data && visibleSessions.length === 0 ? (
        <EmptyState
          title={
            sessionChairSelf
              ? t('sessionChair.programEmpty')
              : t('workflow.noSessions')
          }
          body={t('home.emptyFilterBody')}
          actionTo={
            conference && manager
              ? `/workspace/session-board?conference=${conference.id}`
              : '/workspace/conferences'
          }
          actionLabel={
            conference && manager ? t('nav.sessionBoard') : t('nav.conferences')
          }
        />
      ) : null}
      <h1 className="hidden text-2xl font-extrabold text-[#1c2744] print:block">
        {conference?.name ?? t('workflow.programTitle')}
      </h1>
      <ul className="grid gap-3 print:gap-4">
        {visibleSessions.map((session, index) => (
          <li
            key={session.id}
            className={cn(
              'rounded-[28px] border border-[#e4e7ee] bg-gradient-to-b from-white to-[#f8faff] p-5 print:rounded-none print:border print:border-black print:bg-white print:p-3',
              index === focusIndex && 'ring-2 ring-[#3d4fd4]/30 print:ring-0',
            )}
          >
            <p className="text-lg font-extrabold text-[#1c2744]">{session.title}</p>
            <p className="mt-1 text-sm text-[#5c6578]">
              {session.room.name} · {new Date(session.startsAt).toLocaleString()} –{' '}
              {new Date(session.endsAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            {session.presentations.length === 0 ? (
              <p className="mt-3 text-sm text-[#8b909a]">{t('workflow.sessionEmpty')}</p>
            ) : (
              <ul className="mt-4 grid gap-2">
                {session.presentations.map((item) => (
                  <li
                    key={item.id}
                    className={`rounded-2xl px-4 py-3 ${
                      item.presentedAt ? 'bg-[#e8f8ef]' : 'bg-[#f6f7fb]'
                    }`}
                  >
                    <p className="text-sm font-extrabold leading-snug text-[#1c2744]">
                      {item.paper.title}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#5c6578]">
                      {[
                        item.paper.publicId,
                        item.modality === 'ONLINE'
                          ? t('dossier.modalityOnline')
                          : t('dossier.modalityInPerson'),
                        item.presentedAt
                          ? t('dossier.presentationPresented')
                          : t('dossier.presentationScheduled'),
                        item.score !== null ? `${item.score}/10` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {item.paper.sessionChairs.length > 0 ? (
                      <p className="mt-1 text-xs font-semibold text-[#8b909a]">
                        {t('dossier.sessionChair')}:{' '}
                        {item.paper.sessionChairs.map((c) => c.name).join(', ')}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
