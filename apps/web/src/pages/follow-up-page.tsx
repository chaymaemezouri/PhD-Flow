import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
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
  const [query, setQuery] = useState('');
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
  const needle = query.trim().toLowerCase();
  const visible = (view === 'published' ? published : ready).filter((item) => {
    if (!needle) {
      return true;
    }
    return [item.title, item.publicId ?? '', item.conferenceName ?? '']
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block text-xs font-extrabold uppercase tracking-[0.06em] text-[#8b909a]">
            {t('home.filterBoard')}
            <select
              value={view}
              onChange={(event) =>
                setView(event.target.value === 'published' ? 'published' : 'ready')
              }
              className="mt-1.5 block min-h-10 w-full min-w-[12rem] rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-[#1c2744]"
            >
              <option value="ready">
                {t('followUp.ready')} · {ready.length}
              </option>
              <option value="published">
                {t('followUp.published')} · {published.length}
              </option>
            </select>
          </label>
          <label className="relative block min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#8b909a]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('home.searchPapers')}
              className="w-full rounded-2xl border border-[#e4e7ee] bg-white py-2.5 pr-3 pl-9 text-sm font-semibold text-[#1c2744] outline-none"
            />
          </label>
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
