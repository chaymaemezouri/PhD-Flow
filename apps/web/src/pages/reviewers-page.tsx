import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import {
  ConferenceTeamNav,
  ConferenceWorkNav,
} from '@/components/conference-work-nav';
import { CreateTeamMemberDialog } from '@/components/create-team-member-dialog';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/use-account';
import { pickConference } from '@/features/navigation/pick-conference';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface Membership {
  id: string;
  name: string;
  shortName?: string;
  role: string;
  membershipStatus: string;
  status: string;
}

interface ReviewerRow {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  institution?: string | null;
  loginPassword?: string | null;
}

export function ReviewersPage() {
  const { t } = useTranslation();
  const account = useCurrentUser();
  const [params, setParams] = useSearchParams();
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
  const canManage =
    platformAdmin ||
    conference?.role === 'CHAIR' ||
    conference?.role === 'ADMINISTRATOR' ||
    conference?.role === 'COMMITTEE';
  const reviewers = useQuery({
    queryKey: ['reviewers', conference?.id],
    enabled: Boolean(conference?.id && canManage),
    queryFn: async () => {
      const response = await apiFetch(
        `/api/v1/conferences/${conference!.id}/reviewers`,
      );
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<ReviewerRow[]>;
    },
  });
  const dedicated = (reviewers.data ?? []).filter((item) => item.role === 'REVIEWER');
  const needle = search.trim().toLowerCase();
  const conferenceChoices = needle
    ? active.filter((item) =>
        `${item.name} ${item.shortName ?? ''}`.toLowerCase().includes(needle),
      )
    : active;
  const visible = needle
    ? dedicated.filter((item) =>
        `${item.firstName} ${item.lastName} ${item.email}`.toLowerCase().includes(needle),
      )
    : dedicated;

  return (
    <div className="space-y-6">
      {conference && canManage ? (
        <ConferenceWorkNav
          conferenceId={conference.id}
          conferenceName={conference.name}
          role={conference.role}
          current="team"
        />
      ) : (
        <header className="border-b border-[#e6e8ec] pb-4 sm:pb-5">
          <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl lg:text-3xl">
            {t('nav.reviewers')}
          </h1>
          <p className="mt-1 text-sm text-[#5c6578]">{t('reviewers.manageIntro')}</p>
        </header>
      )}
      {conference && canManage ? (
        <ConferenceTeamNav conferenceId={conference.id} current="reviewers" />
      ) : null}

      {conferences.isPending ? (
        <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
      ) : !canManage ? (
        <p className="text-sm text-[#5c6578]">{t('reviewers.manageOnly')}</p>
      ) : active.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#d8dce6] bg-white px-4 py-8 text-center text-sm text-[#5c6578]">
          {t('home.noConference')}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="relative min-w-0 flex-1">
              <p className="text-sm font-bold text-[#1c2744]">{t('nav.conferences')}</p>
              <button
                type="button"
                aria-expanded={conferenceOpen}
                onClick={() => setConferenceOpen((open) => !open)}
                className="mt-1.5 flex min-h-10 w-full items-center justify-between gap-2 rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-left text-sm font-semibold text-[#1c2744]"
              >
                <span className="truncate">{conference?.name ?? t('papers.chooseConference')}</span>
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
                placeholder={t('reviewers.searchHint')}
                className="mt-1.5 block min-h-10 w-full rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-sm font-semibold text-[#1c2744] outline-none placeholder:font-medium placeholder:text-[#8b909a]"
              />
            </label>
          </div>

          {conference ? (
            <>
              <CreateTeamMemberDialog
                open={createOpen}
                onOpenChange={setCreateOpen}
                conferenceId={conference.id}
                role="REVIEWER"
              />
              <section className="rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-extrabold text-[#1c2744]">
                    {t('reviewers.accounts')}
                  </h2>
                  <Button type="button" onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4" />
                    {t('reviewers.createTitle')}
                  </Button>
                </div>
                {reviewers.isPending ? (
                  <p className="mt-4 text-sm text-[#8b909a]">{t('common.loading')}</p>
                ) : visible.length === 0 ? (
                  <p className="mt-4 text-sm text-[#5c6578]">{t('reviewers.accountsEmpty')}</p>
                ) : (
                  <ul className="mt-4 grid gap-3">
                    {visible.map((item) => (
                      <li key={item.userId} className="rounded-2xl bg-[#f6f7fb] px-4 py-3">
                        <p className="text-sm font-extrabold text-[#1c2744]">
                          {`${item.lastName} ${item.firstName}`.trim()}
                        </p>
                        <p className="mt-0.5 text-xs text-[#8b909a]">{item.email}</p>
                        {item.institution ? (
                          <p className="mt-0.5 text-xs font-semibold text-[#5c6578]">
                            {item.institution}
                          </p>
                        ) : null}
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
      )}
    </div>
  );
}
