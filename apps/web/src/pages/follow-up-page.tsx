import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { type PaperStep } from '@/components/step-bar';
import { PapersLayoutToggle } from '@/components/papers-layout-toggle';
import { PapersLayoutView } from '@/components/papers-layout-view';
import { type WorkPaper } from '@/components/paper-work-card';
import {
  readPapersLayout,
  writePapersLayout,
  type PapersLayout,
} from '@/features/papers/papers-layout';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface PaperSummary extends WorkPaper {
  conferenceId: string;
  status: string;
  doi?: string | null;
  decision?: { outcome: string; status: string } | null;
  steps?: PaperStep[];
}

/** Publié = étape 9 « Final decision and publication » terminée (DOI attribué). */
function isPublished(paper: PaperSummary): boolean {
  if (paper.status === 'DRAFT' || paper.status === 'WITHDRAWN') {
    return false;
  }
  return Boolean(paper.doi);
}

async function loadPapers(): Promise<PaperSummary[]> {
  const response = await apiFetch('/api/v1/papers');
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<PaperSummary[]>;
}

export function FollowUpPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const paperId = params.get('paper');
  const [layout, setLayout] = useState<PapersLayout>(() => readPapersLayout());
  const papers = useQuery({ queryKey: ['papers'], queryFn: loadPapers });

  const visible = useMemo(() => {
    const rows = papers.data ?? [];
    if (paperId) {
      return rows.filter((item) => item.id === paperId && isPublished(item));
    }
    return rows.filter(isPublished);
  }, [paperId, papers.data]);

  function chooseLayout(next: PapersLayout) {
    setLayout(next);
    writePapersLayout(next);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-[#1c2744]">
            {t('followUp.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#5c6578]">{t('followUp.intro')}</p>
        </div>
        <PapersLayoutToggle
          layout={layout}
          onChange={chooseLayout}
          labelKey="followUp.layoutLabel"
        />
      </div>
      {papers.isPending ? (
        <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
      ) : null}
      {!papers.isPending && visible.length === 0 ? (
        <div className="rounded-[28px] border border-[#e4e7ee] bg-white p-6">
          <p className="text-sm text-[#5c6578]">{t('followUp.empty')}</p>
          <Link
            to="/workspace/submissions"
            className="mt-3 inline-flex text-sm font-extrabold text-[#3d4fd4] no-underline"
          >
            {t('followUp.openSubmissions')}
          </Link>
        </div>
      ) : null}
      <PapersLayoutView layout={layout} papers={visible} />
    </div>
  );
}
