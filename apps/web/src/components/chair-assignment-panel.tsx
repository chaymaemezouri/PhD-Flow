import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { StagePanel, stageField } from '@/components/stage-panel';
import { Button } from '@/components/ui/button';
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
  const [message, setMessage] = useState<string | null>(null);
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
    setMessage(null);
    try {
      const response = await apiFetch(`/api/v1/papers/${paperId}/assignments`, {
        method: 'POST',
        body: JSON.stringify({ reviewerId }),
      });
      if (!response.ok) {
        setMessage(await apiErrorMessage(response));
        return;
      }
      setMessage(t('reviews.assigned'));
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
              setMessage(null);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
        {mode === 'author' ? (
          <label className="text-xs font-extrabold text-[#5c6578] sm:col-span-2">
            {t('reviews.chooseAuthor')}
            <select
              className={stageField}
              value={authorKey}
              onChange={(event) => {
                setAuthorKey(event.target.value);
                setPaperId('');
              }}
            >
              <option value="">{t('reviews.chooseAuthor')}</option>
              {authors.map((item) => (
                <option key={item.email} value={item.email}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {mode === 'reviewer' ? (
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
        ) : null}

        <label
          className={`text-xs font-extrabold text-[#5c6578] ${
            mode === 'author' ? 'sm:col-span-2' : ''
          }`}
        >
          {t('reviews.choosePaper')}
          <select
            className={stageField}
            value={paperId}
            onChange={(event) => setPaperId(event.target.value)}
            disabled={mode === 'author' && !authorKey}
          >
            <option value="">{t('reviews.choosePaper')}</option>
            {papersForMode.map((item) => (
              <option key={item.id} value={item.id}>
                {(item.assignmentCount ?? 0) > 0
                  ? `✓ ${item.publicId ?? item.title}`
                  : item.publicId
                    ? `${item.publicId} · ${item.title}`
                    : item.title}
              </option>
            ))}
          </select>
        </label>

        {mode !== 'reviewer' ? (
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
        ) : null}

        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending || !paperId || !reviewerId}>
            {t('reviews.assign')}
          </Button>
        </div>
      </form>
      {message ? (
        <p className="mt-3 text-sm font-bold text-[#3d4fd4]" role="status">
          {message}
        </p>
      ) : null}
    </StagePanel>
  );
}
