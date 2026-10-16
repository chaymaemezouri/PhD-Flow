import type { ConferenceRole, MembershipStatus } from '@scholarflow/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/use-account';
import { canSubmitToConference } from '@/features/navigation/can-submit';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface Mine {
  id: string;
  name: string;
  shortName: string;
  status: string;
  role: ConferenceRole;
  membershipStatus: MembershipStatus | 'OPEN';
  city: string | null;
  country: string | null;
  startsOn: string | null;
  endsOn: string | null;
}

async function loadMine(): Promise<Mine[]> {
  const response = await apiFetch('/api/v1/conferences');
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<Mine[]>;
}

function formatDay(value: string, language: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatRange(start: string | null, end: string | null, language: string) {
  if (start && end && start !== end) {
    return `${formatDay(start, language)} – ${formatDay(end, language)}`;
  }
  if (start) {
    return formatDay(start, language);
  }
  if (end) {
    return formatDay(end, language);
  }
  return null;
}

export function ConferencesPage() {
  const { t, i18n } = useTranslation();
  const account = useCurrentUser();
  const superadmin = account.data?.platformRole === 'SYSTEM_ADMIN';
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mine = useQuery({ queryKey: ['conferences'], queryFn: loadMine });
  async function respondInvite(id: string, accept: boolean) {
    setError(null);
    const response = await apiFetch(`/api/v1/conferences/${id}/invitation/respond`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    });
    if (!response.ok) {
      setError(await apiErrorMessage(response));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['conferences'] });
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1c2744]">
            {t('conferences.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#5c6578]">
            {t('conferences.intro')}
          </p>
        </div>
        {superadmin ? (
          <Button asChild>
            <Link to="/workspace/system">{t('conferences.create')}</Link>
          </Button>
        ) : null}
      </div>
      {mine.isPending ? (
        <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
      ) : null}
      {mine.isError ? (
        <p className="text-sm text-[#c54545]">{mine.error.message}</p>
      ) : null}
      {error ? <p className="text-sm text-[#c54545]">{error}</p> : null}
      {mine.data?.length === 0 ? (
        <p className="text-sm text-[#5c6578]">{t('conferences.empty')}</p>
      ) : null}
      <ul className="grid gap-3">
        {mine.data?.map((item) => {
          const place = [item.city, item.country].filter(Boolean).join(' · ');
          const when = formatRange(item.startsOn, item.endsOn, i18n.language);
          const where = [place, when].filter(Boolean).join(' · ');
          return (
            <li
              key={item.id}
              className="rounded-2xl border border-[#e4e7ee] bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-wide text-[#5d74ff]">
                    {item.shortName}
                  </p>
                  <h2 className="mt-1 text-xl font-extrabold">
                    <Link
                      to={`/workspace/conferences/${item.id}`}
                      className="text-[#1c2744] no-underline"
                    >
                      {item.name}
                    </Link>
                  </h2>
                  {where ? <p className="mt-1 text-sm text-[#5c6578]">{where}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.membershipStatus === 'OPEN' ? null : (
                    <span className="rounded-full bg-[#5d74ff]/12 px-3 py-1 text-xs font-bold text-[#3d4fd4]">
                      {t(`conferences.roles.${item.role}`, { defaultValue: item.role })}
                    </span>
                  )}
                  <span className="rounded-full bg-[#2fbf71]/14 px-3 py-1 text-xs font-bold text-[#1c9a57]">
                    {t(`conferences.states.${item.status}`, {
                      defaultValue: item.status,
                    })}
                  </span>
                  <span className="rounded-full bg-[#f4f7ff] px-3 py-1 text-xs font-bold text-[#5c6578]">
                    {t(`conferences.membership.${item.membershipStatus}`, {
                      defaultValue: item.membershipStatus,
                    })}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                {item.membershipStatus === 'INVITED' ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="inline-flex min-h-10 items-center justify-center rounded-full bg-[#5d74ff] px-4 py-2 text-sm font-extrabold text-white"
                      onClick={() => void respondInvite(item.id, true)}
                    >
                      {t('conferences.accept')}
                    </button>
                    <button
                      type="button"
                      className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#c5cad6] bg-white px-4 py-2 text-sm font-extrabold text-[#5c6578]"
                      onClick={() => void respondInvite(item.id, false)}
                    >
                      {t('conferences.decline')}
                    </button>
                  </div>
                ) : null}
                {canSubmitToConference(superadmin, mine.data ?? [], item) ? (
                  <Link
                    to={`/workspace/submissions/new?conference=${item.id}`}
                    className="inline-flex min-h-10 w-full items-center justify-center rounded-full bg-[#5d74ff] px-4 py-2 text-sm font-extrabold text-white no-underline shadow-[0_6px_16px_rgba(93,116,255,0.28)] sm:w-auto"
                  >
                    {t('home.submitPaper')}
                  </Link>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Link
                    to={`/workspace/conferences/${item.id}`}
                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#c5cad6] bg-white px-3.5 py-2 text-sm font-extrabold text-[#3d4fd4] no-underline"
                  >
                    {t('home.manage')}
                  </Link>
                  {item.membershipStatus === 'OPEN' ? null : (
                    <>
                      <Link
                        to={`/workspace/program?conference=${item.id}`}
                        className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#c5cad6] bg-white px-3.5 py-2 text-sm font-extrabold text-[#3d4fd4] no-underline"
                      >
                        {t('home.program')}
                      </Link>
                      <Link
                        to="/workspace/follow-up"
                        className="inline-flex min-h-10 items-center justify-center rounded-full border border-[#c5cad6] bg-white px-3.5 py-2 text-sm font-extrabold text-[#3d4fd4] no-underline"
                      >
                        {t('home.publication')}
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
