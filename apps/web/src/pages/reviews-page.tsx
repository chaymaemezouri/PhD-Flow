import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl text-navy">{t('reviews.title')}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          {t('reviews.intro')}
        </p>
      </div>
      {message ? <p className="text-sm">{message}</p> : null}
      {mine.isPending ? <p>{t('common.loading')}</p> : null}
      {mine.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('reviews.empty')}</p>
      ) : null}
      <ul className="grid gap-3">
        {mine.data?.map((item) => (
          <li key={item.id}>
            <Card>
              <CardHeader>
                <CardTitle>{item.publicId ?? item.paperTitle}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="font-bold text-[#243044]">{item.paperTitle}</p>
                <p className="text-[#5c6573]">
                  {item.status}
                  {item.expiresAt
                    ? ` · ${new Date(item.expiresAt).toLocaleDateString()}`
                    : ''}
                </p>
                {item.status === 'ACCEPTED' ||
                item.status === 'IN_PROGRESS' ||
                item.status === 'OVERDUE' ? (
                  <Link
                    className="text-teal"
                    to={`/workspace/submissions/${item.paperId}`}
                  >
                    {t('reviews.openPaper')}
                  </Link>
                ) : null}
                {item.score !== null ? (
                  <p>
                    {t('reviews.score')}: {item.score}/10 · {item.recommendation}
                  </p>
                ) : null}
                {item.status === 'ACCEPTED' ||
                item.status === 'IN_PROGRESS' ||
                item.status === 'OVERDUE' ? (
                  <form
                    className="grid gap-2"
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
                        await queryClient.invalidateQueries({ queryKey: ['reviews'] });
                      });
                    }}
                  >
                    <select
                      name="recommendation"
                      className="rounded-2xl border px-3 py-2"
                      defaultValue="ACCEPT"
                      aria-label={t('reviews.recommendation')}
                    >
                      <option value="ACCEPT">ACCEPT</option>
                      <option value="WEAK_ACCEPT">WEAK_ACCEPT</option>
                      <option value="BORDERLINE">BORDERLINE</option>
                      <option value="WEAK_REJECT">WEAK_REJECT</option>
                      <option value="REJECT">REJECT</option>
                    </select>
                    <input
                      name="score"
                      type="number"
                      min={1}
                      max={10}
                      defaultValue={8}
                      className="rounded-2xl border px-3 py-2"
                      aria-label={t('reviews.score')}
                    />
                    <input
                      name="confidence"
                      type="number"
                      min={1}
                      max={5}
                      defaultValue={4}
                      className="rounded-2xl border px-3 py-2"
                      aria-label={t('reviews.confidence')}
                    />
                    <textarea
                      name="comments"
                      required
                      minLength={10}
                      className="min-h-24 rounded-2xl border px-3 py-2"
                      placeholder={t('reviews.comments')}
                      aria-label={t('reviews.comments')}
                    />
                    <textarea
                      name="committee"
                      className="min-h-16 rounded-2xl border px-3 py-2"
                      placeholder={t('reviews.committee')}
                      aria-label={t('reviews.committee')}
                    />
                    <Button type="submit">{t('reviews.send')}</Button>
                  </form>
                ) : null}
                {item.status === 'INVITED' ? (
                  <div className="flex gap-2">
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
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
      {managed.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('reviews.assignTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p className="text-muted-foreground">{t('reviews.assignIntro')}</p>
            <select
              className="rounded-md border border-border bg-card px-2 py-2"
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
            <select
              className="rounded-md border border-border bg-card px-2 py-2"
              value={paperId}
              onChange={(event) => setPaperId(event.target.value)}
            >
              <option value="">{t('reviews.choosePaper')}</option>
              {papers.data
                ?.filter((item) => item.status === 'SUBMITTED')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.publicId ?? item.title}
                  </option>
                ))}
            </select>
            <select
              className="rounded-md border border-border bg-card px-2 py-2"
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
            <div>
              <Button
                type="button"
                disabled={!paperId || !reviewerId}
                onClick={() => {
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
                {t('reviews.assign')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
