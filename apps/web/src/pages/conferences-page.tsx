import type { ConferenceRole, MembershipStatus } from '@scholarflow/types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/use-account';
import { useFeedback } from '@/features/feedback/feedback';
import { canSubmitToConference } from '@/features/navigation/can-submit';
import { isCreatedAdmin, isSessionChair } from '@/features/navigation/home-path';
import { apiErrorMessage, apiFetch } from '@/services/api';
import { cn } from '@/lib/utils';

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
    month: 'short',
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

function Badge({
  children,
  tone = 'neutral',
}: {
  children: string;
  tone?: 'neutral' | 'blue' | 'green' | 'amber';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold',
        tone === 'blue' && 'bg-[#eef2ff] text-[#3d4fd4]',
        tone === 'green' && 'bg-[#e8f8ef] text-[#1c9a57]',
        tone === 'amber' && 'bg-[#fff4e5] text-[#9a6410]',
        tone === 'neutral' && 'bg-[#f4f6fb] text-[#5c6578]',
      )}
    >
      {children}
    </span>
  );
}

export function ConferencesPage() {
  const { t, i18n } = useTranslation();
  const account = useCurrentUser();
  const superadmin = account.data?.platformRole === 'SYSTEM_ADMIN';
  const createdAdmin = isCreatedAdmin(account.data?.profile?.academicTitle);
  const sessionChair = isSessionChair(account.data?.profile?.academicTitle);
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const mine = useQuery({ queryKey: ['conferences'], queryFn: loadMine });

  async function respondInvite(id: string, accept: boolean) {
    const response = await apiFetch(`/api/v1/conferences/${id}/invitation/respond`, {
      method: 'POST',
      body: JSON.stringify({ accept }),
    });
    if (!response.ok) {
      feedback.error(await apiErrorMessage(response));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['conferences'] });
    feedback.success(t('conferences.invitationDone'));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-[#1c2744] sm:text-2xl">
            {t('conferences.title')}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-[#5c6578]">
            {t(createdAdmin ? 'conferences.introAdmin' : 'conferences.intro')}
          </p>
        </div>
        {superadmin ? (
          <Button asChild size="sm">
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
      {mine.data?.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#d8dce6] bg-white px-4 py-8 text-center text-sm text-[#5c6578]">
          {t(createdAdmin ? 'conferences.emptyAdmin' : 'conferences.empty')}
        </p>
      ) : null}

      <ul className="grid gap-2.5">
        {mine.data?.map((item) => {
          const place = [item.city, item.country].filter(Boolean).join(', ');
          const when = formatRange(item.startsOn, item.endsOn, i18n.language);
          const invited = item.membershipStatus === 'INVITED';
          const open = item.membershipStatus === 'OPEN';
          const canSubmit = canSubmitToConference(
            superadmin,
            mine.data ?? [],
            item,
            account.data?.profile?.academicTitle,
          );

          return (
            <li
              key={item.id}
              className="rounded-xl border border-[#e4e7ee] bg-white px-4 py-3.5 sm:px-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[#8b93a7]">
                      {item.shortName}
                    </span>
                    <Badge tone="green">
                      {t(`conferences.states.${item.status}`, {
                        defaultValue: item.status,
                      })}
                    </Badge>
                    {!open ? (
                      <Badge tone="blue">
                        {t(`conferences.roles.${item.role}`, {
                          defaultValue: item.role,
                        })}
                      </Badge>
                    ) : null}
                    <Badge tone={invited ? 'amber' : 'neutral'}>
                      {t(`conferences.membership.${item.membershipStatus}`, {
                        defaultValue: item.membershipStatus,
                      })}
                    </Badge>
                  </div>
                  <h2 className="mt-1.5 text-base font-extrabold text-[#1c2744] sm:text-lg">
                    <Link
                      to={`/workspace/conferences/${item.id}`}
                      className="text-inherit no-underline hover:text-[#3d4fd4]"
                    >
                      {item.name}
                    </Link>
                  </h2>
                  {place || when ? (
                    <p className="mt-1 text-xs font-semibold text-[#5c6578] sm:text-sm">
                      {[place, when].filter(Boolean).join(' · ')}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#eef1f8] pt-3">
                {invited ? (
                  <>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void respondInvite(item.id, true)}
                    >
                      {t('conferences.accept')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void respondInvite(item.id, false)}
                    >
                      {t('conferences.decline')}
                    </Button>
                  </>
                ) : null}
                {canSubmit ? (
                  <Button asChild size="sm">
                    <Link to={`/workspace/submissions/new?conference=${item.id}`}>
                      {t('home.submitPaper')}
                    </Link>
                  </Button>
                ) : null}
                {!open && sessionChair ? (
                  <Button asChild size="sm">
                    <Link to={`/workspace/session-chair?conference=${item.id}`}>
                      {t('sessionChair.openQueue')}
                    </Link>
                  </Button>
                ) : null}
                {!open &&
                !sessionChair &&
                (item.role === 'CHAIR' ||
                  item.role === 'ADMINISTRATOR' ||
                  item.role === 'COMMITTEE') ? (
                  <Button asChild size="sm">
                    <Link
                      to={`${
                        item.role === 'COMMITTEE'
                          ? '/workspace/committee'
                          : '/workspace/administrator'
                      }?conference=${item.id}`}
                    >
                      {t('conferences.openPapers')}
                    </Link>
                  </Button>
                ) : null}
                <Button asChild size="sm" variant="outline">
                  <Link to={`/workspace/conferences/${item.id}`}>{t('home.manage')}</Link>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
