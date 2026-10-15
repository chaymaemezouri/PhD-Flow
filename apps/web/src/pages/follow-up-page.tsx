import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { focusStep, type PaperStep } from '@/components/step-bar';
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
  status: string;
  decision: { outcome: string; letter: string; status: string } | null;
  similarity: { percentage: number; satisfied: boolean; verified: boolean } | null;
  copyright: string | null;
  doi: string | null;
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

const pillTone = {
  green: 'bg-[#2fbf71]/14 text-[#1c9a57]',
  amber: 'bg-[#f0a04b]/16 text-[#9a6410]',
  red: 'bg-[#e35d5d]/12 text-[#c54545]',
  blue: 'bg-[#5d74ff]/12 text-[#3d4fd4]',
  muted: 'bg-[#f4f5f8] text-[#8b909a]',
} as const;

type Tone = keyof typeof pillTone;

export function FollowUpPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);
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

  async function refresh(response: Response, okText: string) {
    if (!response.ok) {
      setNotice({ text: await apiErrorMessage(response), ok: false });
      return;
    }
    setNotice({ text: okText, ok: true });
    await queryClient.invalidateQueries({ queryKey: ['follow-up'] });
    await queryClient.invalidateQueries({ queryKey: ['papers'] });
  }

  async function sendFile(path: string, file: File) {
    const body = new FormData();
    body.set('file', file);
    await refresh(await apiFetch(path, { method: 'POST', body }), t('workflow.saved'));
  }

  const data = detail.data;
  const focus = focusStep(selected?.steps ?? []);
  const outcomes: Record<string, string> = {
    ACCEPTED: t('workflow.outcomeAccepted'),
    CONDITIONALLY_ACCEPTED: t('workflow.outcomeConditional'),
    REVISION_REQUIRED: t('workflow.outcomeRevision'),
    REJECTED: t('workflow.outcomeRejected'),
  };
  const outcomeTone: Record<string, Tone> = {
    ACCEPTED: 'green',
    CONDITIONALLY_ACCEPTED: 'green',
    REVISION_REQUIRED: 'amber',
    REJECTED: 'red',
  };
  const template = useQuery({
    queryKey: ['copyright-template', data?.conferenceId],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${data!.conferenceId}/copyright-template`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<{ subject: string; body: string }>;
    },
    enabled: Boolean(data?.conferenceId && data.checklist.accepted),
  });
  const field = 'h-10 w-full rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-3 text-sm outline-none';
  const authorFiles = Boolean(selected && data && !data.canManage && data.checklist.accepted);
  const showPublication = Boolean(data?.checklist.accepted);
  const showRevision = data?.decision?.outcome === 'REVISION_REQUIRED' && !data.canManage;
  const latest = (kind: string) =>
    data?.versions.filter((version) => version.kind === kind).at(-1)?.createdAt ?? null;
  const when = (kind: string) => {
    const stamp = latest(kind);
    return stamp ? new Date(stamp).toLocaleString() : null;
  };
  const toneRank: Record<Tone, number> = { red: 0, amber: 1, blue: 2, muted: 3, green: 4 };
  const cards: WorkItem[] = [];
  if (selected && data && showRevision) {
    cards.push({
      key: 'revision',
      label: t('workflow.files.REVISION'),
      value: latest('REVISION') ? t('workflow.stepDone') : t('workflow.stepPending'),
      tone: latest('REVISION') ? 'green' : 'amber',
      hint: when('REVISION'),
      action: (
        <PdfButton
          label={t('workflow.files.REVISION')}
          onFile={(file) => void sendFile(`/api/v1/papers/${selected.id}/revision`, file)}
        />
      ),
    });
  }
  if (selected && data && showPublication) {
    cards.push(
      {
        key: 'editable',
        label: t('workflow.editable'),
        value: latest('EDITABLE') ? t('workflow.stepDone') : t('workflow.stepPending'),
        tone: latest('EDITABLE') ? 'green' : 'amber',
        hint: when('EDITABLE'),
        action: authorFiles ? (
          <PdfButton
            label={t('workflow.editable')}
            onFile={(file) => void sendFile(`/api/v1/papers/${selected.id}/editable`, file)}
          />
        ) : null,
      },
      {
        key: 'camera',
        label: t('workflow.camera'),
        value: data.checklist.cameraReady ? t('workflow.stepDone') : t('workflow.stepPending'),
        tone: data.checklist.cameraReady ? 'green' : 'amber',
        hint: when('CAMERA_READY'),
        action: authorFiles ? (
          <PdfButton
            label={t('workflow.camera')}
            onFile={(file) => void sendFile(`/api/v1/papers/${selected.id}/camera-ready`, file)}
          />
        ) : null,
      },
      {
        key: 'similarity',
        label: t('workflow.similarity'),
        value: data.similarity ? `${data.similarity.percentage} %` : '—',
        tone: data.similarity?.satisfied ? 'green' : data.similarity && data.similarity.percentage >= 20 ? 'red' : 'amber',
        hint: data.similarity
          ? data.similarity.percentage >= 20
            ? t('workflow.notSatisfied')
            : data.similarity.verified
              ? t('workflow.underThreshold')
              : t('home.actions.similarity.pending')
          : t('home.actions.similarity.pending'),
        action: (
          <div className="flex flex-col items-start gap-2">
            <p className="max-w-md text-xs leading-relaxed text-[#5c6578]">{t('workflow.similarityLocal')}</p>
            {authorFiles ? (
              <PdfButton
                label={t('workflow.report')}
                onFile={(file) => void sendFile(`/api/v1/papers/${selected.id}/similarity-report`, file)}
              />
            ) : null}
            {authorFiles && latest('SIMILARITY') ? (
              <form
                className="flex flex-wrap items-center gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const percentage = Number(new FormData(event.currentTarget).get('percentage'));
                  void apiFetch(`/api/v1/papers/${selected.id}/similarity`, {
                    method: 'POST',
                    body: JSON.stringify({ percentage, note: '' }),
                  }).then((response) => refresh(response, t('workflow.saved')));
                }}
              >
                <input
                  name="percentage"
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  required
                  defaultValue={data.similarity?.percentage ?? ''}
                  aria-label={t('workflow.similarity')}
                  className="h-10 w-28 rounded-full border border-[#e4e7ee] bg-[#f6f7fb] px-3 text-sm outline-none"
                />
                <Button type="submit" size="sm">
                  {t('workflow.save')}
                </Button>
              </form>
            ) : null}
            {data.canManage && data.similarity && !data.similarity.verified ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void apiFetch(`/api/v1/papers/${selected.id}/similarity/verify`, {
                    method: 'POST',
                    body: '{}',
                  }).then((response) => refresh(response, t('workflow.verified')));
                }}
              >
                {t('workflow.verify')}
              </Button>
            ) : null}
          </div>
        ),
      },
      {
        key: 'copyright',
        label: t('workflow.steps.copyright'),
        value:
          data.copyright === 'VALIDATED'
            ? t('workflow.stepDone')
            : data.copyright === 'REJECTED'
              ? t('workflow.stepFailed')
              : t('workflow.stepPending'),
        tone: data.copyright === 'VALIDATED' ? 'green' : data.copyright === 'REJECTED' ? 'red' : 'amber',
        hint: when('COPYRIGHT'),
        action: authorFiles ? (
          <PdfButton
            label={t('workflow.steps.copyright')}
            onFile={(file) => void sendFile(`/api/v1/papers/${selected.id}/copyright`, file)}
          />
        ) : null,
      },
    );
    if (data.canManage) {
      const templateDone = selected.steps?.find((step) => step.key === 'template')?.state === 'done';
      cards.push({
        key: 'template',
        label: t('workflow.steps.template'),
        value: templateDone ? t('workflow.stepDone') : t('workflow.stepPending'),
        tone: templateDone ? 'green' : 'amber',
        action: (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              void apiFetch(`/api/v1/papers/${selected.id}/template/validate`, {
                method: 'POST',
                body: '{}',
              }).then((response) => refresh(response, t('workflow.saved')));
            }}
          >
            {t('workflow.templateOk')}
          </Button>
        ),
      });
    }
  }
  cards.sort((left, right) => toneRank[left.tone] - toneRank[right.tone]);

  return (
    <div className="space-y-5">
        {notice ? (
          <p
            className={`w-fit rounded-full px-3 py-1 text-sm font-extrabold ${notice.ok ? 'bg-[#2fbf71]/14 text-[#1c9a57]' : 'bg-[#e35d5d]/12 text-[#c54545]'}`}
            role="status"
          >
            {notice.text}
          </p>
        ) : null}
        {data && selected ? (
          <>
            <section className="rounded-[28px] border border-[#e4e7ee] bg-white p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-extrabold tracking-wide text-[#8b909a]">
                    {data.publicId ?? t('workflow.followTitle')}
                  </p>
                  <h1 className="mt-1 text-2xl font-extrabold leading-tight">{data.title}</h1>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${pillTone[data.decision ? outcomeTone[data.decision.outcome] ?? 'blue' : 'muted']}`}>
                  {data.decision ? outcomes[data.decision.outcome] ?? data.decision.outcome : t('workflow.noDecision')}
                </span>
              </div>
              {data.decision ? (
                <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[#5c6578]">{data.decision.letter}</p>
              ) : null}
              <p
                className={`mt-5 rounded-2xl px-4 py-3 text-sm font-extrabold ${
                  focus?.state === 'failed'
                    ? 'bg-[#e35d5d]/12 text-[#c54545]'
                    : focus
                      ? 'bg-[#f0a04b]/16 text-[#9a6410]'
                      : data.status === 'DRAFT'
                        ? 'bg-[#f0a04b]/16 text-[#9a6410]'
                        : 'bg-[#2fbf71]/14 text-[#1c9a57]'
                }`}
              >
                {focus
                  ? t(`home.actions.${focus.key}.${focus.state === 'failed' ? 'failed' : 'pending'}`)
                  : data.status === 'DRAFT'
                    ? t('home.actions.submission.pending')
                    : t('home.clear')}
              </p>
              {data.doi ? (
                <p className="mt-4 text-sm font-extrabold text-[#3d4fd4]">{data.doi}</p>
              ) : null}
              {data.canManage && data.checklist.ready && !data.doi && selected ? (
                <div className="mt-4">
                  <Button
                    type="button"
                    onClick={() => {
                      void apiFetch(`/api/v1/papers/${selected.id}/publish`, { method: 'POST', body: '{}' }).then(
                        (response) => refresh(response, t('workflow.doiReady')),
                      );
                    }}
                  >
                    {t('workflow.doi')}
                  </Button>
                </div>
              ) : null}
              {(papers.data?.length ?? 0) > 1 ? (
                <div className="mt-5 border-t border-[#eef0f4] pt-4">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 text-left text-sm font-extrabold"
                    aria-expanded={othersOpen}
                    onClick={() => setOthersOpen((open) => !open)}
                  >
                    {t('workflow.others')}
                    <ChevronDown className={`size-4 shrink-0 transition-transform ${othersOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {othersOpen ? (
                    <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                      {papers.data?.map((paper) => {
                        const active = paper.id === selected.id;
                        const paperFocus = focusStep(paper.steps ?? []);
                        const badge =
                          paper.status === 'DRAFT'
                            ? { label: t('papers.draft'), tone: 'amber' as Tone }
                            : paper.status === 'WITHDRAWN'
                              ? { label: t('papers.withdrawn'), tone: 'red' as Tone }
                              : paperFocus
                                ? {
                                    label: t(`workflow.steps.${paperFocus.key}`),
                                    tone: (paperFocus.state === 'failed' ? 'red' : 'amber') as Tone,
                                  }
                                : { label: t('workflow.stepDone'), tone: 'green' as Tone };
                        return (
                          <li key={paper.id}>
                            <button
                              type="button"
                              aria-current={active ? 'true' : undefined}
                              className={`h-full w-full rounded-2xl px-4 py-3 text-left ${active ? 'bg-[#5d74ff]/12' : 'bg-[#f6f7fb]'}`}
                              onClick={() => {
                                setNotice(null);
                                setModelOpen(false);
                                setOthersOpen(false);
                                setParams({ paper: paper.id });
                              }}
                            >
                              <span className="block text-sm font-extrabold leading-snug text-[#1c2744]">{paper.title}</span>
                              <span className="mt-2 flex flex-wrap items-center gap-2">
                                {paper.publicId ? <span className="text-xs text-[#8b909a]">{paper.publicId}</span> : null}
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${pillTone[badge.tone]}`}>
                                  {badge.label}
                                </span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </section>

            {data.canManage && !data.decision && data.status === 'SUBMITTED' ? (
              <form
                className="grid gap-3 rounded-2xl border border-[#e4e7ee] bg-white p-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void apiFetch(`/api/v1/papers/${selected.id}/decision`, {
                    method: 'POST',
                    body: JSON.stringify({
                      outcome: String(form.get('outcome')),
                      letter: String(form.get('letter')),
                      publish: form.get('publish') === 'on',
                    }),
                  }).then((response) => refresh(response, t('workflow.saved')));
                }}
              >
                <h3 className="text-lg font-extrabold">{t('workflow.decide')}</h3>
                <select name="outcome" className={field} defaultValue="ACCEPTED" aria-label={t('workflow.decide')}>
                  <option value="ACCEPTED">{t('workflow.outcomeAccepted')}</option>
                  <option value="CONDITIONALLY_ACCEPTED">{t('workflow.outcomeConditional')}</option>
                  <option value="REVISION_REQUIRED">{t('workflow.outcomeRevision')}</option>
                  <option value="REJECTED">{t('workflow.outcomeRejected')}</option>
                </select>
                <label className="text-sm font-extrabold">
                  {t('workflow.letter')}
                  <textarea name="letter" required minLength={10} className={`${field} mt-1 h-28 py-2`} />
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

            {!data.canManage && !data.checklist.accepted ? (
              <section className="rounded-2xl border border-[#e4e7ee] bg-white p-5">
                <p className="text-sm text-[#5c6578]">{t('conferences.filesAfterAcceptance')}</p>
              </section>
            ) : null}

            {cards.length > 0 ? (
              <section>
                <h2 className="mb-3 text-lg font-extrabold">{t('workflow.documents')}</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {cards.map((card) => (
                    <WorkCard key={card.key} item={card} />
                  ))}
                </div>
              </section>
            ) : null}

            {data.checklist.accepted && template.data ? (
              <section className="rounded-2xl border border-[#e4e7ee] bg-white">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
                  aria-expanded={modelOpen}
                  onClick={() => setModelOpen((open) => !open)}
                >
                  <span className="text-sm font-extrabold">{t('workflow.model')}</span>
                  <ChevronDown className={`size-4 shrink-0 transition-transform ${modelOpen ? 'rotate-180' : ''}`} />
                </button>
                {modelOpen ? (
                  <div className="border-t border-[#eef0f4] px-5 py-4">
                    <h3 className="text-sm font-extrabold">{template.data.subject}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#5c6578]">{template.data.body}</p>
                  </div>
                ) : null}
              </section>
            ) : null}
          </>
        ) : null}
    </div>
  );
}

interface WorkItem {
  key: string;
  label: string;
  value: string;
  tone: Tone;
  hint?: string | null;
  action?: ReactNode;
}

function WorkCard({ item }: { item: WorkItem }) {
  const attention = item.tone === 'red';
  return (
    <article
      className={`flex flex-col rounded-[24px] border p-5 ${
        attention ? 'border-[#e35d5d]/20 bg-[#e35d5d]/8 md:col-span-2' : 'border-[#e4e7ee] bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-extrabold">{item.label}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${pillTone[item.tone]}`}>{item.value}</span>
      </div>
      {item.hint ? <p className="mt-2 text-sm text-[#5c6578]">{item.hint}</p> : null}
      {item.action ? <div className="mt-4">{item.action}</div> : null}
    </article>
  );
}

function PdfButton({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  const { t } = useTranslation();
  return (
    <label className="inline-flex h-10 cursor-pointer items-center rounded-full bg-[#5d74ff]/85 px-4 text-sm font-bold text-white">
      {t('workflow.choosePdf')}
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
