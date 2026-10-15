import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface Assignment {
  id: string;
  paperId: string;
  paperTitle: string;
  publicId: string | null;
  status: string;
  score: number | null;
  recommendation: string | null;
  commentsToAuthor: string | null;
  expiresAt: string;
}

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
}

interface ReviewerRow {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
}

async function loadMine(): Promise<Assignment[]> {
  const response = await apiFetch('/api/v1/reviews/mine');
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<Assignment[]>;
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
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [conferenceId, setConferenceId] = useState('');
  const [paperId, setPaperId] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const mine = useQuery({ queryKey: ['reviews'], queryFn: loadMine });
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
  const papers = useQuery({
    queryKey: ['conference-papers', conferenceId],
    queryFn: () => loadJson<PaperRow[]>(`/api/v1/conferences/${conferenceId}/papers`),
    enabled: conferenceId.length > 0,
  });
  const reviewers = useQuery({
    queryKey: ['reviewers', conferenceId],
    queryFn: () =>
      loadJson<ReviewerRow[]>(`/api/v1/conferences/${conferenceId}/reviewers`),
    enabled: conferenceId.length > 0,
  });

  async function respond(id: string, accept: boolean) {
    setMessage(null);
    const response = await apiFetch(
      `/api/v1/assignments/${id}/${accept ? 'accept' : 'decline'}`,
      {
        method: 'POST',
        body: JSON.stringify(accept ? {} : { reason: '' }),
      },
    );
    if (!response.ok) {
      setMessage(await apiErrorMessage(response));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['reviews'] });
  }

  const field =
    'mt-1 block w-full rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2 text-sm';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold text-[#1c2744]">{t('reviews.title')}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5c6578]">
          {t('reviews.intro')}
        </p>
      </div>
      {message ? (
        <p className="text-sm font-extrabold text-[#1c2744]">{message}</p>
      ) : null}
      {mine.isPending ? <p>{t('common.loading')}</p> : null}
      {mine.data?.length === 0 ? (
        <p className="rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm text-[#5c6578]">
          {t('reviews.empty')}
        </p>
      ) : null}
      <ul className="grid gap-3">
        {mine.data?.map((item) => (
          <li
            key={item.id}
            className="rounded-[28px] border border-[#e4e7ee] bg-white p-5"
          >
            <p className="text-xs font-extrabold tracking-wide text-[#8b909a]">
              {item.publicId ?? t('reviews.title')}
            </p>
            <h2 className="mt-1 text-lg font-extrabold leading-snug text-[#1c2744]">
              {item.paperTitle}
            </h2>
            <p className="mt-2 text-sm text-[#5c6578]">
              {t(`reviews.statuses.${item.status}`, { defaultValue: item.status })}
              {item.expiresAt
                ? ` · ${new Date(item.expiresAt).toLocaleDateString()}`
                : ''}
            </p>
            {item.score !== null ? (
              <p className="mt-3 text-sm font-extrabold text-[#1c2744]">
                {item.score}/10 ·{' '}
                {t(`reviews.recommendations.${item.recommendation ?? ''}`, {
                  defaultValue: item.recommendation ?? '',
                })}
              </p>
            ) : null}
            {item.commentsToAuthor ? (
              <p className="mt-2 text-sm leading-relaxed text-[#5c6578]">
                {item.commentsToAuthor}
              </p>
            ) : null}
            {item.status === 'ACCEPTED' ||
            item.status === 'IN_PROGRESS' ||
            item.status === 'OVERDUE' ? (
              <Link
                className="mt-3 inline-block text-sm font-extrabold text-[#3d4fd4] no-underline"
                to={`/workspace/submissions/${item.paperId}`}
              >
                {t('reviews.openPaper')}
              </Link>
            ) : null}
            {item.status === 'ACCEPTED' ||
            item.status === 'IN_PROGRESS' ||
            item.status === 'OVERDUE' ? (
              <form
                className="mt-4 grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  setMessage(null);
                  void apiFetch(`/api/v1/assignments/${item.id}/review`, {
                    method: 'POST',
                    body: JSON.stringify({
                      recommendation: String(data.get('recommendation')),
                      score: Number(data.get('score')),
                      confidence: Number(data.get('confidence')),
                      commentsToAuthor: String(data.get('comments')),
                      commentsToCommittee: String(data.get('committee') ?? ''),
                    }),
                  }).then(async (response) => {
                    if (!response.ok) {
                      setMessage(await apiErrorMessage(response));
                      return;
                    }
                    setMessage(t('reviews.sent'));
                    await queryClient.invalidateQueries({ queryKey: ['reviews'] });
                  });
                }}
              >
                <label className="text-sm font-bold">
                  {t('reviews.recommendation')}
                  <select name="recommendation" className={field} defaultValue="ACCEPT">
                    {(
                      [
                        'ACCEPT',
                        'WEAK_ACCEPT',
                        'BORDERLINE',
                        'WEAK_REJECT',
                        'REJECT',
                      ] as const
                    ).map((value) => (
                      <option key={value} value={value}>
                        {t(`reviews.recommendations.${value}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-sm font-bold">
                    {t('reviews.score')}
                    <input
                      name="score"
                      type="number"
                      min={1}
                      max={10}
                      defaultValue={8}
                      required
                      className={field}
                    />
                  </label>
                  <label className="text-sm font-bold">
                    {t('reviews.confidence')}
                    <input
                      name="confidence"
                      type="number"
                      min={1}
                      max={5}
                      defaultValue={4}
                      required
                      className={field}
                    />
                  </label>
                </div>
                <label className="text-sm font-bold">
                  {t('reviews.comments')}
                  <textarea
                    name="comments"
                    required
                    minLength={10}
                    className={`${field} min-h-24 py-2`}
                  />
                </label>
                <label className="text-sm font-bold">
                  {t('reviews.committee')}
                  <textarea name="committee" className={`${field} min-h-16 py-2`} />
                </label>
                <div>
                  <Button type="submit">{t('reviews.send')}</Button>
                </div>
              </form>
            ) : null}
            {item.status === 'INVITED' ? (
              <div className="mt-4 flex gap-2">
                <Button type="button" onClick={() => void respond(item.id, true)}>
                  {t('reviews.accept')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void respond(item.id, false)}
                >
                  {t('reviews.decline')}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {managed.length > 0 ? (
        <form
          className="grid gap-3 rounded-[28px] border border-[#e4e7ee] bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage(null);
            void apiFetch(`/api/v1/papers/${paperId}/assignments`, {
              method: 'POST',
              body: JSON.stringify({ reviewerId }),
            }).then(async (response) => {
              if (!response.ok) {
                setMessage(await apiErrorMessage(response));
                return;
              }
              setMessage(t('reviews.assigned'));
            });
          }}
        >
          <h2 className="text-lg font-extrabold text-[#1c2744]">
            {t('reviews.assignTitle')}
          </h2>
          <p className="text-sm leading-relaxed text-[#5c6578]">
            {t('reviews.assignIntro')}
          </p>
          <label className="text-sm font-bold">
            {t('reviews.chooseConference')}
            <select
              className={field}
              value={conferenceId}
              onChange={(event) => setConferenceId(event.target.value)}
            >
              <option value="">{t('reviews.chooseConference')}</option>
              {managed.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            {t('reviews.choosePaper')}
            <select
              className={field}
              value={paperId}
              onChange={(event) => setPaperId(event.target.value)}
            >
              <option value="">{t('reviews.choosePaper')}</option>
              {papers.data
                ?.filter((item) => item.status === 'SUBMITTED')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.publicId ? `${item.publicId} · ${item.title}` : item.title}
                  </option>
                ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            {t('reviews.chooseReviewer')}
            <select
              className={field}
              value={reviewerId}
              onChange={(event) => setReviewerId(event.target.value)}
            >
              <option value="">{t('reviews.chooseReviewer')}</option>
              {reviewers.data?.map((item) => (
                <option key={item.userId} value={item.userId}>
                  {item.firstName} {item.lastName} · {item.email}
                </option>
              ))}
            </select>
          </label>
          <div>
            <Button type="submit" disabled={!paperId || !reviewerId}>
              {t('reviews.assign')}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
