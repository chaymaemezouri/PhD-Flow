import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { paperWorkMeta, type WorkPaper } from '@/components/paper-work-card';
import { PapersLayoutToggle } from '@/components/papers-layout-toggle';
import { PapersLayoutView } from '@/components/papers-layout-view';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/use-account';
import { canStartSubmission } from '@/features/navigation/can-submit';
import {
  readSubmissionsLayout,
  writeSubmissionsLayout,
  type PapersLayout,
} from '@/features/papers/papers-layout';
import { apiErrorMessage, apiFetch } from '@/services/api';

type SubmissionsFilter = 'submissions' | 'waiting' | 'blocked' | 'complete';

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
  const [layout, setLayout] = useState<PapersLayout>(() => readSubmissionsLayout());
  const [filter, setFilter] = useState<SubmissionsFilter>('submissions');
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
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
    account.data?.profile?.academicTitle,
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

  const papers = useQuery({ queryKey: ['papers'], queryFn: loadPapers });

  function chooseLayout(next: PapersLayout) {
    setLayout(next);
    writeSubmissionsLayout(next);
  }

  const rows = useMemo(() => papers.data ?? [], [papers.data]);

  const searched = useMemo(() => {
    if (needle.length === 0) {
      return rows;
    }
    return rows.filter((paper) =>
      [paper.title, paper.publicId ?? '', paper.conferenceName ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [needle, rows]);

  const visible = useMemo(() => {
    if (filter === 'submissions') {
      return searched;
    }
    return searched.filter((paper) => {
      const tone = paperWorkMeta(paper, t).tone;
      if (filter === 'waiting') {
        return tone === 'wait';
      }
      if (filter === 'blocked') {
        return tone === 'alert';
      }
      return tone === 'done';
    });
  }, [filter, searched, t]);

  const waitingCount = rows.filter(
    (paper) => paperWorkMeta(paper, t).tone === 'wait',
  ).length;
  const blockedCount = rows.filter(
    (paper) => paperWorkMeta(paper, t).tone === 'alert',
  ).length;
  const completeCount = rows.filter(
    (paper) => paperWorkMeta(paper, t).tone === 'done',
  ).length;

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
      <label className="flex items-center gap-2 rounded-2xl border border-[#e4e7ee] bg-white px-4 py-2.5">
        <Search className="size-4 shrink-0 text-[#8b909a]" />
        <span className="sr-only">{t('papers.searchPlaceholder')}</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('papers.searchPlaceholder')}
          className="w-full bg-transparent text-sm outline-none placeholder:text-[#a0a6b2]"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['submissions', 'papers.title', rows.length],
            ['waiting', 'home.boardWaiting', waitingCount],
            ['blocked', 'home.boardBlocked', blockedCount],
            ['complete', 'home.boardClear', completeCount],
          ] as const
        ).map(([id, label, count]) => {
          const active = filter === id;
          const tone =
            id === 'blocked'
              ? 'bg-[#e35d5d]/15 text-[#c54545]'
              : id === 'waiting'
                ? 'bg-[#f0a04b]/20 text-[#9a6410]'
                : id === 'complete'
                  ? 'bg-[#2fbf71]/15 text-[#1c9a57]'
                  : 'bg-[#5d74ff]/15 text-[#3d4fd4]';
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => setFilter(id)}
              className={`rounded-full px-3 py-1.5 text-sm font-extrabold ${
                active ? tone : 'bg-[#f4f7ff] text-[#5c6578]'
              }`}
            >
              {t(label)}
              <span className="ml-1.5 tabular-nums opacity-80">{count}</span>
            </button>
          );
        })}
      </div>
      {papers.isPending ? <p>{t('common.loading')}</p> : null}
      {!papers.isPending && visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {rows.length === 0 ? t('papers.empty') : t('papers.noneMatch')}
        </p>
      ) : (
        <PapersLayoutView layout={layout} papers={visible} />
      )}
    </div>
  );
}
