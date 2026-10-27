import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AssignmentField } from '@/components/assignment-picker';
import { StagePanel } from '@/components/stage-panel';
import { Button } from '@/components/ui/button';
import { useFeedback } from '@/features/feedback/feedback';
import { apiErrorMessage, apiFetch } from '@/services/api';

type AssignMode = 'paper' | 'author' | 'reviewer';

interface AssignPaper {
  id: string;
  title: string;
  publicId: string | null;
  status: string;
  scopeStatus?: string;
  assignmentCount?: number;
  authors?: { firstName: string; lastName: string; email: string }[];
}

interface ReviewerRow {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
}

export function ChairAssignmentPanel({ conferenceId }: { conferenceId: string }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<AssignMode>('paper');
  const [paperId, setPaperId] = useState('');
  const [reviewerId, setReviewerId] = useState('');
  const [authorKey, setAuthorKey] = useState('');
  const feedback = useFeedback();
  const [pending, setPending] = useState(false);

  const papers = useQuery({
    queryKey: ['conference-papers', conferenceId],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${conferenceId}/papers`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<AssignPaper[]>;
    },
  });

  const reviewers = useQuery({
    queryKey: ['reviewers', conferenceId],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${conferenceId}/reviewers`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<ReviewerRow[]>;
    },
  });

  const assignable = useMemo(
    () =>
      (papers.data ?? []).filter(
        (paper) => paper.status === 'SUBMITTED' && paper.scopeStatus === 'ACCEPTED',
      ),
    [papers.data],
  );

  const authors = useMemo(() => {
    const map = new Map<string, string>();
    for (const paper of assignable) {
      for (const author of paper.authors ?? []) {
        const key = author.email.toLowerCase();
        if (!map.has(key)) {
          map.set(
            key,
            `${author.firstName} ${author.lastName} · ${author.email}`.trim(),
          );
        }
      }
    }
    return [...map.entries()].map(([email, label]) => ({ email, label }));
  }, [assignable]);

  const papersForMode = useMemo(() => {
    if (mode === 'author' && authorKey) {
      return assignable.filter((paper) =>
        (paper.authors ?? []).some(
          (author) => author.email.toLowerCase() === authorKey.toLowerCase(),
        ),
      );
    }
    return assignable;
  }, [assignable, authorKey, mode]);

  const waitingCount = assignable.filter(
    (paper) => (paper.assignmentCount ?? 0) === 0,
  ).length;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!paperId || !reviewerId) {
      return;
    }
    setPending(true);
    try {
      const response = await apiFetch(`/api/v1/papers/${paperId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({ reviewerId }),
      });
      if (!response.ok) {
        feedback.error(await apiErrorMessage(response));
        return;
      }
      feedback.success(t('reviews.assigned'));
      setPaperId('');
      setReviewerId('');
      await queryClient.invalidateQueries({ queryKey: ['conference-papers', conferenceId] });
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
      await queryClient.invalidateQueries({ queryKey: ['reviews'] });
    } finally {
      setPending(false);
    }
  }

  const modes: { id: AssignMode; label: string }[] = [
    { id: 'paper', label: t('reviews.assignByPaper') },
    { id: 'author', label: t('reviews.assignByAuthor') },
    { id: 'reviewer', label: t('reviews.assignByReviewer') },
  ];

  return (
    <StagePanel
      title={t('reviews.assignTitle')}
      hint={t('reviews.assignDashboardHint')}
      status={
        waitingCount > 0
          ? t('dossier.notAssigned') + ` · ${waitingCount}`
          : t('dossier.assigned')
      }
      statusTone={waitingCount > 0 ? 'wait' : 'ok'}
    >
      <div className="touch-scroll mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {modes.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={mode === item.id}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-extrabold ${
              mode === item.id
                ? 'bg-[#3d4fd4] text-white'
                : 'bg-[#f6f7fb] text-[#5c6578]'
            }`}
            onClick={() => {
              setMode(item.id);
              setPaperId('');
              setAuthorKey('');
              setReviewerId('');
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
        {mode === 'author' ? (
          <AssignmentField
            className="text-xs font-extrabold text-[#5c6578] sm:col-span-2"
            label={t('reviews.chooseAuthor')}
            title={t('reviews.chooseAuthor')}
            placeholder={t('reviews.chooseAuthor')}
            value={authorKey}
            onChange={(id) => {
              setAuthorKey(id);
              setPaperId('');
            }}
            options={authors.map((item) => ({
              id: item.email,
              title: item.label.split(' · ')[0] ?? item.label,
              subtitle: item.email,
            }))}
          />
        ) : null}

        {mode === 'reviewer' ? (
          <AssignmentField
            className="text-xs font-extrabold text-[#5c6578]"
            label={t('reviews.chooseReviewer')}
            title={t('reviews.chooseReviewer')}
            placeholder={t('reviews.chooseReviewer')}
            value={reviewerId}
            onChange={setReviewerId}
            options={(reviewers.data ?? []).map((item) => ({
              id: item.userId,
              title: `${item.firstName} ${item.lastName}`.trim(),
              subtitle: item.email,
            }))}
            filters={[
              { id: 'all', label: t('picker.all') },
            ]}
          />
        ) : null}

        <AssignmentField
          className={`text-xs font-extrabold text-[#5c6578] ${
            mode === 'author' ? 'sm:col-span-2' : ''
          }`}
          label={t('reviews.choosePaper')}
          title={t('reviews.choosePaper')}
          placeholder={t('reviews.choosePaper')}
          value={paperId}
          onChange={setPaperId}
          disabled={mode === 'author' && !authorKey}
          options={papersForMode.map((item) => ({
            id: item.id,
            title: item.title,
            subtitle: item.publicId ?? undefined,
            code: item.publicId?.replace(/\D/g, '').slice(-4),
            group: (item.assignmentCount ?? 0) > 0 ? 'busy' : 'waiting',
          }))}
          filters={[
            { id: 'all', label: t('picker.all') },
            { id: 'waiting', label: t('picker.waiting') },
            { id: 'busy', label: t('picker.busy') },
          ]}
        />

        {mode !== 'reviewer' ? (
          <AssignmentField
            className="text-xs font-extrabold text-[#5c6578]"
            label={t('reviews.chooseReviewer')}
            title={t('reviews.chooseReviewer')}
            placeholder={t('reviews.chooseReviewer')}
            value={reviewerId}
            onChange={setReviewerId}
            options={(reviewers.data ?? []).map((item) => ({
              id: item.userId,
              title: `${item.firstName} ${item.lastName}`.trim(),
              subtitle: item.email,
            }))}
          />
        ) : null}

        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending || !paperId || !reviewerId}>
            {t('reviews.assign')}
          </Button>
        </div>
      </form>
    </StagePanel>
  );
}
