import type { ConferenceRole, MembershipStatus } from '@scholarflow/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { focusStep, stepAction, type PaperStep } from '@/components/step-bar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface Membership {
  id: string;
  name: string;
  role: ConferenceRole;
  membershipStatus: MembershipStatus;
}

interface PaperDetail {
  id: string;
  title: string;
  abstract: string;
  keywords: string[];
  status: string;
  publicId: string | null;
  conferenceId: string;
  trackId: string | null;
  authors: {
    firstName: string;
    lastName: string;
    email: string;
    affiliation: string;
    corresponding: boolean;
  }[];
  manuscript: { originalName: string; sizeBytes: number } | null;
  steps?: PaperStep[];
}

const submitterRoles = new Set(['AUTHOR', 'CHAIR', 'ADMINISTRATOR', 'COMMITTEE']);

async function loadMemberships(): Promise<Membership[]> {
  const response = await apiFetch('/api/v1/conferences');
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<Membership[]>;
}

async function loadPaper(id: string): Promise<PaperDetail> {
  const response = await apiFetch(`/api/v1/papers/${id}`);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<PaperDetail>;
}

export function SubmissionEditorPage() {
  const { t } = useTranslation();
  const { paperId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [conferenceId, setConferenceId] = useState('');
  const [title, setTitle] = useState('');
  const [abstractText, setAbstractText] = useState('');
  const [trackId, setTrackId] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const memberships = useQuery({
    queryKey: ['conferences'],
    queryFn: loadMemberships,
    enabled: !paperId,
  });
  const paper = useQuery({
    queryKey: ['paper', paperId],
    queryFn: () => loadPaper(paperId ?? ''),
    enabled: Boolean(paperId),
  });
  const current = paper.data;
  const locked = current ? current.status !== 'DRAFT' : false;
  const tracksOf = current?.conferenceId || conferenceId;
  const conference = useQuery({
    queryKey: ['conference', tracksOf],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${tracksOf}`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<{ tracks: { id: string; name: string; code: string }[] }>;
    },
    enabled: Boolean(tracksOf),
  });
  useEffect(() => {
    if (!current) {
      return;
    }
    setTitle(current.title);
    setAbstractText(current.abstract);
    setTrackId(current.trackId ?? '');
  }, [current]);

  async function send(path: string, method: string, payload?: unknown) {
    const response = await apiFetch(path, {
      method,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(await apiErrorMessage(response));
    }
    return response.json() as Promise<PaperDetail>;
  }

  const create = useMutation({
    mutationFn: () =>
      send(`/api/v1/conferences/${conferenceId}/papers`, 'POST', {
        title,
        abstract: abstractText,
        keywords: [],
        trackId: trackId || null,
        authors: [],
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
      void navigate(`/workspace/submissions/${created.id}`);
    },
  });

  const saveText = useMutation({
    mutationFn: () =>
      send(`/api/v1/papers/${paperId}`, 'PATCH', {
        title: title || current?.title,
        abstract: abstractText || current?.abstract,
        trackId: trackId || null,
      }),
  });

  const addAuthor = useMutation({
    mutationFn: () => {
      const [firstName, ...rest] = authorName.trim().split(/\s+/);
      const authors = [
        ...(current?.authors ?? []),
        {
          firstName: firstName || authorName,
          lastName: rest.join(' ') || firstName || 'Author',
          email: authorEmail,
          affiliation: '',
          corresponding: (current?.authors.length ?? 0) === 0,
        },
      ];
      return send(`/api/v1/papers/${paperId}/authors`, 'PUT', { authors });
    },
    onSuccess: async () => {
      setAuthorName('');
      setAuthorEmail('');
      await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
    },
  });

  const submit = useMutation({
    mutationFn: () => send(`/api/v1/papers/${paperId}/submit`, 'POST', {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
    },
  });

  const withdraw = useMutation({
    mutationFn: () =>
      send(`/api/v1/papers/${paperId}/withdraw`, 'POST', {
        reason: 'Withdrawn by the author',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
    },
  });

  async function upload(file: File) {
    setMessage(null);
    const body = new FormData();
    body.set('manuscript', file);
    const response = await apiFetch(`/api/v1/papers/${paperId}/manuscript`, {
      method: 'POST',
      body,
    });
    if (!response.ok) {
      setMessage(await apiErrorMessage(response));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
  }

  const steps = [
    t('papers.stepDetails'),
    t('papers.stepAuthors'),
    t('papers.stepFile'),
    t('papers.stepSubmit'),
  ];

  const field = 'mt-2 w-full rounded-2xl border-0 bg-[#f6f7fb] px-3 py-3 text-sm outline-none';

  return (
    <div className="space-y-5">
      <Link to="/workspace/submissions" className="text-sm font-bold text-[#8b909a] no-underline">
        {t('papers.back')}
      </Link>
      <div>
        <h1 className="text-3xl">{current?.title || t('papers.new')}</h1>
        {current ? (
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                current.status === 'DRAFT'
                  ? 'bg-[#f0a04b]/16 text-[#9a6410]'
                  : current.status === 'WITHDRAWN'
                    ? 'bg-[#e35d5d]/12 text-[#c54545]'
                    : 'bg-[#2fbf71]/14 text-[#1c9a57]'
              }`}
            >
              {current.status === 'DRAFT'
                ? t('papers.draft')
                : current.status === 'WITHDRAWN'
                  ? t('papers.withdrawn')
                  : t('papers.submitted')}
            </span>
            {current.publicId ? <span className="text-sm text-[#5c6578]">{current.publicId}</span> : null}
          </p>
        ) : null}
      </div>
      {current && current.status !== 'DRAFT' && current.steps ? <UsefulStep paperId={current.id} steps={current.steps} /> : null}
      <ol className="flex flex-wrap gap-2">
        {steps.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              className={`rounded-full px-3 py-1.5 text-sm font-extrabold ${
                index === step ? 'bg-[#5d74ff]/15 text-[#3d4fd4]' : 'bg-white text-[#5c6578]'
              }`}
              onClick={() => setStep(index)}
            >
              {index + 1}. {label}
            </button>
          </li>
        ))}
      </ol>
      {message ? <p className="text-sm font-bold text-[#c54545]" role="alert">{message}</p> : null}
      {step > 0 && !current ? (
        <section className="rounded-[28px] bg-white p-6 shadow-[0_8px_24px_rgba(28,30,33,0.04)]">
          <p className="text-sm text-[#5c6370]">{t('papers.needDraft')}</p>
        </section>
      ) : null}
      {step === 0 ? (
        <section className="rounded-[28px] bg-white p-5 shadow-[0_8px_24px_rgba(28,30,33,0.04)] sm:p-6">
          <h2 className="text-lg">{t('papers.stepDetails')}</h2>
          <div className="mt-4 grid gap-4">
            {!paperId ? (
              <label className="text-sm font-bold">
                {t('papers.conference')}
                <select
                  className={field}
                  value={conferenceId}
                  onChange={(event) => setConferenceId(event.target.value)}
                >
                  <option value="">{t('papers.chooseConference')}</option>
                  {memberships.data
                    ?.filter(
                      (item) =>
                        item.membershipStatus === 'ACTIVE' &&
                        submitterRoles.has(item.role),
                    )
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
            <label className="text-sm font-bold">
              {t('papers.track')}
              <select
                className={field}
                value={trackId}
                disabled={locked || !tracksOf}
                onChange={(event) => setTrackId(event.target.value)}
              >
                <option value="">{t('papers.chooseTrack')}</option>
                {conference.data?.tracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.code} · {track.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold">
              {t('papers.paperTitle')}
              <Input className={field} value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label className="text-sm font-bold">
              {t('papers.abstract')}
              <textarea
                className={`${field} min-h-32`}
                value={abstractText}
                onChange={(event) => setAbstractText(event.target.value)}
              />
            </label>
            <div>
              <Button
                type="button"
                disabled={create.isPending || saveText.isPending || locked}
                onClick={() => {
                  setMessage(null);
                  const action = paperId ? saveText.mutateAsync() : create.mutateAsync();
                  void action.catch((caught: unknown) => {
                    setMessage(caught instanceof Error ? caught.message : t('papers.failed'));
                  });
                }}
              >
                {t('papers.saveDraft')}
              </Button>
            </div>
          </div>
        </section>
      ) : null}
      {step === 1 && current ? (
        <section className="rounded-[28px] bg-white p-5 shadow-[0_8px_24px_rgba(28,30,33,0.04)] sm:p-6">
          <h2 className="text-lg">{t('papers.stepAuthors')}</h2>
          <ul className="mt-4 space-y-2">
            {current.authors.map((author, index) => (
              <li key={`${author.email}-${index}`} className="rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm">
                <span className="font-extrabold">{author.firstName} {author.lastName}</span>
                <span className="mt-0.5 block text-[#8b909a]">{author.email}</span>
                {author.corresponding ? <span className="mt-1 inline-block rounded-full bg-white px-2 py-0.5 text-xs font-bold">{t('papers.corresponding')}</span> : null}
              </li>
            ))}
          </ul>
          {locked ? null : (
            <form
              className="mt-4 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                setMessage(null);
                void addAuthor.mutateAsync().catch((caught: unknown) => {
                  setMessage(caught instanceof Error ? caught.message : t('papers.failed'));
                });
              }}
            >
              <Input className="rounded-2xl border-0 bg-[#f6f7fb]" value={authorName} onChange={(event) => setAuthorName(event.target.value)} placeholder={t('papers.authorName')} />
              <Input className="rounded-2xl border-0 bg-[#f6f7fb]" type="email" value={authorEmail} onChange={(event) => setAuthorEmail(event.target.value)} placeholder={t('auth.email')} />
              <Button type="submit">{t('papers.addAuthor')}</Button>
            </form>
          )}
        </section>
      ) : null}
      {step === 2 && current ? (
        <section className="rounded-[28px] bg-white p-5 shadow-[0_8px_24px_rgba(28,30,33,0.04)] sm:p-6">
          <h2 className="text-lg">{t('papers.stepFile')}</h2>
          <p className="mt-2 text-sm text-[#8b909a]">{t('papers.fileHint')}</p>
          <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-[#d5d8e0] bg-[#f6f7fb] px-6 py-10 text-center">
            <span className="text-sm font-extrabold">
              {current.manuscript ? current.manuscript.originalName : t('papers.noFile')}
            </span>
            {current.manuscript ? (
              <span className="mt-1 text-xs text-[#8b909a]">{Math.ceil(current.manuscript.sizeBytes / 1024)} Ko</span>
            ) : null}
            {locked ? null : (
              <input
                type="file"
                accept="application/pdf"
                className="mt-4 block text-sm"
                aria-label={t('papers.stepFile')}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    void upload(file);
                  }
                }}
              />
            )}
          </label>
        </section>
      ) : null}
      {step === 3 && current ? (
        <section className="rounded-[28px] bg-white p-5 shadow-[0_8px_24px_rgba(28,30,33,0.04)] sm:p-6">
          <h2 className="text-lg">{t('papers.stepSubmit')}</h2>
          <p className="mt-2 text-sm text-[#5c6370]">{t('papers.submitHint')}</p>
          <div className="mt-4">
            {current.status === 'DRAFT' ? (
              <Button
                type="button"
                disabled={submit.isPending}
                onClick={() => {
                  setMessage(null);
                  void submit.mutateAsync().catch((caught: unknown) => {
                    setMessage(caught instanceof Error ? caught.message : t('papers.failed'));
                  });
                }}
              >
                {t('papers.submit')}
              </Button>
            ) : null}
            {current.status === 'SUBMITTED' ? (
              <Button
                type="button"
                variant="outline"
                disabled={withdraw.isPending}
                onClick={() => {
                  setMessage(null);
                  void withdraw.mutateAsync().catch((caught: unknown) => {
                    setMessage(caught instanceof Error ? caught.message : t('papers.failed'));
                  });
                }}
              >
                {t('papers.withdraw')}
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function UsefulStep({ paperId, steps }: { paperId: string; steps: PaperStep[] }) {
  const { t } = useTranslation();
  const focus = focusStep(steps);
  if (!focus) {
    return (
      <section className="rounded-2xl border border-[#e4e7ee] bg-white p-5">
        <h2 className="text-lg">{t('workflow.round')}</h2>
        <p className="mt-3 inline-flex rounded-full bg-[#2fbf71]/14 px-3 py-1 text-xs font-extrabold text-[#1c9a57]">
          {t('home.clear')}
        </p>
      </section>
    );
  }
  const sentence = t(`home.actions.${focus.key}.${focus.state}`);
  const badge =
    focus.state === 'failed' ? 'bg-[#ffe8e8] text-[#c54545]' : 'bg-[#fff4e4] text-[#9a6410]';
  return (
    <section className="rounded-2xl border border-[#e4e7ee] bg-white p-5">
      <h2 className="text-lg">{t('workflow.round')}</h2>
      <Link
        to={stepAction(paperId, focus.key)}
        className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-[#e6eaf3] px-4 py-3 text-[#1c2744] no-underline"
      >
        <span className="min-w-0">
          <span className="block text-sm font-extrabold">{t(`workflow.steps.${focus.key}`)}</span>
          <span className="block text-sm text-[#5c6578]">{sentence}</span>
        </span>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-extrabold ${badge}`}>
          {focus.state === 'failed' ? t('workflow.stepFailed') : t('workflow.stepPending')}
        </span>
      </Link>
    </section>
  );
}
