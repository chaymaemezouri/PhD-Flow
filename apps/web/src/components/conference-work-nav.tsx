import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export type ConferenceWorkTab =
  | 'record'
  | 'papers'
  | 'reviews'
  | 'program'
  | 'followUp'
  | 'team';

const HINT: Record<ConferenceWorkTab, string> = {
  record: 'conferences.workHintFiche',
  papers: 'conferences.workHintPapers',
  reviews: 'conferences.workHintReviews',
  program: 'conferences.workHintProgram',
  followUp: 'conferences.workHintPublication',
  team: 'conferences.workHintTeam',
};

function isManagerRole(role?: string) {
  return role === 'CHAIR' || role === 'ADMINISTRATOR' || role === 'COMMITTEE';
}

export function ConferenceWorkNav({
  conferenceId,
  conferenceName,
  role,
  slug,
  showPublic,
  current,
}: {
  conferenceId: string;
  conferenceName?: string;
  role?: string;
  slug?: string | null;
  showPublic?: boolean;
  current: ConferenceWorkTab;
}) {
  const { t } = useTranslation();
  const query = `?conference=${conferenceId}`;
  const papersTo =
    role === 'COMMITTEE'
      ? `/workspace/committee${query}`
      : `/workspace/administrator${query}`;
  const programTo = isManagerRole(role)
    ? `/workspace/session-board${query}`
    : `/workspace/program${query}`;
  const items: { id: ConferenceWorkTab; to: string; label: string }[] = [
    {
      id: 'record',
      to: `/workspace/conferences/${conferenceId}`,
      label: t('conferences.workFiche'),
    },
    { id: 'papers', to: papersTo, label: t('conferences.workPapers') },
    {
      id: 'reviews',
      to: `/workspace/reviews${query}`,
      label: t('conferences.workReviews'),
    },
    {
      id: 'program',
      to: programTo,
      label: t('conferences.workProgram'),
    },
    {
      id: 'followUp',
      to: `/workspace/follow-up${query}`,
      label: t('conferences.workPublication'),
    },
    {
      id: 'team',
      to: `/workspace/reviewers${query}`,
      label: t('conferences.workTeam'),
    },
  ];

  return (
    <div className="space-y-2">
      {conferenceName ? (
        <div>
          <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl">
            {conferenceName}
          </h1>
          <p className="mt-1 text-sm font-semibold text-[#5c6578]">{t(HINT[current])}</p>
        </div>
      ) : null}
      <nav
        aria-label={t('conferences.workNavLabel')}
        className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-[#e4e7ee] bg-gradient-to-r from-white to-[#f6f8ff] p-1.5 sm:gap-2"
      >
        {items.map((item) => {
          const active = item.id === current;
          return (
            <Link
              key={item.id}
              to={item.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-9 items-center rounded-xl px-3 text-xs font-extrabold no-underline sm:min-h-10 sm:px-3.5 sm:text-sm',
                active
                  ? 'bg-[#3d4fd4] text-white shadow-[0_6px_16px_rgba(61,79,212,0.25)]'
                  : 'text-[#5c6578] hover:bg-[#eef2ff] hover:text-[#3d4fd4]',
              )}
            >
              {item.label}
            </Link>
          );
        })}
        {showPublic && slug ? (
          <Link
            to={`/directory/${slug}`}
            className="inline-flex min-h-9 items-center rounded-xl px-3 text-xs font-extrabold text-[#3d4fd4] no-underline hover:bg-[#eef2ff] sm:min-h-10 sm:text-sm"
          >
            {t('conferences.workPublic')}
          </Link>
        ) : null}
      </nav>
      {conferenceName ? null : (
        <p className="text-sm font-semibold text-[#5c6578]">{t(HINT[current])}</p>
      )}
    </div>
  );
}

export function ConferenceTeamNav({
  conferenceId,
  current,
}: {
  conferenceId: string;
  current: 'reviewers' | 'assignments';
}) {
  const { t } = useTranslation();
  const query = `?conference=${conferenceId}`;
  const items = [
    {
      id: 'reviewers' as const,
      to: `/workspace/reviewers${query}`,
      label: t('nav.reviewers'),
    },
    {
      id: 'assignments' as const,
      to: `/workspace/assignments${query}`,
      label: t('nav.assignments'),
    },
  ];

  return (
    <nav aria-label={t('conferences.workTeam')} className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = item.id === current;
        return (
          <Link
            key={item.id}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-9 items-center rounded-xl px-3.5 text-xs font-extrabold no-underline sm:text-sm',
              active
                ? 'bg-[#eef2ff] text-[#3d4fd4] ring-1 ring-[#c5cad6]'
                : 'bg-[#f6f7fb] text-[#5c6578] hover:bg-[#eef2ff]',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ConferenceProgramNav({
  conferenceId,
  current,
}: {
  conferenceId: string;
  current: 'program' | 'sessionBoard' | 'sessionChairs';
}) {
  const { t } = useTranslation();
  const query = `?conference=${conferenceId}`;
  const items = [
    {
      id: 'sessionBoard' as const,
      to: `/workspace/session-board${query}`,
      label: t('nav.sessionBoard'),
    },
    {
      id: 'program' as const,
      to: `/workspace/program${query}`,
      label: t('conferences.programView'),
    },
    {
      id: 'sessionChairs' as const,
      to: `/workspace/session-chair${query}`,
      label: t('conferences.programChairs'),
    },
  ];

  return (
    <nav aria-label={t('conferences.workProgram')} className="flex flex-wrap gap-2">
      {items.map((item) => {
        const active = item.id === current;
        return (
          <Link
            key={item.id}
            to={item.to}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-9 items-center rounded-xl px-3.5 text-xs font-extrabold no-underline sm:text-sm',
              active
                ? 'bg-[#eef2ff] text-[#3d4fd4] ring-1 ring-[#c5cad6]'
                : 'bg-[#f6f7fb] text-[#5c6578] hover:bg-[#eef2ff]',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function ConferenceFicheParts() {
  const { t } = useTranslation();
  const parts = [
    { id: 'identity', label: t('conferences.partIdentity') },
    { id: 'setup', label: t('conferences.tracks') },
    { id: 'registrations', label: t('workflow.registrations') },
    { id: 'people', label: t('conferences.sectionPeople') },
    { id: 'templates', label: t('conferences.templates') },
  ];
  return (
    <nav
      aria-label={t('conferences.partsLabel')}
      className="flex flex-wrap gap-2 border-t border-[#eef1f8] pt-3"
    >
      {parts.map((part) => (
        <a
          key={part.id}
          href={`#${part.id}`}
          className="inline-flex min-h-9 items-center rounded-xl bg-white px-3 text-xs font-extrabold text-[#3d4fd4] no-underline ring-1 ring-[#d8dce6] hover:bg-[#eef2ff]"
        >
          {part.label}
        </a>
      ))}
    </nav>
  );
}
