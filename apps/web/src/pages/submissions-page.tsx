import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { type WorkPaper } from '@/components/paper-work-card';
import { PapersLayoutToggle } from '@/components/papers-layout-toggle';
import { PapersLayoutView } from '@/components/papers-layout-view';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/use-account';
import { canStartSubmission } from '@/features/navigation/can-submit';
import {
  readPapersLayout,
  writePapersLayout,
  type PapersLayout,
} from '@/features/papers/papers-layout';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface PaperSummary extends WorkPaper {
  conferenceId: string;
  conferenceName?: string | null;
  doi?: string | null;
}

async function loadPapers(): Promise<PaperSummary[]> {
  const response = await apiFetch('/api/v1/papers');
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<PaperSummary[]>;
}

export function SubmissionsPage() {
  const { t } = useTranslation();
  const account = useCurrentUser();
  const [layout, setLayout] = useState<PapersLayout>(() => readPapersLayout());
  const papers = useQuery({ queryKey: ['papers'], queryFn: loadPapers });
  const memberships = useQuery({
    queryKey: ['conferences'],
    queryFn: async () => {
      const response = await apiFetch('/api/v1/conferences');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<{ role: string; membershipStatus: string }[]>;
    },
  });
  const canSubmit = canStartSubmission(
    account.data?.platformRole === 'SYSTEM_ADMIN',
    memberships.data,
  );
  const isManager = memberships.data?.some(
    (item) =>
      item.membershipStatus === 'ACTIVE' &&
      (item.role === 'CHAIR' ||
        item.role === 'ADMINISTRATOR' ||
        item.role === 'COMMITTEE'),
  );
  const isReviewerOnly =
    !isManager &&
    !canSubmit &&
    (memberships.data?.some(
      (item) => item.membershipStatus === 'ACTIVE' && item.role === 'REVIEWER',
    ) ??
      false);

  function chooseLayout(next: PapersLayout) {
    setLayout(next);
    writePapersLayout(next);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl">
            {isManager
              ? t('home.chairPapers')
              : isReviewerOnly
                ? t('reviews.title')
                : t('papers.title')}
          </h1>
          {isManager || isReviewerOnly ? (
            <p className="mt-2 max-w-2xl text-sm text-[#5c6578]">
              {isManager ? t('home.chairBoardHint') : t('home.reviewBoardHint')}
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
          <PapersLayoutToggle layout={layout} onChange={chooseLayout} />
          {canSubmit ? (
            <Button asChild className="w-full sm:w-auto">
              <Link to="/workspace/submissions/new">{t('papers.new')}</Link>
            </Button>
          ) : null}
        </div>
      </div>
      {papers.isPending ? <p>{t('common.loading')}</p> : null}
      {(() => {
        const visible = (papers.data ?? []).filter((paper) => {
          if (isManager || isReviewerOnly) {
            return true;
          }
          return !paper.doi;
        });
        if (!papers.isPending && visible.length === 0) {
          return <p className="text-sm text-muted-foreground">{t('papers.empty')}</p>;
        }
        return <PapersLayoutView layout={layout} papers={visible} />;
      })()}
    </div>
  );
}
