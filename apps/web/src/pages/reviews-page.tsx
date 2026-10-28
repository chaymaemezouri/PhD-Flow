import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';
import { ConflictPanel } from '@/components/conflict-panel';
import { ConferenceWorkNav } from '@/components/conference-work-nav';
import { ReviewQueueList, ReviewQueueToolbar } from '@/components/review-queue-list';
import { Button } from '@/components/ui/button';
import { useFeedback } from '@/features/feedback/feedback';
import { pickConference } from '@/features/navigation/pick-conference';
import {
  loadMyReviews,
  reviewQueueCounts,
  visibleReviews,
  type ReviewBoard,
} from '@/features/reviews/review-queue';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface Membership {
  id: string;
  name: string;
  role: string;
  membershipStatus: string;
}

interface PaperRow {
  id: string;
  title: string;
  status: string;
  publicId: string | null;
  scopeStatus?: string;
  assignmentCount?: number;
}

async function loadJson<T>(path: string): Promise<T> {
  const response = await apiFetch(path);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<T>;
}

export function ReviewsPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const [params] = useSearchParams();
  const feedback = useFeedback();
  const [conferenceId, setConferenceId] = useState(params.get('conference') ?? '');
  const [board, setBoard] = useState<ReviewBoard>('all');
  const [query, setQuery] = useState('');
  const mine = useQuery({ queryKey: ['reviews'], queryFn: loadMyReviews });
  const conferences = useQuery({
    queryKey: ['conferences'],
    queryFn: () => loadJson<Membership[]>('/api/v1/conferences'),
  });
  const managed =
    conferences.data?.filter(
      (item) =>
        item.membershipStatus === 'ACTIVE' &&
        (item.role === 'CHAIR' ||
          item.role === 'ADMINISTRATOR' ||
          item.role === 'COMMITTEE'),
    ) ?? [];
  const workConference = pickConference(
    managed,
    conferenceId || params.get('conference'),
  );

  useEffect(() => {
    if (!conferenceId && workConference?.id) {
      setConferenceId(workConference.id);
    }
  }, [conferenceId, workConference?.id]);

  const papers = useQuery({
    queryKey: ['conference-papers', conferenceId],
    queryFn: () => loadJson<PaperRow[]>(`/api/v1/conferences/${conferenceId}/papers`),
    enabled: conferenceId.length > 0,
  });
  const reviewPapers = (papers.data ?? []).filter(
    (item) => item.status === 'SUBMITTED' && item.scopeStatus === 'ACCEPTED',
  );

  const items = mine.data ?? [];
  const counts = useMemo(() => reviewQueueCounts(items), [items]);
  const visible = useMemo(
    () => visibleReviews(items, board, query),
    [board, items, query],
  );
  const hashId = location.hash.replace(/^#/, '').replace(/^review-/, '');
  if (hashId) {
    return <Navigate to={`/workspace/reviews/${hashId}`} replace />;
  }
  const isReviewer =
    conferences.data?.some(
      (item) => item.membershipStatus === 'ACTIVE' && item.role === 'REVIEWER',
    ) ?? false;
  if (!conferences.isPending && managed.length === 0 && isReviewer) {
    const query = params.toString();
    return (
      <Navigate
        to={`/workspace/reviewer${query ? `?${query}` : ''}`}
        replace
      />
    );
  }

  return (
    <div className="space-y-5">
      {workConference ? (
        <ConferenceWorkNav
          conferenceId={workConference.id}
          conferenceName={workConference.name}
          role={workConference.role}
          current="reviews"
        />
      ) : (
        <div>
          <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl">
            {t('reviews.inboxTitle')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5c6578]">
            {t('reviews.inboxHint')}
          </p>
        </div>
      )}

      <section className="space-y-4 rounded-2xl border border-[#e4e7ee] bg-white p-3 sm:p-5">
        <ReviewQueueToolbar
          board={board}
          onBoard={setBoard}
          counts={counts}
          query={query}
          onQuery={setQuery}
        />
        {mine.isPending ? (
          <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
        ) : (
          <ReviewQueueList
            items={visible}
            empty={items.length === 0 ? t('reviews.empty') : t('reviews.noneMatch')}
          />
        )}
      </section>

      {workConference ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-[#1c2744]">
              {t('conferences.workReviews')}
            </h2>
            {reviewPapers.length > 0 ? (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  void apiFetch(`/api/v1/conferences/${workConference.id}/reminders`, {
                    method: 'POST',
                    body: JSON.stringify({}),
                  }).then(async (response) => {
                    if (response.ok) {
                      feedback.success(t('workflow.reminded'));
                    } else {
                      feedback.error(await apiErrorMessage(response));
                    }
                  });
                }}
              >
                {t('workflow.remind')}
              </Button>
            ) : null}
          </div>
          {papers.isPending ? (
            <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
          ) : null}
          {!papers.isPending && reviewPapers.length === 0 ? (
            <p className="rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm text-[#5c6578]">
              {t('reviews.managerEmpty')}
            </p>
          ) : (
            <>
              <ul className="grid gap-2">
                {reviewPapers.map((item) => {
                  const waiting = (item.assignmentCount ?? 0) === 0;
                  return (
                    <li
                      key={item.id}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3 ${
                        waiting ? 'bg-[#fff4e5]' : 'bg-[#e8f8ef]'
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold tracking-wide text-[#8b909a]">
                          {item.publicId ?? '—'}
                        </p>
                        <p className="mt-0.5 truncate text-sm font-extrabold text-[#1c2744]">
                          {item.title}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-[#5c6578]">
                          {waiting
                            ? t('reviews.waitingReview')
                            : t('reviews.hasReviewers', {
                                count: item.assignmentCount ?? 0,
                              })}
                        </p>
                      </div>
                      <Link
                        to={`/workspace/submissions/${item.id}`}
                        className="shrink-0 text-xs font-extrabold text-[#3d4fd4] no-underline"
                      >
                        {t('reviews.openPaper')}
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-4 py-4">
                <p className="text-sm font-semibold text-[#5c6578]">
                  {t('reviews.assignDashboardHint')}
                </p>
                <Link
                  to={`/workspace/assignments?conference=${workConference.id}`}
                  className="mt-3 inline-flex min-h-9 items-center rounded-full bg-[#3d4fd4] px-4 text-sm font-extrabold text-white no-underline"
                >
                  {t('reviews.openBoard')}
                </Link>
              </div>
            </>
          )}
          <ConflictPanel conferenceId={workConference.id} />
        </section>
      ) : null}
    </div>
  );
}
