import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import type { PaperDossier } from '@/components/paper-workflow';
import { RegistrationPaymentPanel } from '@/components/registration-payment-panel';
import { Button } from '@/components/ui/button';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface PaperRow {
  id: string;
  title: string;
  publicId: string | null;
  conferenceId: string;
  conferenceName?: string | null;
  createdById?: string | null;
  status: string;
  decision: { outcome: string; status: string } | null;
}

interface PaperDetail extends PaperRow {
  dossier: PaperDossier;
}

function isAccepted(paper: PaperRow): boolean {
  return (
    paper.status === 'SUBMITTED' &&
    paper.decision?.status === 'PUBLISHED' &&
    paper.decision.outcome === 'ACCEPTED'
  );
}

async function loadPapers(): Promise<PaperRow[]> {
  const response = await apiFetch('/api/v1/papers');
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<PaperRow[]>;
}

async function loadPaper(id: string): Promise<PaperDetail> {
  const response = await apiFetch(`/api/v1/papers/${id}`);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<PaperDetail>;
}

export function RegistrationPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('paper');
  const [message, setMessage] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const papers = useQuery({ queryKey: ['papers'], queryFn: loadPapers });
  const accepted = useMemo(
    () => (papers.data ?? []).filter(isAccepted),
    [papers.data],
  );
  const activeId = selectedId && accepted.some((item) => item.id === selectedId)
    ? selectedId
    : (accepted[0]?.id ?? null);
  const detail = useQuery({
    queryKey: ['paper', activeId],
    enabled: Boolean(activeId),
    queryFn: () => loadPaper(activeId!),
  });

  function selectPaper(id: string) {
    setMessage(null);
    setParams({ paper: id });
  }

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['papers'] }),
      activeId
        ? queryClient.invalidateQueries({ queryKey: ['paper', activeId] })
        : Promise.resolve(),
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl">
          {t('registrationPage.title')}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[#5c6578]">
          {t('registrationPage.intro')}
        </p>
      </div>

      {papers.isPending ? (
        <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
      ) : null}

      {!papers.isPending && accepted.length === 0 ? (
        <div className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:rounded-[28px] sm:p-6">
          <p className="text-sm text-[#5c6578]">{t('registrationPage.empty')}</p>
          <Link
            to="/workspace/submissions"
            className="mt-3 inline-flex text-sm font-extrabold text-[#3d4fd4] no-underline"
          >
            {t('registrationPage.openSubmissions')}
          </Link>
        </div>
      ) : null}

      {accepted.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <aside className="space-y-2">
            {accepted.map((paper) => {
              const active = paper.id === activeId;
              return (
                <button
                  key={paper.id}
                  type="button"
                  onClick={() => selectPaper(paper.id)}
                  className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                    active
                      ? 'border-[#5d74ff]/40 bg-[#5d74ff]/10'
                      : 'border-[#e4e7ee] bg-white hover:bg-[#f6f7fb]'
                  }`}
                >
                  <p className="text-sm font-extrabold text-[#1c2744]">{paper.title}</p>
                  <p className="mt-1 text-xs font-semibold text-[#5c6578]">
                    {paper.publicId ?? paper.conferenceName ?? '—'}
                  </p>
                  <p className="mt-1 text-xs font-extrabold text-[#3d4fd4]">
                    {t('dossier.openForRegistration')}
                  </p>
                </button>
              );
            })}
          </aside>

          <section className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:rounded-[28px] sm:p-6">
            {detail.isPending ? (
              <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
            ) : null}
            {detail.isError ? (
              <p className="text-sm text-[#b42318]">{detail.error.message}</p>
            ) : null}
            {detail.data?.dossier ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-extrabold text-[#1c2744]">
                      {detail.data.title}
                    </h2>
                    <p className="mt-1 text-sm text-[#5c6578]">
                      {detail.data.publicId}
                      {detail.data.conferenceName
                        ? ` · ${detail.data.conferenceName}`
                        : ''}
                    </p>
                  </div>
                  <Button asChild variant="outline">
                    <Link
                      to={`/workspace/submissions/${detail.data.id}`}
                      className="no-underline"
                    >
                      {t('registrationPage.openPaper')}
                    </Link>
                  </Button>
                </div>
                {message ? (
                  <p className="mt-3 text-sm font-semibold text-[#b42318]">{message}</p>
                ) : null}
                <RegistrationPaymentPanel
                  paperId={detail.data.id}
                  conferenceId={detail.data.conferenceId}
                  createdById={detail.data.createdById}
                  dossier={detail.data.dossier}
                  onChanged={refresh}
                  onError={setMessage}
                />
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
