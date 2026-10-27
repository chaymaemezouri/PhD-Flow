import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { PaperFileThumb } from '@/components/paper-file-preview';
import { ReviewAssignmentForm } from '@/components/review-assignment-form';
import { StagePanel } from '@/components/stage-panel';
import { useCurrentUser } from '@/features/auth/use-account';
import { useFeedback } from '@/features/feedback/feedback';
import { loadMyReviews, reviewQueueMeta } from '@/features/reviews/review-queue';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface PaperDetail {
  id: string;
  manuscript: {
    originalName: string;
    contentType?: string | null;
    sizeBytes?: number | null;
  } | null;
}

function ManuscriptPreview({ paperId }: { paperId: string }) {
  const paper = useQuery({
    queryKey: ['paper', paperId],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/papers/${paperId}`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<PaperDetail>;
    },
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

export function ReviewDetailPage() {
  const { t } = useTranslation();
  const { assignmentId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const account = useCurrentUser();
  const memberships = useQuery({
    queryKey: ['conferences'],
    queryFn: async () => {
      const response = await apiFetch('/api/v1/conferences');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<
        { role: string; membershipStatus: string }[]
      >;
    },
  });
  const mine = useQuery({ queryKey: ['reviews'], queryFn: loadMyReviews });
  const item = mine.data?.find((row) => row.id === assignmentId);
  const isManager =
    account.data?.platformRole === 'SYSTEM_ADMIN' ||
    (memberships.data?.some(
      (item) =>
        item.membershipStatus === 'ACTIVE' &&
        (item.role === 'CHAIR' ||
          item.role === 'ADMINISTRATOR' ||
          item.role === 'COMMITTEE'),
    ) ??
      false);
  const inboxTo = isManager ? '/workspace/reviews' : '/workspace/reviewer';

  if (mine.isPending) {
    return <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>;
  }
  if (!item) {
    return <Navigate to={inboxTo} replace />;
  }

  const meta = reviewQueueMeta(item);
  const canOpen =
    item.status === 'ACCEPTED' ||
    item.status === 'IN_PROGRESS' ||
    item.status === 'OVERDUE' ||
    item.status === 'COMPLETED';
  const canReview =
    item.status === 'ACCEPTED' ||
    item.status === 'IN_PROGRESS' ||
    item.status === 'OVERDUE';
  const decisionBadge =
    item.decisionOutcome === 'CONDITIONALLY_ACCEPTED'
      ? t('reviews.decisionMinor')
      : item.decisionOutcome === 'REVISION_REQUIRED'
        ? t('reviews.decisionMajor')
        : null;

  async function respond(accept: boolean) {
    const response = await apiFetch(
      `/api/v1/assignments/${assignmentId}/${accept ? 'accept' : 'decline'}`,
      {
        method: 'POST',
        body: JSON.stringify(accept ? {} : { reason: '' }),
      },
    );
    if (!response.ok) {
      feedback.error(await apiErrorMessage(response));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['reviews'] });
    if (!accept) {
      navigate(inboxTo);
    }
  }

  async function submitReview(
    payload: {
      recommendation: string;
      score: number;
      confidence: number;
      commentsToAuthor: string;
      commentsToCommittee: string;
    },
  ) {
    const response = await apiFetch(`/api/v1/assignments/${assignmentId}/review`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      feedback.error(await apiErrorMessage(response));
      return;
    }
    feedback.success(t('reviews.sent'));
    await queryClient.invalidateQueries({ queryKey: ['reviews'] });
  }

  return (
    <div className="space-y-5">
      <Link
        to={inboxTo}
        className="inline-flex items-center gap-1.5 text-sm font-extrabold text-[#3d4fd4] no-underline"
      >
        <ArrowLeft className="size-4" />
        {t('reviews.backToInbox')}
      </Link>

      <header className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-extrabold tracking-wide text-[#8b909a]">
            {item.publicId ?? t('reviews.title')}
          </p>
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold ${meta.badge}`}
          >
            {item.needsRereview
              ? t('reviews.sectionRereview')
              : t(`reviews.statuses.${item.status}`, { defaultValue: item.status })}
          </span>
        </div>
        <h1 className="mt-2 text-xl font-extrabold leading-snug text-[#1c2744] sm:text-2xl">
          {item.paperTitle}
        </h1>
        <p className={`mt-2 text-sm font-semibold ${meta.hint}`}>
          {t(meta.nextKey, { defaultValue: item.status })}
        </p>
        <p className="mt-1 text-xs font-semibold text-[#8b909a]">
          {t('home.reviewDue', {
            date: new Date(item.expiresAt).toLocaleDateString(),
          })}
          {item.score !== null
            ? ` · ${t('home.reviewScore', { score: item.score })}`
            : ''}
        </p>
        {decisionBadge ? (
          <p className="mt-3 inline-flex rounded-full bg-[#fff4e8] px-2.5 py-1 text-xs font-extrabold text-[#c47a1a]">
            {decisionBadge}
          </p>
        ) : null}
        {item.awaitingAuthorRevision ? (
          <p className="mt-3 text-sm font-semibold text-[#5c6578]">
            {t('reviews.awaitingRevision')}
          </p>
        ) : null}
        {canOpen ? (
          <Link
            to={`/workspace/submissions/${item.paperId}`}
            className="mt-4 inline-flex min-h-10 items-center rounded-full bg-[#f4f7ff] px-4 text-sm font-extrabold text-[#3d4fd4] no-underline"
          >
            {t('reviews.openDossier')}
          </Link>
        ) : null}
      </header>

      {canOpen ? (
        <section className="space-y-2 rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-[#8b909a]">
            {t('reviews.openPaper')}
          </h2>
          <ManuscriptPreview paperId={item.paperId} />
        </section>
      ) : null}

      {item.revisionFile ? (
        <section className="space-y-2 rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5">
          <h2 className="text-xs font-extrabold uppercase tracking-wide text-[#8b909a]">
            {t('reviews.revisionFile')}
          </h2>
          <PaperFileThumb
            paperId={item.paperId}
            file={item.revisionFile}
            compact
            className="max-w-sm"
          />
        </section>
      ) : null}

      {item.score !== null ? (
        <StagePanel
          title={
            item.needsRereview ? t('reviews.previousReview') : t('reviews.sent')
          }
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
      ) : null}

      {item.needsRereview ? (
        <div className="space-y-2 rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5">
          <p className="text-sm font-semibold text-[#5c6578]">
            {t('reviews.rereviewHint')}
          </p>
          <ReviewAssignmentForm
            assignmentId={item.id}
            status={item.status}
            onSubmit={(payload) => void submitReview(payload)}
            compact
          />
        </div>
      ) : null}

      {!item.needsRereview && (canReview || item.status === 'INVITED') && item.score === null ? (
        <ReviewAssignmentForm
          assignmentId={item.id}
          status={item.status}
          onAccept={() => void respond(true)}
          onDecline={() => void respond(false)}
          onSubmit={(payload) => void submitReview(payload)}
        />
      ) : null}
    </div>
  );
}
