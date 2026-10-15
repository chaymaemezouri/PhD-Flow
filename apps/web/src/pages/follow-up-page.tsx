import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import type { PaperStep } from '@/components/step-bar';
import { Button } from '@/components/ui/button';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface PaperSummary {
  id: string;
  title: string;
  publicId: string | null;
  status: string;
  steps?: PaperStep[];
}

interface FollowUp {
  conferenceId: string;
  canManage: boolean;
  title: string;
  publicId: string | null;
  decision: { outcome: string; letter: string; status: string } | null;
  similarity: { percentage: number; satisfied: boolean; verified: boolean } | null;
  copyright: string | null;
  versions: { id: string; kind: string; createdAt: string }[];
  checklist: {
    accepted: boolean;
    cameraReady: boolean;
    similarityOk: boolean;
    copyrightOk: boolean;
    ready: boolean;
  };
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
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const papers = useQuery({ queryKey: ['papers'], queryFn: loadPapers });
  const requested = params.get('paper');
  const selected =
    papers.data?.find((paper) => paper.id === requested) ??
    papers.data?.find((paper) => paper.status === 'SUBMITTED') ??
    papers.data?.[0];
  const detail = useQuery({
    queryKey: ['follow-up', selected?.id],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/papers/${selected!.id}/follow-up`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<FollowUp>;
    },
    enabled: Boolean(selected?.id),
  });

  async function sendFile(path: string, file: File) {
    const body = new FormData();
    body.set('file', file);
    const response = await apiFetch(path, { method: 'POST', body });
    if (!response.ok) {
      setMessage(await apiErrorMessage(response));
      return;
    }
    setMessage(t('workflow.saved'));
    await queryClient.invalidateQueries({ queryKey: ['follow-up'] });
    await queryClient.invalidateQueries({ queryKey: ['papers'] });
  }

  const checklist = detail.data?.checklist;
  const field = 'mt-1 block w-full rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2 text-sm outline-none';
  const outcomes: Record<string, string> = {
    ACCEPTED: t('workflow.outcomeAccepted'),
    CONDITIONALLY_ACCEPTED: t('workflow.outcomeConditional'),
    REVISION_REQUIRED: t('workflow.outcomeRevision'),
    REJECTED: t('workflow.outcomeRejected'),
  };
  const template = useQuery({
    queryKey: ['copyright-template', detail.data?.conferenceId],
    queryFn: async () => {
      const response = await apiFetch(
        `/api/v1/conferences/${detail.data!.conferenceId}/copyright-template`,
      );
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<{ subject: string; body: string }>;
    },
    enabled: Boolean(detail.data?.conferenceId),
  });

  const similarityText = detail.data?.similarity
    ? detail.data.similarity.percentage >= 20
      ? t('workflow.notSatisfied')
      : detail.data.similarity.verified
        ? t('workflow.underThreshold')
        : t('home.actions.similarity.pending')
    : null;
  const copyrightText =
    detail.data?.copyright === 'VALIDATED'
      ? t('workflow.stepDone')
      : detail.data?.copyright === 'REJECTED'
        ? t('workflow.stepFailed')
        : detail.data?.copyright
          ? t('workflow.stepPending')
          : '—';
  const tiles: { label: string; ok: boolean; value: string; hint?: string | null }[] = checklist
    ? [
        { label: t('workflow.accepted'), ok: checklist.accepted, value: checklist.accepted ? t('workflow.stepDone') : t('workflow.stepPending') },
        { label: t('workflow.camera'), ok: checklist.cameraReady, value: checklist.cameraReady ? t('workflow.stepDone') : t('workflow.stepPending') },
        {
          label: t('workflow.similarity'),
          ok: Boolean(detail.data?.similarity?.satisfied),
          value: detail.data?.similarity ? `${detail.data.similarity.percentage} %` : '—',
          hint: similarityText,
        },
        {
          label: t('workflow.steps.copyright'),
          ok: detail.data?.copyright === 'VALIDATED',
          value: copyrightText,
        },
        { label: t('workflow.ready'), ok: checklist.ready, value: checklist.ready ? t('workflow.stepDone') : t('workflow.stepPending') },
      ]
    : [];
  const hasKind = (kind: string) => detail.data?.versions.some((version) => version.kind === kind) ?? false;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl">{t('workflow.followTitle')}</h1>
      {message ? (
        <p className="w-fit rounded-full bg-[#5d74ff]/12 px-3 py-1 text-sm font-extrabold text-[#3d4fd4]" role="status">
          {message}
        </p>
      ) : null}
      {papers.data && papers.data.length > 1 ? (
        <label className="block max-w-xl text-sm font-extrabold">
          {t('workflow.choosePaper')}
          <select
            className={field}
            value={selected?.id ?? ''}
            onChange={(event) => setParams({ paper: event.target.value })}
          >
            {papers.data.map((paper) => (
              <option key={paper.id} value={paper.id}>
                {paper.publicId ? `${paper.publicId} · ${paper.title}` : paper.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {detail.data ? (
        <>
          <section className="rounded-2xl border border-[#e4e7ee] bg-white p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl">{detail.data.title}</h2>
              {detail.data.publicId ? (
                <span className="rounded-full bg-[#5d74ff]/12 px-3 py-1 text-xs font-extrabold text-[#3d4fd4]">
                  {detail.data.publicId}
                </span>
              ) : null}
            </div>
            {detail.data.decision ? (
              <div className="mt-3">
                <span className="rounded-full bg-[#2fbf71]/14 px-3 py-1 text-xs font-extrabold text-[#1c9a57]">
                  {outcomes[detail.data.decision.outcome] ?? detail.data.decision.outcome}
                </span>
                <p className="mt-3 text-sm leading-relaxed text-[#5c6578]">{detail.data.decision.letter}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#8b909a]">{t('workflow.noDecision')}</p>
            )}
          </section>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {tiles.map((tile) => (
              <li
                key={tile.label}
                className={`rounded-2xl px-4 py-4 ${tile.ok ? 'bg-[#2fbf71]/14 text-[#1c9a57]' : 'bg-[#f0a04b]/16 text-[#9a6410]'}`}
              >
                <p className="text-sm font-extrabold opacity-90">{tile.label}</p>
                <p className="mt-1 text-xl font-extrabold">{tile.value}</p>
                {tile.hint ? <p className="mt-1 text-xs font-bold">{tile.hint}</p> : null}
              </li>
            ))}
          </ul>
          {detail.data.canManage && !detail.data.decision && selected ? (
            <form
              className="grid gap-3 rounded-2xl border border-[#e4e7ee] bg-white p-5"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void apiFetch(`/api/v1/papers/${selected.id}/decision`, {
                  method: 'POST',
                  body: JSON.stringify({
                    outcome: String(data.get('outcome')),
                    letter: String(data.get('letter')),
                    publish: data.get('publish') === 'on',
                  }),
                }).then(async (response) => {
                  setMessage(response.ok ? t('workflow.saved') : await apiErrorMessage(response));
                  await queryClient.invalidateQueries({ queryKey: ['follow-up'] });
                  await queryClient.invalidateQueries({ queryKey: ['papers'] });
                });
              }}
            >
              <h2 className="text-lg">{t('workflow.decide')}</h2>
              <label className="text-sm font-extrabold">
                <span className="sr-only">{t('workflow.decide')}</span>
                <select name="outcome" className={field} defaultValue="ACCEPTED">
                  <option value="ACCEPTED">{t('workflow.outcomeAccepted')}</option>
                  <option value="CONDITIONALLY_ACCEPTED">{t('workflow.outcomeConditional')}</option>
                  <option value="REVISION_REQUIRED">{t('workflow.outcomeRevision')}</option>
                  <option value="REJECTED">{t('workflow.outcomeRejected')}</option>
                </select>
              </label>
              <label className="text-sm font-extrabold">
                {t('workflow.letter')}
                <textarea name="letter" required minLength={10} className={`${field} min-h-24`} />
              </label>
              <label className="flex items-center gap-2 text-sm font-extrabold">
                <input name="publish" type="checkbox" defaultChecked className="size-4 accent-[#5d74ff]" />
                {t('workflow.publish')}
              </label>
              <div>
                <Button type="submit">{t('workflow.decide')}</Button>
              </div>
            </form>
          ) : null}
          {selected ? (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)]">
              <section className="rounded-2xl border border-[#e4e7ee] bg-white p-5">
                <h2 className="text-lg">{t('workflow.documents')}</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <FileDrop
                    label={t('workflow.editable')}
                    present={hasKind('EDITABLE')}
                    onFile={(file) => void sendFile(`/api/v1/papers/${selected.id}/editable`, file)}
                  />
                  <FileDrop
                    label={t('workflow.camera')}
                    present={hasKind('CAMERA_READY')}
                    onFile={(file) => void sendFile(`/api/v1/papers/${selected.id}/camera-ready`, file)}
                  />
                  <FileDrop
                    label={t('workflow.report')}
                    present={hasKind('SIMILARITY')}
                    onFile={(file) => void sendFile(`/api/v1/papers/${selected.id}/similarity-report`, file)}
                  />
                  <FileDrop
                    label={t('workflow.steps.copyright')}
                    present={hasKind('COPYRIGHT')}
                    onFile={(file) => void sendFile(`/api/v1/papers/${selected.id}/copyright`, file)}
                  />
                </div>
              </section>
              <section className="rounded-2xl border border-[#e4e7ee] bg-white p-5">
                <h2 className="text-lg">{t('workflow.similarity')}</h2>
                <form
                  className="mt-4 grid gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const percentage = Number(new FormData(event.currentTarget).get('percentage'));
                    void apiFetch(`/api/v1/papers/${selected.id}/similarity`, {
                      method: 'POST',
                      body: JSON.stringify({ percentage, note: '' }),
                    }).then(async (response) => {
                      if (!response.ok) {
                        setMessage(await apiErrorMessage(response));
                        return;
                      }
                      setMessage(t('workflow.saved'));
                      await queryClient.invalidateQueries({ queryKey: ['follow-up'] });
                      await queryClient.invalidateQueries({ queryKey: ['papers'] });
                    });
                  }}
                >
                  <label className="text-sm font-extrabold">
                    <span className="sr-only">{t('workflow.similarity')}</span>
                    <input
                      name="percentage"
                      type="number"
                      min={0}
                      max={100}
                      step="0.1"
                      aria-label={t('workflow.similarity')}
                      className={field}
                    />
                  </label>
                  <div>
                    <Button type="submit">{t('workflow.save')}</Button>
                  </div>
                </form>
                {detail.data.canManage ? (
                  <div className="mt-5 border-t border-[#e4e7ee] pt-4">
                    <h3 className="text-sm font-extrabold">{t('workflow.actions')}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          void apiFetch(`/api/v1/papers/${selected.id}/template/validate`, {
                            method: 'POST',
                            body: '{}',
                          }).then(async (response) => {
                            setMessage(response.ok ? t('workflow.saved') : await apiErrorMessage(response));
                            await queryClient.invalidateQueries({ queryKey: ['follow-up'] });
                            await queryClient.invalidateQueries({ queryKey: ['papers'] });
                          });
                        }}
                      >
                        {t('workflow.templateOk')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          void apiFetch(`/api/v1/papers/${selected.id}/similarity/verify`, {
                            method: 'POST',
                            body: '{}',
                          }).then(async (response) => {
                            setMessage(response.ok ? t('workflow.verified') : await apiErrorMessage(response));
                            await queryClient.invalidateQueries({ queryKey: ['follow-up'] });
                            await queryClient.invalidateQueries({ queryKey: ['papers'] });
                          });
                        }}
                      >
                        {t('workflow.verify')}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}
          {template.data ? (
            <article className="rounded-2xl border border-[#e4e7ee] bg-white p-5">
              <h2 className="text-lg">{template.data.subject}</h2>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#5c6578]">{template.data.body}</p>
            </article>
          ) : null}
          {detail.data.versions.length > 0 ? (
            <section className="rounded-2xl border border-[#e4e7ee] bg-white p-5">
              <h2 className="text-lg">{t('workflow.history')}</h2>
              <ol className="mt-4 grid gap-2">
                {detail.data.versions.map((version) => (
                  <li key={version.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#f6f7fb] px-4 py-3">
                    <span className="text-sm font-extrabold">
                      {t(`workflow.files.${version.kind}`, { defaultValue: version.kind })}
                    </span>
                    <span className="text-xs font-bold text-[#8b909a]">
                      {new Date(version.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function FileDrop({
  label,
  present,
  onFile,
}: {
  label: string;
  present: boolean;
  onFile: (file: File) => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="flex cursor-pointer flex-col rounded-2xl border border-dashed border-[#d5d8e0] bg-[#f6f7fb] p-4">
      <span className="text-sm font-extrabold">{label}</span>
      <span className={`mt-2 w-fit rounded-full px-2.5 py-1 text-xs font-extrabold ${present ? 'bg-[#2fbf71]/14 text-[#1c9a57]' : 'bg-white text-[#8b909a]'}`}>
        {present ? t('workflow.stepDone') : t('papers.noFile')}
      </span>
      <span className="mt-4 inline-flex h-9 w-fit items-center rounded-full bg-[#5d74ff]/85 px-3 text-xs font-bold text-white">
        {t('workflow.choosePdf')}
      </span>
      <input
        type="file"
        accept="application/pdf"
        aria-label={label}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onFile(file);
          }
          event.target.value = '';
        }}
      />
    </label>
  );
}
