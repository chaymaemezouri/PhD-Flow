import type { ConferenceRole, MembershipStatus } from '@scholarflow/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { usePaperStageExtras } from '@/components/paper-stage-actions';
import { PaperFileSlot } from '@/components/paper-file-preview';
import { useCurrentUser } from '@/features/auth/use-account';
import { useFeedback } from '@/features/feedback/feedback';
import { canSubmitToConference } from '@/features/navigation/can-submit';
import { isCreatedAdmin, isSessionChair } from '@/features/navigation/home-path';
import { PaperWorkflow, type PaperDossier } from '@/components/paper-workflow';
import { FieldSelect } from '@/components/field-select';
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
  authors: PaperAuthor[];
  manuscript: {
    originalName: string;
    sizeBytes: number;
    contentType?: string | null;
  } | null;
  decision: { outcome: string; status: string; letter?: string } | null;
  dossier?: PaperDossier;
}

interface PaperAuthor {
  firstName: string;
  lastName: string;
  email: string;
  affiliation: string;
  corresponding: boolean;
}

function authorInput(authors: PaperAuthor[]) {
  return authors.map((author) => ({
    firstName: author.firstName,
    lastName: author.lastName,
    email: author.email,
    affiliation: author.affiliation,
    corresponding: author.corresponding,
  }));
}

function moveAuthor(authors: PaperAuthor[], from: number, to: number) {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= authors.length ||
    to >= authors.length
  ) {
    return authors;
  }
  const next = [...authors];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

function ensureCorresponding(authors: PaperAuthor[]) {
  if (authors.length === 0 || authors.some((author) => author.corresponding)) {
    return authors;
  }
  return authors.map((author, index) => ({
    ...author,
    corresponding: index === 0,
  }));
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
  const feedback = useFeedback();
  const [conferenceId, setConferenceId] = useState(
    () => searchParams.get('conference') ?? '',
  );
  const [title, setTitle] = useState('');
  const [abstractText, setAbstractText] = useState('');
  const [trackId, setTrackId] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [paperKind, setPaperKind] = useState<'ABSTRACT' | 'FULL' | ''>('');
  const [authorLastName, setAuthorLastName] = useState('');
  const [authorFirstName, setAuthorFirstName] = useState('');
  const [authorAffiliation, setAuthorAffiliation] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [authorCorresponding, setAuthorCorresponding] = useState(false);
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
        account.data?.profile?.academicTitle,
      )
    ) {
      setConferenceId('');
    }
  }, [
    account.data?.platformRole,
    account.data?.profile?.academicTitle,
    conferenceId,
    memberships.data,
  ]);
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
        paperKind: paperKind === 'ABSTRACT' ? 'ABSTRACT' : 'FULL',
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
        ...(paperKind ? { paperKind } : {}),
        keywords: keywordsText
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      }),
  });

  const saveAuthors = useMutation({
    mutationFn: (authors: PaperAuthor[]) =>
      send(`/api/v1/papers/${paperId}/authors`, 'PUT', {
        authors: authorInput(ensureCorresponding(authors)),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      feedback.success(t('workflow.saved'));
    },
  });

  const addAuthor = useMutation({
    mutationFn: () => {
      const firstName = authorFirstName.trim();
      const lastName = authorLastName.trim();
      const email = authorEmail.trim();
      const affiliation = authorAffiliation.trim();
      const existing = current?.authors ?? [];
      const corresponding = authorCorresponding || existing.length === 0;
      const authors = ensureCorresponding([
        ...(corresponding
          ? existing.map((author) => ({ ...author, corresponding: false }))
          : existing),
        { firstName, lastName, email, affiliation, corresponding },
      ]);
      return send(`/api/v1/papers/${paperId}/authors`, 'PUT', {
        authors: authorInput(authors),
      });
    },
    onSuccess: async () => {
      setAuthorLastName('');
      setAuthorFirstName('');
      setAuthorAffiliation('');
      setAuthorEmail('');
      setAuthorCorresponding(false);
      await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      feedback.success(t('workflow.saved'));
    },
  });

  const submit = useMutation({
    mutationFn: () => send(`/api/v1/papers/${paperId}/submit`, 'POST', {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
      feedback.success(t('papers.submitted'));
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
      feedback.success(t('papers.withdrawn'));
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
      feedback.success(t('papers.cancelled'));
    },
  });

  function fail(caught: unknown) {
    feedback.error(caught instanceof Error ? caught.message : t('papers.failed'));
  }

  const tracks = conference.data?.tracks ?? [];
  const trackRequired = tracks.length > 0;
  const depositFiles = current?.dossier?.files ?? [];
  const hasAbstractFile = depositFiles.some((file) => file.kind === 'ABSTRACT');
  const hasRegularFile = depositFiles.some((file) => file.kind === 'MANUSCRIPT');
  const filesReady = hasAbstractFile && hasRegularFile;

  async function goNext() {
    try {
      if (step === 0 && !locked) {
        if (!paperId && !conferenceId) {
          fail(new Error(t('papers.chooseConference')));
          return;
        }
        if (trackRequired && !trackId) {
          fail(new Error(t('papers.trackRequired')));
          return;
        }
        if (!paperId) {
          pendingStep.current = 0;
          await create.mutateAsync();
          return;
        }
        await saveText.mutateAsync();
        await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
        if (!filesReady) {
          fail(new Error(t('papers.filesRequired')));
          return;
        }
      }
      setStep((value) => Math.min(value + 1, 2));
    } catch (caught: unknown) {
      fail(caught);
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
                pendingStep.current = 0;
                const action = paperId ? saveText.mutateAsync() : create.mutateAsync();
                void action
                  .then(() => feedback.success(t('workflow.saved')))
                  .catch(fail);
              }}
            >
              {t('papers.saveDraft')}
            </Button>
          ) : null}
        </div>
        {step < 2 ? (
          <Button
            type="button"
            disabled={
              create.isPending ||
              saveText.isPending ||
              (step === 0 &&
                !locked &&
                ((trackRequired && !trackId) || (Boolean(current) && !filesReady)))
            }
            onClick={() => void goNext()}
          >
            {t('papers.next')}
          </Button>
        ) : null}
      </div>
    );
  }

  async function upload(file: File, kind: 'ABSTRACT' | 'FULL') {
    setPaperKind((currentKind) => currentKind || kind);
    const body = new FormData();
    body.set('manuscript', file);
    const response = await apiFetch(
      `/api/v1/papers/${paperId}/manuscript?as=${encodeURIComponent(kind)}`,
      {
        method: 'POST',
        body,
      },
    );
    if (!response.ok) {
      feedback.error(await apiErrorMessage(response));
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
    feedback.success(t('workflow.saved'));
  }

  const sessionChairSelf = isSessionChair(account.data?.profile?.academicTitle);
  const managerWorkspace =
    account.data?.platformRole === 'SYSTEM_ADMIN' ||
    isCreatedAdmin(account.data?.profile?.academicTitle) ||
    (memberships.data?.some(
      (item) =>
        item.membershipStatus === 'ACTIVE' &&
        (item.role === 'CHAIR' ||
          item.role === 'ADMINISTRATOR' ||
          item.role === 'COMMITTEE') &&
        !sessionChairSelf,
    ) ??
      false);

  const extras = usePaperStageExtras(
    current,
    async () => {
      await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
    },
    (msg) => feedback.error(msg),
  );

  const steps = [
    t('papers.stepDetails'),
    t('papers.stepAuthors'),
    t('papers.stepSubmit'),
  ];

  const field = stageField;
  const editingExisting = Boolean(paperId);

  if (paperId && sessionChairSelf) {
    return <Navigate to={`/workspace/session-chair/${paperId}`} replace />;
  }

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
      <PaperWorkflow
        paper={current}
        authorLayout={!current && !managerWorkspace}
        authorsBusy={saveAuthors.isPending || addAuthor.isPending}
        onAuthorsChange={
          current?.status === 'WITHDRAWN' || current?.status === 'CANCELLED'
            ? undefined
            : (authors) =>
                void saveAuthors
                  .mutateAsync(
                    authors.map((author) => ({
                      firstName: author.firstName,
                      lastName: author.lastName,
                      email: author.email,
                      affiliation: author.affiliation ?? '',
                      corresponding: Boolean(author.corresponding),
                    })),
                  )
                  .catch(fail)
        }
        onScope={(accept, reason) => {
          void apiFetch(`/api/v1/papers/${paperId}/scope`, {
            method: 'POST',
            body: JSON.stringify({
              accept,
              ...(accept ? {} : { reason }),
            }),
          }).then(async (response) => {
            if (!response.ok) {
              feedback.error(await apiErrorMessage(response));
              return;
            }
            await queryClient.invalidateQueries({ queryKey: ['paper', paperId] });
            feedback.success(t('workflow.saved'));
          });
        }}
        extras={extras}
      >
        {!current || current.dossier?.isAuthor ? (
        locked && current ? null : (
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
            className="grid grid-cols-3 gap-1.5 rounded-2xl border border-[#d8dce6] bg-[#f6f7fb] p-1.5"
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
                    <FieldSelect
                      className={field}
                      value={conferenceId}
                      onChange={setConferenceId}
                      placeholder={t('papers.chooseConference')}
                      options={(memberships.data ?? [])
                        .filter((item) =>
                          canSubmitToConference(
                            account.data?.platformRole === 'SYSTEM_ADMIN',
                            memberships.data ?? [],
                            item,
                            account.data?.profile?.academicTitle,
                          ),
                        )
                        .map((item) => ({ value: item.id, label: item.name }))}
                    />
                  </label>
                ) : null}
                <div className="sm:col-span-2">
                  <p className="text-xs font-extrabold text-[#5c6578]">
                    {t('papers.kind')}
                  </p>
                  <p className="mt-0.5 text-xs font-semibold text-[#8b909a]">
                    {t('papers.kindHint')}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(
                      [
                        ['ABSTRACT', 'dossier.asAbstract'],
                        ['FULL', 'dossier.asRegular'],
                      ] as const
                    ).map(([kind, label]) => {
                      const files = current?.dossier?.files ?? [];
                      const hasFile = files.some((file) =>
                        kind === 'ABSTRACT'
                          ? file.kind === 'ABSTRACT'
                          : file.kind === 'MANUSCRIPT',
                      );
                      const active = hasFile || paperKind === kind;
                      return (
                        <button
                          key={kind}
                          type="button"
                          disabled={locked}
                          aria-pressed={active}
                          onClick={() =>
                            setPaperKind((currentKind) =>
                              currentKind === kind ? '' : kind,
                            )
                          }
                          className={`rounded-full px-3 py-1.5 text-sm font-extrabold ${
                            active
                              ? 'bg-[#5d74ff]/15 text-[#3d4fd4]'
                              : 'bg-[#f4f7ff] text-[#5c6578]'
                          }`}
                        >
                          {t(label)}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="text-xs font-extrabold text-[#5c6578]">
                  {t('papers.track')}
                  {trackRequired ? (
                    <span className="ml-1 text-[#c54545]">*</span>
                  ) : null}
                  <FieldSelect
                    className={field}
                    value={trackId}
                    disabled={locked || !tracksOf}
                    required={trackRequired}
                    onChange={setTrackId}
                    placeholder={t('papers.chooseTrack')}
                    options={tracks.map((track) => ({
                      value: track.id,
                      label: `${track.code} · ${track.name}`,
                    }))}
                  />
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
              <div className="mt-4 space-y-3">
                <p className="text-sm font-semibold text-[#5c6578]">
                  {t('papers.filesRequired')}
                </p>
                {current ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {(
                      [
                        ['ABSTRACT', 'dossier.asAbstract'],
                        ['FULL', 'dossier.asRegular'],
                      ] as const
                    ).map(([kind, label]) => {
                      const fileKind = kind === 'ABSTRACT' ? 'ABSTRACT' : 'MANUSCRIPT';
                      const file =
                        current.dossier?.files.find((item) => item.kind === fileKind) ??
                        null;
                      const shown = file
                        ? { ...file, stateLabel: t(label) }
                        : null;
                      return (
                        <PaperFileSlot
                          key={kind}
                          paperId={current.id}
                          title={`${t(label)} *`}
                          hint={t('papers.fileHint')}
                          kind={fileKind}
                          file={shown}
                          uploadLabel={t('papers.uploadManuscript')}
                          onUpload={
                            locked ? undefined : (next) => void upload(next, kind)
                          }
                          done={Boolean(shown)}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm font-semibold text-[#8b909a]">
                    {t('papers.needDraft')}
                  </p>
                )}
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
              <ol className="grid gap-2">
                {current.authors.map((author, index) => {
                  const total = current.authors.length;
                  const busy = saveAuthors.isPending || addAuthor.isPending;
                  return (
                    <li
                      key={`${author.email}-${index}`}
                      className="flex flex-col gap-3 rounded-xl border border-[#d8dce6] bg-white px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#eef2ff] text-xs font-extrabold text-[#3d4fd4]">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-extrabold text-[#1c2744]">
                            {author.lastName} {author.firstName}
                          </p>
                          {author.affiliation ? (
                            <p className="mt-0.5 text-xs font-semibold text-[#5c6578]">
                              {author.affiliation}
                            </p>
                          ) : null}
                          <p className="mt-0.5 break-all text-xs font-semibold text-[#8b909a]">
                            {author.email}
                          </p>
                          {author.corresponding ? (
                            <span className="mt-2 inline-block rounded-full bg-[#eef2ff] px-2 py-0.5 text-[11px] font-extrabold text-[#3d4fd4]">
                              {t('papers.corresponding')}
                            </span>
                          ) : locked ? null : (
                            <button
                              type="button"
                              disabled={busy}
                              className="mt-2 text-[11px] font-extrabold text-[#3d4fd4] hover:underline"
                              onClick={() =>
                                void saveAuthors
                                  .mutateAsync(
                                    current.authors.map((item, itemIndex) => ({
                                      ...item,
                                      corresponding: itemIndex === index,
                                    })),
                                  )
                                  .catch(fail)
                              }
                            >
                              {t('papers.markCorresponding')}
                            </button>
                          )}
                        </div>
                      </div>
                      {locked ? null : (
                        <div
                          className="flex shrink-0 items-center gap-1"
                          role="group"
                          aria-label={t('papers.authorOrder')}
                        >
                          {total > 1 ? (
                            <>
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="border-[#c5cad6]"
                                disabled={busy || index === 0}
                                aria-label={t('papers.moveUp')}
                                title={t('papers.moveUp')}
                                onClick={() =>
                                  void saveAuthors
                                    .mutateAsync(
                                      moveAuthor(current.authors, index, index - 1),
                                    )
                                    .catch(fail)
                                }
                              >
                                <ArrowUp className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                size="icon"
                                variant="outline"
                                className="border-[#c5cad6]"
                                disabled={busy || index === total - 1}
                                aria-label={t('papers.moveDown')}
                                title={t('papers.moveDown')}
                                onClick={() =>
                                  void saveAuthors
                                    .mutateAsync(
                                      moveAuthor(current.authors, index, index + 1),
                                    )
                                    .catch(fail)
                                }
                              >
                                <ArrowDown className="size-4" />
                              </Button>
                            </>
                          ) : null}
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="border-[#c5cad6] text-[#c54545]"
                            disabled={busy}
                            aria-label={t('papers.removeAuthor')}
                            title={t('papers.removeAuthor')}
                            onClick={() =>
                              void saveAuthors
                                .mutateAsync(
                                  current.authors.filter(
                                    (_, itemIndex) => itemIndex !== index,
                                  ),
                                )
                                .catch(fail)
                            }
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              {locked ? null : (
                <form
                  className="mt-3 grid gap-2 sm:grid-cols-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addAuthor.mutateAsync().catch(fail);
                  }}
                >
                  <label className="text-xs font-extrabold text-[#5c6578]">
                    {t('auth.lastName')}
                    <Input
                      className={field}
                      value={authorLastName}
                      required
                      onChange={(event) => setAuthorLastName(event.target.value)}
                    />
                  </label>
                  <label className="text-xs font-extrabold text-[#5c6578]">
                    {t('auth.firstName')}
                    <Input
                      className={field}
                      value={authorFirstName}
                      required
                      onChange={(event) => setAuthorFirstName(event.target.value)}
                    />
                  </label>
                  <label className="text-xs font-extrabold text-[#5c6578]">
                    {t('papers.affiliation')}
                    <Input
                      className={field}
                      value={authorAffiliation}
                      required
                      onChange={(event) => setAuthorAffiliation(event.target.value)}
                    />
                  </label>
                  <label className="text-xs font-extrabold text-[#5c6578]">
                    {t('auth.email')}
                    <Input
                      className={field}
                      type="email"
                      value={authorEmail}
                      required
                      onChange={(event) => setAuthorEmail(event.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs font-extrabold text-[#5c6578]">
                    <input
                      type="checkbox"
                      checked={authorCorresponding || current.authors.length === 0}
                      onChange={(event) =>
                        setAuthorCorresponding(event.target.checked)
                      }
                    />
                    {t('papers.corresponding')}
                  </label>
                  <div className="flex items-end justify-end">
                    <Button
                      type="submit"
                      disabled={
                        addAuthor.isPending ||
                        !authorLastName.trim() ||
                        !authorFirstName.trim() ||
                        !authorAffiliation.trim() ||
                        !authorEmail.trim()
                      }
                    >
                      {t('papers.addAuthor')}
                    </Button>
                  </div>
                </form>
              )}
              {stepNav(false)}
            </StagePanel>
          ) : null}

          {step === 2 && current ? (
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
                    {trackRequired && !trackId ? (
                      <p className="w-full text-sm font-bold text-[#c54545]" role="alert">
                        {t('papers.trackRequired')}
                      </p>
                    ) : null}
                    {!filesReady ? (
                      <p className="w-full text-sm font-bold text-[#c54545]" role="alert">
                        {t('papers.filesRequired')}
                      </p>
                    ) : null}
                    <button
                      type="button"
                      disabled={
                        submit.isPending ||
                        (trackRequired && !trackId) ||
                        !filesReady
                      }
                      onClick={() => {
                        void submit.mutateAsync().catch(fail);
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
                        void cancelPaper.mutateAsync().catch(fail);
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
                        void withdraw.mutateAsync().catch(fail);
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
        )
        ) : null}
      </PaperWorkflow>
    </div>
  );
}
