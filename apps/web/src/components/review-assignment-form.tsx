import { useTranslation } from 'react-i18next';
import { StagePanel, stageField } from '@/components/stage-panel';
import { Button } from '@/components/ui/button';

const RECOMMENDATIONS = [
  'ACCEPT',
  'WEAK_ACCEPT',
  'BORDERLINE',
  'WEAK_REJECT',
  'REJECT',
] as const;

export function ReviewAssignmentForm({
  assignmentId,
  status,
  onSubmit,
  onAccept,
  onDecline,
  compact = false,
}: {
  assignmentId: string;
  status: string;
  onSubmit: (payload: {
    recommendation: string;
    score: number;
    confidence: number;
    commentsToAuthor: string;
    commentsToCommittee: string;
  }) => void | Promise<void>;
  onAccept?: () => void | Promise<void>;
  onDecline?: () => void | Promise<void>;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const invited = status === 'INVITED';
  const canReview =
    status === 'ACCEPTED' || status === 'IN_PROGRESS' || status === 'OVERDUE';

  return (
    <StagePanel
      title={t('dossier.myReview')}
      hint={t('dossier.myReviewHint')}
      status={
        invited
          ? t('home.toAccept')
          : status === 'COMPLETED'
            ? t('reviews.statuses.COMPLETED')
            : t('home.inProgress')
      }
      statusTone={
        invited ? 'wait' : status === 'COMPLETED' ? 'ok' : status === 'OVERDUE' ? 'missing' : 'ok'
      }
    >
      {invited ? (
        <div className="flex flex-wrap gap-2">
          {onAccept ? (
            <Button type="button" onClick={() => void onAccept()}>
              {t('reviews.accept')}
            </Button>
          ) : null}
          {onDecline ? (
            <Button type="button" variant="outline" className="border-[#c5cad6]" onClick={() => void onDecline()}>
              {t('reviews.decline')}
            </Button>
          ) : null}
        </div>
      ) : null}
      {canReview ? (
        <form
          className={compact ? 'grid gap-3' : 'grid gap-3 sm:grid-cols-2'}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void onSubmit({
              recommendation: String(data.get('recommendation')),
              score: Number(data.get('score')),
              confidence: Number(data.get('confidence')),
              commentsToAuthor: String(data.get('comments')),
              commentsToCommittee: String(data.get('committee') ?? ''),
            });
          }}
        >
          <label className={`text-xs font-extrabold text-[#5c6578] ${compact ? '' : 'sm:col-span-2'}`}>
            {t('reviews.recommendation')}
            <select name="recommendation" className={stageField} defaultValue="ACCEPT">
              {RECOMMENDATIONS.map((value) => (
                <option key={value} value={value}>
                  {t(`reviews.recommendations.${value}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-extrabold text-[#5c6578]">
            {t('reviews.score')}
            <input
              name="score"
              type="number"
              min={1}
              max={10}
              defaultValue={8}
              required
              className={stageField}
            />
          </label>
          <label className="text-xs font-extrabold text-[#5c6578]">
            {t('reviews.confidence')}
            <input
              name="confidence"
              type="number"
              min={1}
              max={5}
              defaultValue={4}
              required
              className={stageField}
            />
          </label>
          <label className={`text-xs font-extrabold text-[#5c6578] ${compact ? '' : 'sm:col-span-2'}`}>
            {t('reviews.comments')}
            <textarea
              name="comments"
              required
              minLength={10}
              className={`${stageField} min-h-24`}
            />
          </label>
          <label className={`text-xs font-extrabold text-[#5c6578] ${compact ? '' : 'sm:col-span-2'}`}>
            {t('reviews.committee')}
            <textarea name="committee" className={`${stageField} min-h-16`} />
          </label>
          <div className={compact ? '' : 'sm:col-span-2'}>
            <Button type="submit">{t('reviews.send')}</Button>
            <input type="hidden" name="assignmentId" value={assignmentId} />
          </div>
        </form>
      ) : null}
    </StagePanel>
  );
}
