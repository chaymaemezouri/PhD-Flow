import type { ConferenceRole, MembershipStatus } from '@scholarflow/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { usePaperStageExtras } from '@/components/paper-stage-actions';
import { PaperFileSlot } from '@/components/paper-file-preview';
import { useCurrentUser } from '@/features/auth/use-account';
import { canSubmitToConference } from '@/features/navigation/can-submit';
import { PaperWorkflow, type PaperDossier } from '@/components/paper-workflow';
import { StagePanel, stageField } from '@/components/stage-panel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface Membership {
  id: string;
  name: string;
  role: ConferenceRole;
  membershipStatus: MembershipStatus | 'OPEN';
}

interface PaperDetail {
  id: string;
  title: string;
  abstract: string;
  keywords: string[];
  status: string;
  publicId: string | null;
  submittedAt: string | null;
  conferenceId: string;
  conferenceName?: string | null;
  trackId: string | null;
  authors: {
    firstName: string;
    lastName: string;
    email: string;
    affiliation: string;
    corresponding: boolean;
  }[];
  manuscript: {
    originalName: string;
    sizeBytes: number;
    contentType?: string | null;
  } | null;
  decision: { outcome: string; status: string; letter?: string } | null;
  dossier?: PaperDossier;
}

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
  const account = useCurrentUser();
  const { paperId } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pendingStep = useRef(0);
  const [step, setStep] = useState(() => {
    const incoming = location.state as { step?: number } | null;
    return incoming?.step ?? 0;
  });
  useEffect(() => {
    const incoming = (location.state as { step?: number } | null)?.step;
    if (typeof incoming === 'number') {
      setStep(incoming);
    }
  }, [paperId, location.state]);
  const [message, setMessage] = useState<string | null>(null);
  const [conferenceId, setConferenceId] = useState(
    () => searchParams.get('conference') ?? '',
  );
  const [title, setTitle] = useState('');
  const [abstractText, setAbstractText] = useState('');
  const [trackId, setTrackId] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [paperKind, setPaperKind] = useState<'ABSTRACT' | 'FULL'>('FULL');
  const [authorName, setAuthorName] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const memberships = useQuery({
    queryKey: ['conferences'],
    queryFn: loadMemberships,
    enabled: !paperId,
  });
  useEffect(() => {
    if (!memberships.data || !conferenceId) {
      return;
    }
    const chosen = memberships.data.find((item) => item.id === conferenceId);
    if (
      !chosen ||
      !canSubmitToConference(
        account.data?.platformRole === 'SYSTEM_ADMIN',
        memberships.data,
        chosen,
      )
    ) {
      setConferenceId('');
    }
  }, [account.data?.platformRole, conferenceId, memberships.data]);
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
      return response.json() as Promise<{
        name: string;
        tracks: { id: string; name: string; code: string }[];
      }>;
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
    setKeywordsText(current.keywords.join(', '));
    if (current.dossier?.paperKind) {
      setPaperKind(current.dossier.paperKind);
    }
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
        keywords: keywordsText
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
        trackId: trackId || null,
        paperKind,
        authors: [],
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
      void navigate(`/workspace/submissions/${created.id}`, {
        state: { step: pendingStep.current },
      });
    },
  });

  const saveText = useMutation({
    mutationFn: () =>
      send(`/api/v1/papers/${paperId}`, 'PATCH', {
        title: title || current?.title,
        abstract: abstractText || current?.abstract,
        trackId: trackId || null,
        paperKind,
        keywords: keywordsText
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
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
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
    },
  });

  const cancelPaper = useMutation({
    mutationFn: () =>
      send(`/api/v1/papers/${paperId}/cancel`, 'POST', {
        reason: 'Cancelled by the author',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
    },
  });

  async function goNext() {
    setMessage(null);
    try {
      if (step === 0 && !locked) {
        if (!paperId) {
          pendingStep.current = 1;
          await create.mutateAsync();
          return;
        }
        await saveText.mutateAsync();
        await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      }
      setStep((value) => Math.min(value + 1, 3));
    } catch (caught: unknown) {
      setMessage(caught instanceof Error ? caught.message : t('papers.failed'));
    }
  }

  function stepNav(showSave: boolean) {
    return (
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {step > 0 ? (
            <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
              {t('papers.previous')}
            </Button>
          ) : null}
          {showSave ? (
            <Button
              type="button"
              disabled={create.isPending || saveText.isPending || locked}
              onClick={() => {
                setMessage(null);
                pendingStep.current = 0;
                const action = paperId ? saveText.mutateAsync() : create.mutateAsync();
                void action.catch((caught: unknown) => {
                  setMessage(
                    caught instanceof Error ? caught.message : t('papers.failed'),
                  );
                });
              }}
            >
              {t('papers.saveDraft')}
            </Button>
          ) : null}
        </div>
        {step < 3 ? (
          <Button
            type="button"
            disabled={create.isPending || saveText.isPending}
            onClick={() => void goNext()}
          >
            {t('papers.next')}
          </Button>
        ) : null}
      </div>
    );
  }

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

  const extras = usePaperStageExtras(
    current,
    async () => {
      await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
    },
    setMessage,
  );

  const steps = [
    t('papers.stepDetails'),
    t('papers.stepAuthors'),
    t('papers.stepFile'),
    t('papers.stepSubmit'),
  ];

  const field = stageField;
  const editingExisting = Boolean(paperId);

  if (editingExisting && paper.isPending) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl">
          {t('common.loading')}
        </h1>
        <p className="text-sm text-[#5c6578]">{t('papers.loadingPaper')}</p>
      </div>
    );
  }

  if (editingExisting && paper.isError) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl">
          {t('papers.loadError')}
        </h1>
        <p className="text-sm font-semibold text-[#c54545]" role="alert">
          {paper.error.message}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="border-[#c5cad6]"
            onClick={() => void paper.refetch()}
          >
            {t('common.retry')}
          </Button>
          <Button asChild variant="outline" className="border-[#c5cad6]">
            <Link to="/workspace/submissions">{t('papers.back')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (editingExisting && !current) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl">
          {t('papers.loadError')}
        </h1>
        <Button asChild variant="outline" className="border-[#c5cad6]">
          <Link to="/workspace/submissions">{t('papers.back')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="break-words text-xl sm:text-2xl lg:text-3xl">
          {current?.title || t('papers.new')}
        </h1>
        {current ? (
          <p className="mt-2 flex flex-wrap items-center gap-2">
            {(current.conferenceName || conference.data?.name) ? (
              <span className="rounded-full border border-[#d8dce6] bg-[#f6f7fb] px-3 py-1 text-xs font-extrabold text-[#1c2744]">
                {current.conferenceName || conference.data?.name}
              </span>
            ) : null}
            <span
              className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                current.status === 'DRAFT'
                  ? 'bg-[#f0a04b]/16 text-[#9a6410]'
                  : current.status === 'WITHDRAWN' || current.status === 'CANCELLED'
                    ? 'bg-[#e35d5d]/12 text-[#c54545]'
                    : 'bg-[#2fbf71]/14 text-[#1c9a57]'
              }`}
            >
              {current.status === 'DRAFT'
                ? t('papers.draft')
                : current.status === 'WITHDRAWN'
                  ? t('papers.withdrawn')
                  : current.status === 'CANCELLED'
                    ? t('papers.cancelled')
                    : t('papers.submitted')}
            </span>
            {current.publicId ? (
              <span className="text-sm text-[#5c6578]">{current.publicId}</span>
            ) : null}
          </p>
        ) : null}
      </div>
      {message ? (
        <p className="text-sm font-bold text-[#c54545]" role="alert">
          {message}
        </p>
      ) : null}
      <PaperWorkflow
        paper={current}
        onScope={(accept, reason) => {
          setMessage(null);
          void apiFetch(`/api/v1/papers/${paperId}/scope`, {
            method: 'POST',
            body: JSON.stringify({
              accept,
              ...(accept ? {} : { reason }),
            }),
          }).then(async (response) => {
            if (!response.ok) {
              setMessage(await apiErrorMessage(response));
              return;
            }
            await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
          });
        }}
        extras={extras}
      >
        {!current || current.dossier?.isAuthor ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-[#1c2744]">
                {t('papers.depositEditor')}
              </h2>
              <p className="mt-1 text-sm text-[#5c6578]">
                {t('papers.depositEditorHint')}
              </p>
            </div>
          </div>

          <div
            className="grid grid-cols-2 gap-1.5 rounded-2xl border border-[#d8dce6] bg-[#f6f7fb] p-1.5 sm:grid-cols-4"
            role="tablist"
            aria-label={t('papers.depositEditor')}
          >
            {steps.map((label, index) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={index === step}
                className={`min-h-11 rounded-xl px-2 py-2.5 text-xs font-extrabold sm:text-sm ${
                  index === step
                    ? 'bg-[#3d4fd4] text-white shadow-[0_2px_8px_rgba(61,79,212,0.28)]'
                    : 'bg-white text-[#5c6578] hover:text-[#1c2744]'
                }`}
                onClick={() => setStep(index)}
              >
                {index + 1}. {label}
              </button>
            ))}
          </div>

          {step > 0 && !current ? (
            <StagePanel
              title={t('papers.stepDetails')}
              status={t('dossier.waiting')}
              statusTone="wait"
            >
              <p className="text-sm text-[#5c6578]">{t('papers.needDraft')}</p>
            </StagePanel>
          ) : null}

          {step === 0 ? (
            <StagePanel
              title={t('papers.stepDetails')}
              hint={t('papers.detailsHint')}
              status={locked ? t('dossier.completed') : t('papers.draft')}
              statusTone={locked ? 'ok' : 'wait'}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {!paperId ? (
                  <label className="text-xs font-extrabold text-[#5c6578] sm:col-span-2">
                    {t('papers.conference')}
                    <select
                      className={field}
                      value={conferenceId}
                      onChange={(event) => setConferenceId(event.target.value)}
                    >
                      <option value="">{t('papers.chooseConference')}</option>
                      {memberships.data
                        ?.filter((item) =>
                          canSubmitToConference(
                            account.data?.platformRole === 'SYSTEM_ADMIN',
                            memberships.data ?? [],
                            item,
                          ),
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
                <label className="text-xs font-extrabold text-[#5c6578]">
                  {t('papers.kind')}
                  <select
                    className={field}
                    value={paperKind}
                    disabled={locked}
                    onChange={(event) =>
                      setPaperKind(event.target.value as 'ABSTRACT' | 'FULL')
                    }
                  >
                    <option value="FULL">{t('dossier.full')}</option>
                    <option value="ABSTRACT">{t('dossier.abstract')}</option>
                  </select>
                </label>
                <label className="text-xs font-extrabold text-[#5c6578]">
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
                <label className="text-xs font-extrabold text-[#5c6578] sm:col-span-2">
                  {t('papers.paperTitle')}
                  <Input
                    className={field}
                    value={title}
                    disabled={locked}
                    onChange={(event) => setTitle(event.target.value)}
                  />
                </label>
                <label className="text-xs font-extrabold text-[#5c6578] sm:col-span-2">
                  {t('papers.keywords')}
                  <Input
                    className={field}
                    value={keywordsText}
                    disabled={locked}
                    placeholder={t('papers.keywordsHint')}
                    onChange={(event) => setKeywordsText(event.target.value)}
                  />
                </label>
                <label className="text-xs font-extrabold text-[#5c6578] sm:col-span-2">
                  {t('papers.abstract')}
                  <textarea
                    className={`${field} min-h-32`}
                    value={abstractText}
                    disabled={locked}
                    onChange={(event) => setAbstractText(event.target.value)}
                  />
                </label>
              </div>
              {stepNav(true)}
            </StagePanel>
          ) : null}

          {step === 1 && current ? (
            <StagePanel
              title={t('papers.stepAuthors')}
              hint={t('papers.authorsHint')}
              status={`${current.authors.length}`}
              statusTone={current.authors.length > 0 ? 'ok' : 'missing'}
            >
              <ul className="grid gap-2 sm:grid-cols-2">
                {current.authors.map((author, index) => (
                  <li
                    key={`${author.email}-${index}`}
                    className="rounded-xl border border-[#d8dce6] bg-white px-4 py-3 text-sm"
                  >
                    <span className="font-extrabold text-[#1c2744]">
                      {author.firstName} {author.lastName}
                    </span>
                    <span className="mt-0.5 block break-all text-xs font-semibold text-[#8b909a]">
                      {author.email}
                    </span>
                    {author.corresponding ? (
                      <span className="mt-2 inline-block rounded-full bg-[#eef2ff] px-2 py-0.5 text-[11px] font-extrabold text-[#3d4fd4]">
                        {t('papers.corresponding')}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {locked ? null : (
                <form
                  className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                  onSubmit={(event) => {
                    event.preventDefault();
                    setMessage(null);
                    void addAuthor.mutateAsync().catch((caught: unknown) => {
                      setMessage(
                        caught instanceof Error ? caught.message : t('papers.failed'),
                      );
                    });
                  }}
                >
                  <Input
                    className={field}
                    value={authorName}
                    onChange={(event) => setAuthorName(event.target.value)}
                    placeholder={t('papers.authorName')}
                  />
                  <Input
                    className={field}
                    type="email"
                    value={authorEmail}
                    onChange={(event) => setAuthorEmail(event.target.value)}
                    placeholder={t('auth.email')}
                  />
                  <Button type="submit">{t('papers.addAuthor')}</Button>
                </form>
              )}
              {stepNav(false)}
            </StagePanel>
          ) : null}

          {step === 2 && current ? (
            <div className="space-y-3">
              <PaperFileSlot
                paperId={current.id}
                title={t('papers.stepFile')}
                hint={t('papers.fileHint')}
                kind="MANUSCRIPT"
                file={
                  current.manuscript
                    ? {
                        kind: 'MANUSCRIPT',
                        originalName: current.manuscript.originalName,
                        contentType: current.manuscript.contentType ?? 'application/pdf',
                        sizeBytes: current.manuscript.sizeBytes,
                      }
                    : null
                }
                uploadLabel={t('papers.uploadManuscript')}
                onUpload={locked ? undefined : (file) => void upload(file)}
                done={Boolean(current.manuscript)}
              />
              {stepNav(false)}
            </div>
          ) : null}

          {step === 3 && current ? (
            <StagePanel
              title={t('papers.stepSubmit')}
              hint={t('papers.submitHint')}
              status={
                current.status === 'DRAFT'
                  ? t('papers.draft')
                  : current.status === 'WITHDRAWN'
                    ? t('papers.withdrawn')
                    : current.status === 'CANCELLED'
                      ? t('papers.cancelled')
                      : t('papers.submitted')
              }
              statusTone={
                current.status === 'SUBMITTED'
                  ? 'ok'
                  : current.status === 'WITHDRAWN' || current.status === 'CANCELLED'
                    ? 'missing'
                    : 'wait'
              }
            >
              <div className="flex flex-wrap items-center gap-3">
                {current.status === 'DRAFT' ? (
                  <>
                    <button
                      type="button"
                      disabled={submit.isPending}
                      onClick={() => {
                        setMessage(null);
                        void submit.mutateAsync().catch((caught: unknown) => {
                          setMessage(
                            caught instanceof Error ? caught.message : t('papers.failed'),
                          );
                        });
                      }}
                      className="inline-flex min-h-12 items-center rounded-full bg-[#3d4fd4] px-6 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(61,79,212,0.35)] disabled:opacity-60"
                    >
                      {t('papers.submit')}
                    </button>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-[#c5cad6]"
                      disabled={cancelPaper.isPending}
                      onClick={() => {
                        setMessage(null);
                        void cancelPaper.mutateAsync().catch((caught: unknown) => {
                          setMessage(
                            caught instanceof Error ? caught.message : t('papers.failed'),
                          );
                        });
                      }}
                    >
                      {t('papers.cancel')}
                    </Button>
                  </>
                ) : null}
                {current.status === 'SUBMITTED' ? (
                  <>
                    <span className="inline-flex min-h-10 items-center rounded-full bg-[#2fbf71]/14 px-4 text-sm font-extrabold text-[#1c9a57]">
                      {t('papers.submitted')}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      className="border-[#c5cad6]"
                      disabled={withdraw.isPending}
                      onClick={() => {
                        setMessage(null);
                        void withdraw.mutateAsync().catch((caught: unknown) => {
                          setMessage(
                            caught instanceof Error ? caught.message : t('papers.failed'),
                          );
                        });
                      }}
                    >
                      {t('papers.withdraw')}
                    </Button>
                  </>
                ) : null}
                {current.status === 'CANCELLED' ? (
                  <span className="inline-flex min-h-10 items-center rounded-full bg-[#e35d5d]/12 px-4 text-sm font-extrabold text-[#c54545]">
                    {t('papers.cancelled')}
                  </span>
                ) : null}
                {current.status === 'WITHDRAWN' ? (
                  <span className="inline-flex min-h-10 items-center rounded-full bg-[#e35d5d]/12 px-4 text-sm font-extrabold text-[#c54545]">
                    {t('papers.withdrawn')}
                  </span>
                ) : null}
              </div>
              {stepNav(false)}
            </StagePanel>
          ) : null}
        </div>
        ) : null}
      </PaperWorkflow>
    </div>
  );
}
