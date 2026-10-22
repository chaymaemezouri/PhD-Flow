import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/use-account';
import { pickConference } from '@/features/navigation/pick-conference';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface Membership {
  id: string;
  name: string;
  role: string;
  membershipStatus: string;
  status: string;
  startsOn: string | null;
}

interface ChairPresentation {
  id: string;
  modality: 'IN_PERSON' | 'ONLINE';
  score: number | null;
  comment: string;
  presentedAt: string | null;
  sessionTitle: string;
  roomName: string;
  startsAt: string;
  endsAt: string;
  paper: {
    id: string;
    title: string;
    publicId: string | null;
    sessionComment: string;
  };
}

interface ProgramView {
  sessions: {
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    room: { name: string };
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
      };
    }[];
  }[];
}

export function SessionChairPage() {
  const { t } = useTranslation();
  const account = useCurrentUser();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [board, setBoard] = useState<'all' | 'pending' | 'presented'>('all');
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

  const mine = useMemo(() => {
    const rows: ChairPresentation[] = [];
    for (const session of program.data?.sessions ?? []) {
      for (const item of session.presentations) {
        if (!item.paper.sessionChairs.some((chair) => chair.mine)) {
          continue;
        }
        rows.push({
          id: item.id,
          modality: item.modality,
          score: item.score,
          comment: item.comment,
          presentedAt: item.presentedAt,
          sessionTitle: session.title,
          roomName: session.room.name,
          startsAt: session.startsAt,
          endsAt: session.endsAt,
          paper: {
            id: item.paper.id,
            title: item.paper.title,
            publicId: item.paper.publicId,
            sessionComment: item.paper.sessionComment,
          },
        });
      }
    }
    return rows.sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    );
  }, [program.data]);

  const pending = mine.filter((item) => !item.presentedAt);
  const presented = mine.filter((item) => item.presentedAt);
  const visible =
    board === 'pending' ? pending : board === 'presented' ? presented : mine;

  const profile = account.data?.profile;
  const firstName = profile?.firstName ?? t('top.guest');
  const fullName = profile ? `${profile.firstName} ${profile.lastName}` : firstName;
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
    setMessage(response.ok ? t('workflow.saved') : await apiErrorMessage(response));
    if (response.ok) {
      await queryClient.invalidateQueries({ queryKey: ['program'] });
      await queryClient.invalidateQueries({ queryKey: ['paper'] });
    }
  }

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
              {[t('sessionChair.role'), conference?.name].filter(Boolean).join(' · ') ||
                t('home.noConference')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/workspace/program"
            className="rounded-full bg-[#f4f7ff] px-3 py-2 text-sm font-bold text-[#3d4fd4] no-underline lg:px-2.5 lg:py-1.5 lg:text-xs"
          >
            {t('nav.program')}
          </Link>
        </div>
      </header>

      <p className="text-sm text-[#5c6578]">{t('sessionChair.intro')}</p>

      {active.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {active.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === conference?.id}
              className={`rounded-full px-3 py-2 text-sm font-bold ${
                item.id === conference?.id
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

      <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
        <Metric
          tone="blue"
          label={t('sessionChair.assigned')}
          value={program.isPending ? '—' : mine.length}
          hint={t('sessionChair.assignedHint')}
        />
        <Metric
          tone="amber"
          label={t('sessionChair.pending')}
          value={program.isPending ? '—' : pending.length}
          hint={t('sessionChair.pendingHint')}
        />
        <Metric
          tone="green"
          label={t('dossier.presentationPresented')}
          value={program.isPending ? '—' : presented.length}
          hint={t('sessionChair.presentedHint')}
        />
      </section>

      {message ? (
        <p className="text-sm font-extrabold text-[#1c2744]">{message}</p>
      ) : null}

      <section className="space-y-3 rounded-2xl border border-[#e4e7ee] bg-white p-3 sm:space-y-4 sm:p-5">
        <div>
          <h2 className="text-base font-extrabold sm:text-lg">{t('sessionChair.queue')}</h2>
          <p className="mt-0.5 text-xs text-[#5c6578] sm:mt-1 sm:text-sm">
            {t('sessionChair.queueHint')}
          </p>
        </div>
        <div className="touch-scroll flex gap-1.5 overflow-x-auto pb-1 sm:gap-2">
          {(
            [
              ['all', 'home.boardAll', mine.length],
              ['pending', 'sessionChair.pending', pending.length],
              ['presented', 'dossier.presentationPresented', presented.length],
            ] as const
          ).map(([id, label, count]) => (
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

        {program.isPending ? (
          <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
        ) : null}
        {!program.isPending && visible.length === 0 ? (
          <p className="text-sm text-[#5c6370]">{t('sessionChair.empty')}</p>
        ) : null}

        <ul className="grid gap-3">
          {visible.map((item) => (
            <li
              key={item.id}
              className="rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-4 py-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-wide text-[#6d7585]">
                    {item.paper.publicId ?? '—'}
                    {' · '}
                    {item.presentedAt
                      ? t('dossier.presentationPresented')
                      : t('dossier.presentationScheduled')}
                  </p>
                  <h3 className="mt-1 text-base font-extrabold text-[#1c2744]">
                    {item.paper.title}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-[#5c6578]">
                    {item.sessionTitle} · {item.roomName}
                  </p>
                  <p className="mt-0.5 text-xs text-[#8b909a]">
                    {new Date(item.startsAt).toLocaleString()} –{' '}
                    {new Date(item.endsAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {' · '}
                    {item.modality === 'ONLINE'
                      ? t('dossier.modalityOnline')
                      : t('dossier.modalityInPerson')}
                    {item.score !== null ? ` · ${item.score}/10` : ''}
                  </p>
                </div>
                <Link
                  to={`/workspace/submissions/${item.paper.id}`}
                  className="rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-[#3d4fd4] no-underline"
                >
                  {t('home.open')}
                </Link>
              </div>

              {item.presentedAt && (item.comment || item.paper.sessionComment) ? (
                <div className="mt-3 rounded-xl border border-[#2fbf71]/30 bg-[#e8f8ef] px-3 py-3">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-[#1c9a57]">
                    {t('dossier.chairRemarks')}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[#1c2744]">
                    {item.comment || item.paper.sessionComment}
                  </p>
                </div>
              ) : null}

              {!item.presentedAt ? (
                <form
                  className="mt-3 grid gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void assess(item.id, new FormData(event.currentTarget));
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
                      defaultValue={item.comment || item.paper.sessionComment}
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
            </li>
          ))}
        </ul>
      </section>
    </div>
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
  tone: 'blue' | 'green' | 'amber';
}) {
  const color = {
    blue: 'bg-[#5d74ff]/12 text-[#3d4fd4]',
    green: 'bg-[#2fbf71]/14 text-[#1c9a57]',
    amber: 'bg-[#f0a04b]/16 text-[#9a6410]',
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
