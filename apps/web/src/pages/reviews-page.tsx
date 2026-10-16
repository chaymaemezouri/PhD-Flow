import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { PaperFileThumb } from '@/components/paper-file-preview';
import { ReviewAssignmentForm } from '@/components/review-assignment-form';
import { StagePanel, stageField } from '@/components/stage-panel';
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

interface PaperDetail {
  id: string;
  manuscript: {
    originalName: string;
    contentType?: string | null;
    sizeBytes?: number | null;
  } | null;
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

function ManuscriptPreview({ paperId }: { paperId: string }) {
  const paper = useQuery({
    queryKey: ['paper', paperId],
    queryFn: () => loadJson<PaperDetail>(`/api/v1/papers/${paperId}`),
  });
  if (!paper.data?.manuscript) {
    return null;
  }
  return (
    <PaperFileThumb
      paperId={paperId}
      file={{
        kind: 'MANUSCRIPT',
        originalName: paper.data.manuscript.originalName,
        contentType: paper.data.manuscript.contentType ?? 'application/pdf',
        sizeBytes: paper.data.manuscript.sizeBytes,
      }}
      compact
      className="max-w-sm"
    />
  );
}

export function ReviewsPage() {
  const { t } = useTranslation();
  const location = useLocation();
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

  useEffect(() => {
    const id = location.hash.replace(/^#/, '');
    if (!id) {
      return;
    }
    const node = document.getElementById(`review-${id}`);
    node?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash, mine.data]);

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

  async function submitReview(
    id: string,
    payload: {
      recommendation: string;
      score: number;
      confidence: number;
      commentsToAuthor: string;
      commentsToCommittee: string;
    },
  ) {
    setMessage(null);
    const response = await apiFetch(`/api/v1/assignments/${id}/review`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      setMessage(await apiErrorMessage(response));
      return;
    }
    setMessage(t('reviews.sent'));
    await queryClient.invalidateQueries({ queryKey: ['reviews'] });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl lg:text-3xl">
          {t('reviews.title')}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5c6578]">
          {t('reviews.intro')}
        </p>
      </div>
      {message ? (
        <p className="rounded-2xl bg-[#2fbf71]/12 px-4 py-3 text-sm font-extrabold text-[#1c9a57]">
          {message}
        </p>
      ) : null}
      {mine.isPending ? <p>{t('common.loading')}</p> : null}
      {mine.data?.length === 0 ? (
        <p className="rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm text-[#5c6578]">
          {t('reviews.empty')}
        </p>
      ) : null}
      <ul className="grid gap-4">
        {mine.data?.map((item) => {
          const canOpen =
            item.status === 'ACCEPTED' ||
            item.status === 'IN_PROGRESS' ||
            item.status === 'OVERDUE' ||
            item.status === 'COMPLETED';
          return (
            <li
              key={item.id}
              id={`review-${item.id}`}
              className="space-y-3 rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
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
                </div>
                {canOpen ? (
                  <Link
                    to={`/workspace/submissions/${item.paperId}`}
                    className="inline-flex min-h-10 items-center rounded-full bg-[#3d4fd4] px-4 text-sm font-extrabold text-white no-underline"
                  >
                    {t('reviews.openPaper')}
                  </Link>
                ) : null}
              </div>

              {canOpen ? <ManuscriptPreview paperId={item.paperId} /> : null}

              {item.score !== null ? (
                <StagePanel
                  title={t('reviews.sent')}
                  status={`${item.score}/10`}
                  statusTone="ok"
                >
                  <p className="text-sm font-semibold text-[#5c6578]">
                    {t(`reviews.recommendations.${item.recommendation ?? ''}`, {
                      defaultValue: item.recommendation ?? '',
                    })}
                  </p>
                  {item.commentsToAuthor ? (
                    <p className="mt-2 text-sm leading-relaxed text-[#5c6578]">
                      {item.commentsToAuthor}
                    </p>
                  ) : null}
                </StagePanel>
              ) : (
                <ReviewAssignmentForm
                  assignmentId={item.id}
                  status={item.status}
                  onAccept={() => void respond(item.id, true)}
                  onDecline={() => void respond(item.id, false)}
                  onSubmit={(payload) => void submitReview(item.id, payload)}
                />
              )}
            </li>
          );
        })}
      </ul>

      {managed.length > 0 ? (
        <StagePanel
          title={t('reviews.assignTitle')}
          hint={t('reviews.assignIntro')}
          status={t('dossier.assigned')}
          statusTone="neutral"
        >
          <form
            className="grid gap-3 sm:grid-cols-2"
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
            <label className="text-xs font-extrabold text-[#5c6578] sm:col-span-2">
              {t('reviews.chooseConference')}
              <select
                className={stageField}
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
            <label className="text-xs font-extrabold text-[#5c6578]">
              {t('reviews.choosePaper')}
              <select
                className={stageField}
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
            <label className="text-xs font-extrabold text-[#5c6578]">
              {t('reviews.chooseReviewer')}
              <select
                className={stageField}
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
            <div className="sm:col-span-2">
              <Button type="submit" disabled={!paperId || !reviewerId}>
                {t('reviews.assign')}
              </Button>
            </div>
          </form>
        </StagePanel>
      ) : null}
    </div>
  );
}
