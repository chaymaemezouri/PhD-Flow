import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PaperWorkCard, type WorkPaper } from '@/components/paper-work-card';
import { Button } from '@/components/ui/button';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface PaperSummary extends WorkPaper {
  conferenceId: string;
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
  const papers = useQuery({ queryKey: ['papers'], queryFn: loadPapers });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl text-navy">{t('papers.title')}</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t('papers.intro')}
          </p>
        </div>
        <Button asChild>
          <Link to="/workspace/submissions/new">{t('papers.new')}</Link>
        </Button>
      </div>
      {papers.isPending ? <p>{t('common.loading')}</p> : null}
      {papers.data?.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('papers.empty')}</p>
      ) : null}
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {papers.data?.map((paper) => (
          <li key={paper.id}>
            <PaperWorkCard paper={paper} />
          </li>
        ))}
      </ul>
    </div>
  );
}
