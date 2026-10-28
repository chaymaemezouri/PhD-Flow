import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, ChevronDown, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import {
  ConferenceTeamNav,
  ConferenceWorkNav,
} from '@/components/conference-work-nav';
import { EmptyState } from '@/components/empty-state';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/use-account';
import { useFeedback } from '@/features/feedback/feedback';
import { useBoardShortcuts } from '@/hooks/use-board-shortcuts';
import { pickConference } from '@/features/navigation/pick-conference';
import { apiErrorMessage, apiFetch } from '@/services/api';
import { cn } from '@/lib/utils';

interface Membership {
  id: string;
  name: string;
  shortName?: string;
  role: string;
  membershipStatus: string;
  status: string;
}

interface AssignPaper {
  id: string;
  title: string;
  publicId: string | null;
  status: string;
  scopeStatus?: string;
  assignmentCount?: number;
  trackName?: string | null;
}

interface ReviewerRow {
  userId: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  institution?: string | null;
}

type PaperFilter = 'all' | 'ready' | 'noReviewers' | 'notReady';

function canAssignPaper(paper: AssignPaper) {
  return paper.status === 'SUBMITTED' && paper.scopeStatus === 'ACCEPTED';
}

function conferenceLabel(item: Membership) {
  return item.shortName ? `${item.name} · ${item.shortName}` : item.name;
}

export function AssignmentBoardPage() {
  const { t } = useTranslation();
  const account = useCurrentUser();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [paperQuery, setPaperQuery] = useState('');
  const [reviewerQuery, setReviewerQuery] = useState('');
  const [paperFilter, setPaperFilter] = useState<PaperFilter>('ready');
  const [trackFilter, setTrackFilter] = useState('all');
  const [conferenceOpen, setConferenceOpen] = useState(false);
  const [conferenceSearch, setConferenceSearch] = useState('');
  const [selectedPapers, setSelectedPapers] = useState<Set<string>>(new Set());
  const [selectedReviewers, setSelectedReviewers] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const conferenceMenuRef = useRef<HTMLDivElement>(null);

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
  const active =
    conferences.data?.filter((item) => item.membershipStatus === 'ACTIVE') ?? [];
  const conference = pickConference(active, params.get('conference'));
  const platformAdmin = account.data?.platformRole === 'SYSTEM_ADMIN';
  const canManage =
    platformAdmin ||
    conference?.role === 'CHAIR' ||
    conference?.role === 'ADMINISTRATOR' ||
    conference?.role === 'COMMITTEE';

  const papers = useQuery({
    queryKey: ['conference-papers', conference?.id],
    enabled: Boolean(conference?.id && canManage),
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${conference!.id}/papers`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<AssignPaper[]>;
    },
  });

  const reviewers = useQuery({
    queryKey: ['reviewers', conference?.id],
    enabled: Boolean(conference?.id && canManage),
    queryFn: async () => {
      const response = await apiFetch(
        `/api/v1/conferences/${conference!.id}/reviewers`,
      );
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<ReviewerRow[]>;
    },
  });

  useEffect(() => {
    setSelectedPapers(new Set());
    setSelectedReviewers(new Set());
    setPaperQuery('');
    setReviewerQuery('');
    setPaperFilter('ready');
    setTrackFilter('all');
    setConferenceOpen(false);
    setConferenceSearch('');
  }, [conference?.id]);

  useEffect(() => {
    if (!conferenceOpen) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (
        conferenceMenuRef.current &&
        !conferenceMenuRef.current.contains(event.target as Node)
      ) {
        setConferenceOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [conferenceOpen]);

  const tracks = useMemo(() => {
    const names = new Set<string>();
    for (const paper of papers.data ?? []) {
      if (paper.trackName?.trim()) {
        names.add(paper.trackName.trim());
      }
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [papers.data]);

  const conferenceChoices = useMemo(() => {
    const needle = conferenceSearch.trim().toLowerCase();
    if (!needle) {
      return active;
    }
    return active.filter((item) =>
      `${item.name} ${item.shortName ?? ''}`.toLowerCase().includes(needle),
    );
  }, [active, conferenceSearch]);

  const filterCounts = useMemo(() => {
    const list = papers.data ?? [];
    return {
      all: list.length,
      ready: list.filter(canAssignPaper).length,
      noReviewers: list.filter(
        (paper) => canAssignPaper(paper) && (paper.assignmentCount ?? 0) === 0,
      ).length,
      notReady: list.filter((paper) => !canAssignPaper(paper)).length,
    };
  }, [papers.data]);

  const visiblePapers = useMemo(() => {
    const needle = paperQuery.trim().toLowerCase();
    return (papers.data ?? []).filter((paper) => {
      if (paperFilter === 'ready' && !canAssignPaper(paper)) {
        return false;
      }
      if (paperFilter === 'notReady' && canAssignPaper(paper)) {
        return false;
      }
      if (
        paperFilter === 'noReviewers' &&
        !(canAssignPaper(paper) && (paper.assignmentCount ?? 0) === 0)
      ) {
        return false;
      }
      if (trackFilter !== 'all' && (paper.trackName?.trim() ?? '') !== trackFilter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return `${paper.publicId ?? ''} ${paper.title} ${paper.trackName ?? ''}`
        .toLowerCase()
        .includes(needle);
    });
  }, [paperFilter, paperQuery, papers.data, trackFilter]);

  const visibleReviewers = useMemo(() => {
    const list = (reviewers.data ?? []).filter((item) => item.role === 'REVIEWER');
    const needle = reviewerQuery.trim().toLowerCase();
    if (!needle) {
      return list;
    }
    return list.filter((item) =>
      `${item.firstName} ${item.lastName} ${item.email} ${item.institution ?? ''}`
        .toLowerCase()
        .includes(needle),
    );
  }, [reviewerQuery, reviewers.data]);

  const invitePreview = selectedPapers.size * selectedReviewers.size;

  useEffect(() => {
    setFocusIndex(0);
  }, [conference?.id, paperFilter, paperQuery, trackFilter]);

  useBoardShortcuts({
    enabled: Boolean(canManage && conference),
    count: visiblePapers.length,
    index: focusIndex,
    onIndexChange: setFocusIndex,
    onEnter: () => {
      const paper = visiblePapers[focusIndex];
      if (paper && canAssignPaper(paper)) {
        togglePaper(paper.id, true);
      }
    },
    onPrevGroup: () => {
      if (active.length < 2 || !conference) {
        return;
      }
      const idx = active.findIndex((item) => item.id === conference.id);
      const prev = active[(idx - 1 + active.length) % active.length];
      if (prev) {
        setParams({ conference: prev.id });
      }
    },
    onNextGroup: () => {
      if (active.length < 2 || !conference) {
        return;
      }
      const idx = active.findIndex((item) => item.id === conference.id);
      const next = active[(idx + 1) % active.length];
      if (next) {
        setParams({ conference: next.id });
      }
    },
  });

  function pickConferenceId(id: string) {
    setParams({ conference: id });
    setConferenceOpen(false);
    setConferenceSearch('');
  }

  function togglePaper(id: string, enabled: boolean) {
    if (!enabled) {
      return;
    }
    setSelectedPapers((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleReviewer(id: string) {
    setSelectedReviewers((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAllAssignablePapers() {
    const ids = visiblePapers.filter(canAssignPaper).map((paper) => paper.id);
    setSelectedPapers(new Set(ids));
  }

  function selectAllReviewers() {
    setSelectedReviewers(new Set(visibleReviewers.map((item) => item.userId)));
  }

  async function assignSelected() {
    if (selectedPapers.size === 0 || selectedReviewers.size === 0) {
      feedback.error(t('assignments.needBoth'));
      return;
    }
    setPending(true);
    let ok = 0;
    let failed = 0;
    try {
      for (const paperId of selectedPapers) {
        for (const reviewerId of selectedReviewers) {
          const response = await apiFetch(`/api/v1/papers/${paperId}/assignments`, {
            method: 'POST',
            body: JSON.stringify({ reviewerId }),
          });
          if (response.ok) {
            ok += 1;
          } else {
            failed += 1;
          }
        }
      }
      if (ok > 0) {
        feedback.success(
          failed > 0
            ? t('assignments.doneWithSkipped', { ok, failed })
            : t('assignments.done', { ok }),
        );
        setSelectedPapers(new Set());
        setSelectedReviewers(new Set());
        await queryClient.invalidateQueries({ queryKey: ['conference-papers'] });
        await queryClient.invalidateQueries({ queryKey: ['papers'] });
        await queryClient.invalidateQueries({ queryKey: ['reviews'] });
      } else {
        feedback.error(t('assignments.allFailed'));
      }
    } finally {
      setPending(false);
    }
  }

  const canAssign =
    canManage &&
    selectedPapers.size > 0 &&
    selectedReviewers.size > 0 &&
    !pending;

  const paperFilters: { id: PaperFilter; label: string; count: number }[] = [
    { id: 'all', label: t('assignments.filterAll'), count: filterCounts.all },
    { id: 'ready', label: t('assignments.filterReady'), count: filterCounts.ready },
    {
      id: 'noReviewers',
      label: t('assignments.filterNoReviewers'),
      count: filterCounts.noReviewers,
    },
    {
      id: 'notReady',
      label: t('assignments.filterNotReady'),
      count: filterCounts.notReady,
    },
  ];

  return (
    <div className="space-y-5 pb-24 sm:pb-0">
      {conference && canManage ? (
        <div className="space-y-3">
          <ConferenceWorkNav
            conferenceId={conference.id}
            conferenceName={conference.name}
            role={conference.role}
            current="team"
          />
          <ConferenceTeamNav conferenceId={conference.id} current="assignments" />
          <p className="hidden text-xs font-semibold text-[#8b909a] sm:block">
            {t('assignments.shortcuts')}
          </p>
        </div>
      ) : (
        <header className="border-b border-[#e6e8ec] pb-4">
          <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl">
            {t('assignments.title')}
          </h1>
          <p className="mt-1 text-sm text-[#5c6578]">{t('assignments.intro')}</p>
        </header>
      )}

      {!canManage ? (
        <p className="rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm text-[#5c6578]">
          {t('assignments.manageOnly')}
        </p>
      ) : conferences.isPending ? (
        <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-[#8b909a]">{t('home.noConference')}</p>
      ) : !conference ? (
        <p className="text-sm text-[#8b909a]">{t('home.noConference')}</p>
      ) : (
        <>
          <section className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:items-end">
              <div className="relative min-w-0" ref={conferenceMenuRef}>
                <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[#8b909a]">
                  {t('assignments.conference')}
                </p>
                <button
                  type="button"
                  aria-expanded={conferenceOpen}
                  aria-haspopup="listbox"
                  onClick={() => setConferenceOpen((open) => !open)}
                  className="mt-1.5 flex min-h-11 w-full items-center justify-between gap-2 rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2 text-left text-sm font-semibold text-[#1c2744]"
                >
                  <span className="min-w-0 truncate">{conferenceLabel(conference)}</span>
                  <ChevronDown className="size-4 shrink-0 text-[#8b909a]" />
                </button>
                {conferenceOpen ? (
                  <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-2xl border border-[#e4e7ee] bg-white shadow-[0_12px_32px_rgba(28,39,68,0.12)]">
                    {active.length > 5 ? (
                      <label className="flex items-center gap-2 border-b border-[#e4e7ee] px-3 py-2">
                        <Search className="size-4 shrink-0 text-[#8b909a]" />
                        <span className="sr-only">{t('assignments.searchConferences')}</span>
                        <input
                          autoFocus
                          value={conferenceSearch}
                          onChange={(event) => setConferenceSearch(event.target.value)}
                          placeholder={t('assignments.searchConferences')}
                          className="w-full bg-transparent text-sm outline-none placeholder:text-[#a0a6b2]"
                        />
                      </label>
                    ) : null}
                    <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
                      {conferenceChoices.length === 0 ? (
                        <li className="px-3 py-2 text-sm text-[#8b909a]">
                          {t('assignments.noConferenceMatch')}
                        </li>
                      ) : (
                        conferenceChoices.map((item) => (
                          <li key={item.id} role="option" aria-selected={item.id === conference.id}>
                            <button
                              type="button"
                              onClick={() => pickConferenceId(item.id)}
                              className={`flex w-full flex-col gap-0.5 px-3 py-2.5 text-left ${
                                item.id === conference.id
                                  ? 'bg-[#eef2ff]'
                                  : 'hover:bg-[#f6f7fb]'
                              }`}
                            >
                              <span className="text-sm font-extrabold text-[#1c2744]">
                                {item.name}
                              </span>
                              {item.shortName ? (
                                <span className="text-xs font-semibold text-[#8b909a]">
                                  {item.shortName}
                                </span>
                              ) : null}
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <label className="block min-w-0 text-xs font-extrabold uppercase tracking-[0.08em] text-[#8b909a]">
                  {t('assignments.paperFilters')}
                  <select
                    value={paperFilter}
                    onChange={(event) => setPaperFilter(event.target.value as PaperFilter)}
                    className="mt-1.5 block min-h-11 w-full rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2 text-sm font-semibold normal-case tracking-normal text-[#1c2744] outline-none"
                  >
                    {paperFilters.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label} · {item.count}
                      </option>
                    ))}
                  </select>
                </label>
                {tracks.length > 0 ? (
                  <label className="block min-w-0 text-xs font-extrabold uppercase tracking-[0.08em] text-[#8b909a]">
                    {t('assignments.trackFilter')}
                    <select
                      value={trackFilter}
                      onChange={(event) => setTrackFilter(event.target.value)}
                      className="mt-1.5 block min-h-11 w-full rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2 text-sm font-semibold normal-case tracking-normal text-[#1c2744] outline-none"
                    >
                      <option value="all">{t('assignments.trackAll')}</option>
                      {tracks.map((track) => (
                        <option key={track} value={track}>
                          {track}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            </div>
            <p className="mt-4 text-sm text-[#5c6578]">{t('assignments.intro')}</p>
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-stretch">
            <section className="flex min-h-[28rem] flex-col rounded-2xl border border-[#e4e7ee] bg-white">
              <div className="border-b border-[#e4e7ee] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-extrabold text-[#1c2744]">
                    {t('assignments.papers')}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3">
                    {selectedPapers.size > 0 ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-extrabold text-[#8b909a]"
                        onClick={() => setSelectedPapers(new Set())}
                      >
                        <X className="size-3.5" />
                        {t('assignments.clearSelection')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-xs font-extrabold text-[#3d4fd4]"
                      onClick={selectAllAssignablePapers}
                    >
                      {t('assignments.selectAllAssignable')}
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-[#8b909a]">
                  {t('assignments.papersHint', { count: selectedPapers.size })}
                  {' · '}
                  {t('assignments.showingCount', { count: visiblePapers.length })}
                </p>
                <label className="mt-3 flex items-center gap-2 rounded-full border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2">
                  <Search className="size-4 shrink-0 text-[#8b909a]" />
                  <span className="sr-only">{t('assignments.searchPapers')}</span>
                  <input
                    value={paperQuery}
                    onChange={(event) => setPaperQuery(event.target.value)}
                    placeholder={t('assignments.searchPapers')}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-[#a0a6b2]"
                  />
                </label>
              </div>
              <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
                {papers.isPending ? (
                  <li className="px-2 py-3 text-sm text-[#8b909a]">{t('common.loading')}</li>
                ) : visiblePapers.length === 0 ? (
                  <li className="px-2 py-3">
                    <EmptyState
                      title={t('assignments.noPapers')}
                      body={t('assignments.noPapersHint')}
                      actionTo={
                        conference
                          ? `/workspace/administrator?conference=${conference.id}`
                          : '/workspace/administrator'
                      }
                      actionLabel={t('nav.home')}
                    />
                  </li>
                ) : (
                  visiblePapers.map((paper, index) => {
                    const enabled = canAssignPaper(paper);
                    const checked = selectedPapers.has(paper.id);
                    const focused = index === focusIndex;
                    return (
                      <li key={paper.id}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5',
                            checked
                              ? 'bg-[#eef2ff]'
                              : enabled
                                ? 'hover:bg-[#f6f7fb]'
                                : 'cursor-not-allowed opacity-55',
                            focused && 'ring-2 ring-[#3d4fd4]/35',
                          )}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            disabled={!enabled}
                            onChange={() => togglePaper(paper.id, enabled)}
                          />
                          <span className="min-w-0">
                            <span className="block text-xs font-bold text-[#8b909a]">
                              {paper.publicId ?? '—'}
                              {' · '}
                              {enabled
                                ? t('assignments.ready')
                                : t('assignments.notReady')}
                              {typeof paper.assignmentCount === 'number'
                                ? ` · ${t('assignments.reviewerCount', {
                                    count: paper.assignmentCount,
                                  })}`
                                : ''}
                            </span>
                            <span className="mt-0.5 block text-sm font-extrabold text-[#1c2744]">
                              {paper.title}
                            </span>
                            {paper.trackName ? (
                              <span className="mt-0.5 block text-xs font-semibold text-[#5c6578]">
                                {paper.trackName}
                              </span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>

            <div className="flex flex-col items-center justify-center gap-2 lg:px-1">
              <Button
                type="button"
                size="lg"
                disabled={!canAssign}
                onClick={() => void assignSelected()}
                className="min-h-12 gap-2 px-5"
                title={t('assignments.assignAction')}
              >
                <ArrowRight className="size-5" />
                <span className="hidden sm:inline">{t('assignments.assignAction')}</span>
              </Button>
              {invitePreview > 0 ? (
                <p className="max-w-[9rem] text-center text-[11px] font-semibold leading-snug text-[#8b909a]">
                  {t('assignments.invitePreview', { count: invitePreview })}
                </p>
              ) : null}
            </div>

            <section className="flex min-h-[28rem] flex-col rounded-2xl border border-[#e4e7ee] bg-white">
              <div className="border-b border-[#e4e7ee] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-extrabold text-[#1c2744]">
                    {t('assignments.reviewers')}
                  </h2>
                  <div className="flex flex-wrap items-center gap-3">
                    {selectedReviewers.size > 0 ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-extrabold text-[#8b909a]"
                        onClick={() => setSelectedReviewers(new Set())}
                      >
                        <X className="size-3.5" />
                        {t('assignments.clearSelection')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="text-xs font-extrabold text-[#3d4fd4]"
                      onClick={selectAllReviewers}
                    >
                      {t('assignments.selectAllReviewers')}
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-[#8b909a]">
                  {t('assignments.reviewersHint', { count: selectedReviewers.size })}
                  {' · '}
                  {t('assignments.showingCount', { count: visibleReviewers.length })}
                </p>
                <label className="mt-3 flex items-center gap-2 rounded-full border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2">
                  <Search className="size-4 shrink-0 text-[#8b909a]" />
                  <span className="sr-only">{t('assignments.searchReviewers')}</span>
                  <input
                    value={reviewerQuery}
                    onChange={(event) => setReviewerQuery(event.target.value)}
                    placeholder={t('assignments.searchReviewers')}
                    className="w-full bg-transparent text-sm outline-none placeholder:text-[#a0a6b2]"
                  />
                </label>
              </div>
              <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
                {reviewers.isPending ? (
                  <li className="px-2 py-3 text-sm text-[#8b909a]">{t('common.loading')}</li>
                ) : visibleReviewers.length === 0 ? (
                  <li className="px-2 py-3">
                    <EmptyState
                      title={t('assignments.noReviewers')}
                      body={t('assignments.noReviewersHint')}
                      actionTo={
                        conference
                          ? `/workspace/reviewers?conference=${conference.id}`
                          : '/workspace/reviewers'
                      }
                      actionLabel={t('assignments.openTeam')}
                    />
                  </li>
                ) : (
                  visibleReviewers.map((item) => {
                    const checked = selectedReviewers.has(item.userId);
                    const name = `${item.firstName} ${item.lastName}`.trim() || item.email;
                    return (
                      <li key={item.userId}>
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 ${
                            checked ? 'bg-[#eef2ff]' : 'hover:bg-[#f6f7fb]'
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1"
                            checked={checked}
                            onChange={() => toggleReviewer(item.userId)}
                          />
                          <span className="min-w-0">
                            <span className="block text-sm font-extrabold text-[#1c2744]">
                              {name}
                            </span>
                            <span className="mt-0.5 block text-xs font-semibold text-[#5c6578]">
                              {item.email}
                              {item.institution ? ` · ${item.institution}` : ''}
                            </span>
                          </span>
                        </label>
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#e4e7ee] bg-white/95 p-3 backdrop-blur sm:hidden">
            <Button
              type="button"
              size="lg"
              disabled={!canAssign}
              onClick={() => void assignSelected()}
              className="min-h-12 w-full gap-2"
            >
              <ArrowRight className="size-5" />
              {t('assignments.assignAction')}
              {invitePreview > 0 ? ` · ${invitePreview}` : ''}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
