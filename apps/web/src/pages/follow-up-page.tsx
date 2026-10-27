import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { ConferenceWorkNav } from '@/components/conference-work-nav';
import { type PaperStep } from '@/components/step-bar';
import { pickConference } from '@/features/navigation/pick-conference';
import { isPublishedPaper, isReadyToPublish } from '@/features/papers/admin-board';
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
  scopeStatus?: string;
  assignmentCount?: number;
  steps?: PaperStep[];
}

async function loadPapers(): Promise<PaperSummary[]> {
  const response = await apiFetch('/api/v1/papers');
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<PaperSummary[]>;
}

async function loadConferencePapers(conferenceId: string): Promise<PaperSummary[]> {
  const response = await apiFetch(`/api/v1/conferences/${conferenceId}/papers`);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<PaperSummary[]>;
}

interface Membership {
  id: string;
  name: string;
  role: string;
  membershipStatus: string;
}

export function FollowUpPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const paperId = params.get('paper');
  const view = params.get('view') === 'published' ? 'published' : 'ready';
  const [layout, setLayout] = useState<PapersLayout>(() => readPapersLayout());
  const conferences = useQuery({
    queryKey: ['conferences'],
    queryFn: async () => {
      const response = await apiFetch('/api/v1/conferences');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<Membership[]>;
    },
  });
  const conference = pickConference(conferences.data, params.get('conference'));
  const papers = useQuery({
    queryKey: conference ? ['conference-papers', conference.id] : ['papers'],
    queryFn: () =>
      conference ? loadConferencePapers(conference.id) : loadPapers(),
  });

  const ready = useMemo(() => {
    const rows = papers.data ?? [];
    return rows.filter((item) =>
      paperId ? item.id === paperId && isReadyToPublish(item) : isReadyToPublish(item),
    );
  }, [paperId, papers.data]);
  const published = useMemo(() => {
    const rows = papers.data ?? [];
    return rows.filter((item) =>
      paperId ? item.id === paperId && isPublishedPaper(item) : isPublishedPaper(item),
    );
  }, [paperId, papers.data]);
  const visible = view === 'published' ? published : ready;

  function chooseLayout(next: PapersLayout) {
    setLayout(next);
    writePapersLayout(next);
  }

  function setView(next: 'ready' | 'published') {
    const nextParams = new URLSearchParams(params);
    if (next === 'ready') {
      nextParams.delete('view');
    } else {
      nextParams.set('view', next);
    }
    setParams(nextParams);
  }

  return (
    <div className="space-y-6">
      {conference ? (
        <ConferenceWorkNav
          conferenceId={conference.id}
          conferenceName={conference.name}
          role={conference.role}
          current="followUp"
        />
      ) : (
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-[#1c2744]">
            {t('followUp.title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#5c6578]">{t('followUp.intro')}</p>
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['ready', 'followUp.ready', ready.length],
              ['published', 'followUp.published', published.length],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={`rounded-full px-3 py-1.5 text-sm font-extrabold ${
                view === id ? 'bg-[#3d4fd4] text-white' : 'bg-[#f4f7ff] text-[#5c6578]'
              }`}
            >
              {t(label)} · {count}
            </button>
          ))}
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
        <div className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:rounded-[28px] sm:p-6">
          <p className="text-sm text-[#5c6578]">
            {view === 'published' ? t('followUp.publishedEmpty') : t('followUp.readyEmpty')}
          </p>
          <Link
            to={
              conference
                ? `/workspace/administrator?conference=${conference.id}`
                : '/workspace/administrator'
            }
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
