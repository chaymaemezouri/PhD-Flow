import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { PaperFileSlot, PaperFilesStrip } from '@/components/paper-file-preview';
import type { PaperDossier } from '@/components/paper-workflow';
import { StagePanel, stageField } from '@/components/stage-panel';
import { Button } from '@/components/ui/button';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface StagePaper {
  id: string;
  conferenceId: string;
  createdById?: string | null;
  status: string;
  decision: { outcome: string; status: string; letter?: string } | null;
  dossier?: PaperDossier;
}

export function usePaperStageExtras(
  paper: StagePaper | undefined,
  onChanged: () => Promise<void>,
  onError: (message: string) => void,
): Partial<Record<string, ReactNode>> {
  const { t } = useTranslation();
  const [modelOpen, setModelOpen] = useState(false);
  const open =
    paper?.decision?.status === 'PUBLISHED' && paper.decision.outcome === 'ACCEPTED';
  const needsRevision =
    paper?.decision?.status === 'PUBLISHED' &&
    (paper.decision.outcome === 'CONDITIONALLY_ACCEPTED' ||
      paper.decision.outcome === 'REVISION_REQUIRED');
  const template = useQuery({
    queryKey: ['copyright-template', paper?.conferenceId],
    enabled: Boolean(paper && open),
    queryFn: async () => {
      const response = await apiFetch(
        `/api/v1/conferences/${paper!.conferenceId}/copyright-template`,
      );
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<{ subject: string; body: string }>;
    },
  });
  const chairs = useQuery({
    queryKey: ['session-chairs', paper?.conferenceId],
    enabled: Boolean(paper?.dossier?.canManage && open),
    queryFn: async () => {
      const response = await apiFetch(
        `/api/v1/conferences/${paper!.conferenceId}/session-chairs`,
      );
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<
        { userId: string; firstName: string; lastName: string }[]
      >;
    },
  });
  const reviewers = useQuery({
    queryKey: ['reviewers', paper?.conferenceId],
    enabled: Boolean(
      paper?.dossier?.canManage && paper.dossier.scopeStatus === 'ACCEPTED',
    ),
    queryFn: async () => {
      const response = await apiFetch(
        `/api/v1/conferences/${paper!.conferenceId}/reviewers`,
      );
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<
        { userId: string; firstName: string; lastName: string }[]
      >;
    },
  });

  if (!paper?.dossier) {
    return {};
  }

  const dossier = paper.dossier;
  const registeredNow =
    dossier.registration?.status === 'VERIFIED' ||
    dossier.registration?.paymentStatus === 'VERIFIED';
  const manager = dossier.canManage;
  const author = Boolean(dossier.isAuthor);
  const sessionChair = dossier.sessionChairs.some((item) => item.mine);
  const reviewed = dossier.reviews.some((item) => item.recommendation);
  const mine = dossier.reviews.find((item) => item.mine);

  async function send(path: string, body?: BodyInit, json = false) {
    const response = await apiFetch(path, {
      method: 'POST',
      body: json ? JSON.stringify(body ?? {}) : body,
    });
    if (!response.ok) {
      onError(await apiErrorMessage(response));
      return;
    }
    await onChanged();
  }

  function upload(path: string, file: File) {
    const body = new FormData();
    body.set('file', file);
    void send(path, body);
  }

  async function download(path: string, name: string) {
    const response = await apiFetch(path);
    if (!response.ok) {
      onError(await apiErrorMessage(response));
      return;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  const actions: Partial<Record<string, ReactNode>> = {};

  const myReviewActive =
    mine &&
    (mine.status === 'INVITED' ||
      mine.status === 'ACCEPTED' ||
      mine.status === 'IN_PROGRESS' ||
      mine.status === 'OVERDUE');

  if (manager && dossier.scopeStatus === 'ACCEPTED') {
    actions.review = (
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <StagePanel
          title={t('reviews.assignTitle')}
          hint={t('dossier.assignReviewerHint')}
          status={
            dossier.reviews.length > 0 ? t('dossier.assigned') : t('dossier.notAssigned')
          }
          statusTone={dossier.reviews.length > 0 ? 'ok' : 'missing'}
        >
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const reviewerId = String(
                new FormData(event.currentTarget).get('reviewerId'),
              );
              void send(
                `/api/v1/papers/${paper.id}/assignments`,
                { reviewerId } as unknown as BodyInit,
                true,
              );
            }}
          >
            <label className="min-w-0 flex-1 text-xs font-extrabold text-[#5c6578]">
              {t('reviews.chooseReviewer')}
              <select name="reviewerId" required className={stageField} defaultValue="">
                <option value="">{t('reviews.chooseReviewer')}</option>
                {reviewers.data?.map((person) => (
                  <option key={person.userId} value={person.userId}>
                    {person.firstName} {person.lastName}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit">{t('reviews.assignTitle')}</Button>
          </form>
          {dossier.reviews.length > 0 ? (
            <ul className="mt-3 grid gap-1.5">
              {dossier.reviews.map((item) => (
                <li
                  key={item.id}
                  className="rounded-xl border border-[#d8dce6] bg-white px-3 py-2 text-xs font-bold text-[#5c6578]"
                >
                  {(item.reviewer || t('dossier.reviewActor')) +
                    (item.recommendation ? ` · ${item.recommendation}` : '')}
                </li>
              ))}
            </ul>
          ) : null}
        </StagePanel>
        {myReviewActive ? (
          <StagePanel
            title={t('dossier.myReview')}
            hint={t('reviews.formOnReviewsPage')}
            status={
              mine!.status === 'INVITED' ? t('home.toAccept') : t('home.inProgress')
            }
            statusTone={mine!.status === 'INVITED' ? 'wait' : 'ok'}
          >
            {mine!.status === 'INVITED' ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() =>
                    void send(
                      `/api/v1/assignments/${mine!.id}/accept`,
                      {} as BodyInit,
                      true,
                    )
                  }
                >
                  {t('reviews.accept')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#c5cad6]"
                  onClick={() =>
                    void send(
                      `/api/v1/assignments/${mine!.id}/decline`,
                      { reason: '' } as unknown as BodyInit,
                      true,
                    )
                  }
                >
                  {t('reviews.decline')}
                </Button>
              </div>
            ) : (
              <a
                href={`/workspace/reviews#${mine!.id}`}
                className="inline-flex min-h-10 items-center rounded-full bg-[#3d4fd4] px-4 text-sm font-extrabold text-white no-underline"
              >
                {t('reviews.continueOnReviews')}
              </a>
            )}
          </StagePanel>
        ) : null}
      </div>
    );
  } else if (myReviewActive) {
    actions.review = (
      <div className="mt-4">
        <StagePanel
          title={t('dossier.myReview')}
          hint={t('reviews.formOnReviewsPage')}
          status={mine!.status === 'INVITED' ? t('home.toAccept') : t('home.inProgress')}
          statusTone={mine!.status === 'INVITED' ? 'wait' : 'ok'}
        >
          {mine!.status === 'INVITED' ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() =>
                  void send(
                    `/api/v1/assignments/${mine!.id}/accept`,
                    {} as BodyInit,
                    true,
                  )
                }
              >
                {t('reviews.accept')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-[#c5cad6]"
                onClick={() =>
                  void send(
                    `/api/v1/assignments/${mine!.id}/decline`,
                    { reason: '' } as unknown as BodyInit,
                    true,
                  )
                }
              >
                {t('reviews.decline')}
              </Button>
            </div>
          ) : (
            <a
              href={`/workspace/reviews#${mine!.id}`}
              className="inline-flex min-h-10 items-center rounded-full bg-[#3d4fd4] px-4 text-sm font-extrabold text-white no-underline"
            >
              {t('reviews.continueOnReviews')}
            </a>
          )}
        </StagePanel>
      </div>
    );
  }

  if (manager && paper.status === 'SUBMITTED' && reviewed) {
    actions.decision = (
      <div className="mt-4 grid gap-4">
        <StagePanel
          title={t('workflow.decide')}
          hint={t('dossier.reviewGoesToAuthor')}
          status={
            open
              ? t('dossier.withoutMods')
              : needsRevision
                ? paper.decision?.outcome === 'REVISION_REQUIRED'
                  ? t('dossier.majorMods')
                  : t('dossier.minorMods')
                : paper.decision?.outcome === 'REJECTED'
                  ? t('dossier.notAccepted')
                  : paper.decision
                    ? t('dossier.completed')
                    : t('dossier.waiting')
          }
          statusTone={
            open ? 'ok' : paper.decision?.outcome === 'REJECTED' ? 'missing' : 'wait'
          }
        >
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void send(
                `/api/v1/papers/${paper.id}/decision`,
                {
                  outcome: String(form.get('outcome')),
                  letter: String(form.get('letter')),
                  publish: form.get('publish') === 'on',
                } as unknown as BodyInit,
                true,
              );
            }}
          >
            <label className="text-xs font-extrabold text-[#5c6578]">
              {t('workflow.decide')}
              <select
                name="outcome"
                className={stageField}
                defaultValue={paper.decision?.outcome ?? 'ACCEPTED'}
              >
                <option value="ACCEPTED">{t('dossier.withoutMods')}</option>
                <option value="CONDITIONALLY_ACCEPTED">{t('dossier.minorMods')}</option>
                <option value="REVISION_REQUIRED">{t('dossier.majorMods')}</option>
                <option value="REJECTED">{t('dossier.notAccepted')}</option>
              </select>
            </label>
            <label className="text-xs font-extrabold text-[#5c6578]">
              {t('workflow.letter')}
              <textarea
                name="letter"
                required
                minLength={10}
                defaultValue={paper.decision?.letter ?? ''}
                className={`${stageField} min-h-24`}
              />
            </label>
            <label className="flex items-center gap-2 text-sm font-extrabold text-[#1c2744]">
              <input
                name="publish"
                type="checkbox"
                defaultChecked
                className="size-4 accent-[#5d74ff]"
              />
              {t('workflow.publish')}
            </label>
            <div>
              <Button type="submit">
                {paper.decision ? t('dossier.reviseDecision') : t('workflow.decide')}
              </Button>
            </div>
          </form>
        </StagePanel>
        {needsRevision && (dossier.remarks?.length ?? 0) > 0 ? (
          <RemarksChecklist
            paperId={paper.id}
            remarks={dossier.remarks ?? []}
            path="remarks"
            manager
            onChanged={onChanged}
            onError={onError}
          />
        ) : null}
      </div>
    );
  }

  if (needsRevision && author) {
    actions.decision = (
      <div className="mt-4 grid gap-4">
        {(dossier.remarks?.length ?? 0) > 0 ? (
          <RemarksChecklist
            paperId={paper.id}
            remarks={dossier.remarks ?? []}
            path="remarks"
            manager={false}
            onChanged={onChanged}
            onError={onError}
          />
        ) : null}
        <PaperFileSlot
          paperId={paper.id}
          title={t('workflow.files.REVISION')}
          hint={t('dossier.revisionHint')}
          kind="REVISION"
          file={dossier.files.find((item) => item.kind === 'REVISION') ?? null}
          uploadLabel={t('dossier.uploadRevision')}
          onUpload={(file) => upload(`/api/v1/papers/${paper.id}/revision`, file)}
          done={dossier.files.some((item) => item.kind === 'REVISION')}
        />
      </div>
    );
  }

  // Same full workflow for every role; action panels only for who can act.
  if (open && (author || manager)) {
    actions.registration = (
      <div className="mt-4">
        <StagePanel
          title={t('dossier.registration')}
          hint={t('dossier.registrationSidebarHint')}
        >
          <Button asChild>
            <Link to={`/workspace/registration?paper=${paper.id}`}>
              {t('dossier.openRegistrationPage')}
            </Link>
          </Button>
        </StagePanel>
      </div>
    );
  }

  if (open) {
    const slidesStatus = dossier.slidesStatus ?? 'LOCKED';
    const presentationReady =
      registeredNow ||
      slidesStatus === 'OPEN' ||
      slidesStatus === 'DEPOSITED' ||
      slidesStatus === 'NEEDS_MODS' ||
      slidesStatus === 'WILL_DEPOSIT' ||
      slidesStatus === 'VALIDATED' ||
      Boolean(dossier.schedule) ||
      sessionChair;
    const canUploadSlides =
      author &&
      (slidesStatus === 'OPEN' ||
        slidesStatus === 'DEPOSITED' ||
        slidesStatus === 'NEEDS_MODS' ||
        slidesStatus === 'WILL_DEPOSIT');
    const slidesPendingReview =
      slidesStatus === 'DEPOSITED' || slidesStatus === 'WILL_DEPOSIT';
    const canActOnPresentation = author || manager || sessionChair;

    if (presentationReady && canActOnPresentation) {
      const chairRemarksBlock =
        dossier.presented &&
        dossier.schedule &&
        (dossier.schedule.chairRemarks || dossier.sessionComment) ? (
          <div className="rounded-xl border border-[#2fbf71]/30 bg-[#e8f8ef] px-3 py-3">
            <p className="text-xs font-extrabold uppercase tracking-wide text-[#1c9a57]">
              {t('dossier.chairRemarks')}
            </p>
            <p className="mt-1 text-sm font-semibold text-[#1c2744]">
              {dossier.schedule.chairRemarks || dossier.sessionComment}
            </p>
            {dossier.schedule.score !== null ? (
              <p className="mt-1 text-xs font-extrabold text-[#5c6578]">
                {t('dossier.chairScore')}: {dossier.schedule.score}/10
              </p>
            ) : null}
          </div>
        ) : null;

      const chairFollowUp =
        sessionChair &&
        dossier.schedule &&
        !dossier.presented ? (
          <StagePanel
            title={t('dossier.chairFollowUp')}
            hint={t('dossier.chairFollowUpHint')}
            status={t('dossier.presentationScheduled')}
            statusTone="wait"
          >
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const scoreRaw = String(form.get('score') ?? '');
                void send(
                  `/api/v1/presentations/${dossier.schedule!.presentationId}/assessment`,
                  {
                    score: scoreRaw ? Number(scoreRaw) : undefined,
                    comment: String(form.get('comment') ?? ''),
                    presented: true,
                  } as unknown as BodyInit,
                  true,
                );
              }}
            >
              <label className="text-xs font-extrabold text-[#5c6578]">
                {t('dossier.chairScore')}
                <input
                  name="score"
                  type="number"
                  min={0}
                  max={10}
                  step={1}
                  className={stageField}
                />
              </label>
              <label className="text-xs font-extrabold text-[#5c6578]">
                {t('dossier.chairRemarks')}
                <textarea
                  name="comment"
                  className={`${stageField} min-h-20`}
                  placeholder={t('dossier.chairRemarksPlaceholder')}
                />
              </label>
              <div>
                <Button type="submit">{t('dossier.markPresented')}</Button>
              </div>
            </form>
          </StagePanel>
        ) : null;

      if (!(author || manager || chairFollowUp || chairRemarksBlock)) {
        // Reviewer / other roles: full workflow info only, no presentation controls.
      } else {
      actions.presentation = (
        <div className="mt-4 grid gap-4">
          {chairRemarksBlock}
          {chairFollowUp}

          {author || manager ? (
            <StagePanel
              title={t('dossier.presentation')}
              hint={t('dossier.presentationHint')}
            >
              <PaperFileSlot
                paperId={paper.id}
                title={t('dossier.slides')}
                hint={
                  slidesStatus === 'NEEDS_MODS'
                    ? t('dossier.slidesModsHint')
                    : t('dossier.slidesHint')
                }
                kind="SLIDES"
                file={dossier.files.find((item) => item.kind === 'SLIDES') ?? null}
                accept=".ppt,.pptx,application/pdf"
                uploadLabel={
                  dossier.slides ? t('dossier.replaceSlides') : t('dossier.sendSlides')
                }
                onUpload={
                  canUploadSlides
                    ? (file) => upload(`/api/v1/papers/${paper.id}/slides`, file)
                    : undefined
                }
                done={dossier.slides}
              />
            </StagePanel>
          ) : null}

          {(author || manager) &&
          (slidesStatus === 'NEEDS_MODS' || slidesStatus === 'WILL_DEPOSIT') &&
          (dossier.slidesRemarks?.length ?? 0) > 0 ? (
            <RemarksChecklist
              paperId={paper.id}
              remarks={dossier.slidesRemarks ?? []}
              path="presentation-remarks"
              manager={manager}
              onChanged={onChanged}
              onError={onError}
            />
          ) : null}

          {manager && slidesPendingReview ? (
            <StagePanel
              title={t('dossier.presentationReview')}
              hint={t('dossier.presentationReviewHint')}
              status={t('dossier.waiting')}
              statusTone="wait"
            >
              <form
                className="grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  void send(
                    `/api/v1/papers/${paper.id}/slides/decision`,
                    {
                      outcome: String(form.get('outcome')),
                      note: String(form.get('note') ?? ''),
                    } as unknown as BodyInit,
                    true,
                  );
                }}
              >
                <label className="text-xs font-extrabold text-[#5c6578]">
                  {t('dossier.presentationReview')}
                  <select name="outcome" className={stageField} defaultValue="VALIDATED">
                    <option value="VALIDATED">{t('dossier.presentationValidated')}</option>
                    <option value="NEEDS_MODS">{t('dossier.presentationNotComfort')}</option>
                  </select>
                </label>
                <label className="text-xs font-extrabold text-[#5c6578]">
                  {t('dossier.presentationNote')}
                  <textarea
                    name="note"
                    className={`${stageField} min-h-20`}
                    placeholder={t('dossier.presentationNoteHint')}
                  />
                </label>
                <div>
                  <Button type="submit">{t('dossier.savePresentationDecision')}</Button>
                </div>
              </form>
            </StagePanel>
          ) : null}

          {manager && chairs.data && chairs.data.length > 0 ? (
            <StagePanel
              title={t('dossier.assignChair')}
              hint={t('dossier.chooseChair')}
              status={
                dossier.sessionChairs.length > 0
                  ? dossier.sessionChairs.map((item) => item.name).join(', ')
                  : t('dossier.noChair')
              }
              statusTone={dossier.sessionChairs.length > 0 ? 'ok' : 'wait'}
            >
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const userId = String(
                    new FormData(event.currentTarget).get('userId') ?? '',
                  );
                  void send(
                    `/api/v1/papers/${paper.id}/session-chair`,
                    { userId } as unknown as BodyInit,
                    true,
                  );
                }}
              >
                <label className="min-w-[12rem] flex-1 text-xs font-extrabold text-[#5c6578]">
                  {t('dossier.sessionChair')}
                  <select name="userId" required className={stageField}>
                    {chairs.data.map((item) => (
                      <option key={item.userId} value={item.userId}>
                        {item.firstName} {item.lastName}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit">{t('dossier.assignChair')}</Button>
              </form>
            </StagePanel>
          ) : null}
        </div>
      );
      }
    }

    if (slidesStatus === 'VALIDATED' && (author || manager)) {
    const cameraStatus = dossier.cameraReadyStatus ?? 'LOCKED';
    const cameraReadyStage =
      cameraStatus === 'OPEN' ||
      cameraStatus === 'DEPOSITED' ||
      cameraStatus === 'NEEDS_MODS' ||
      cameraStatus === 'WILL_DEPOSIT' ||
      cameraStatus === 'VALIDATED' ||
      cameraStatus === 'LOCKED';
    const canUploadCamera =
      author &&
      (cameraStatus === 'OPEN' ||
        cameraStatus === 'DEPOSITED' ||
        cameraStatus === 'NEEDS_MODS' ||
        cameraStatus === 'WILL_DEPOSIT' ||
        cameraStatus === 'LOCKED');
    const cameraPendingReview =
      cameraStatus === 'DEPOSITED' || cameraStatus === 'WILL_DEPOSIT';

    if (cameraReadyStage) {
    actions.camera = (
      <div className="mt-4 space-y-3">
        <StagePanel title={t('dossier.camera')} hint={t('dossier.cameraHint')}>
          <div className="grid gap-3 lg:grid-cols-2">
            <PaperFileSlot
              paperId={paper.id}
              title={t('dossier.cameraWord')}
              hint={
                cameraStatus === 'NEEDS_MODS'
                  ? t('dossier.cameraModsHint')
                  : t('dossier.cameraWordHint')
              }
              kind="EDITABLE"
              file={dossier.files.find((item) => item.kind === 'EDITABLE') ?? null}
              accept=".pdf,.doc,.docx,.tex,.zip"
              uploadLabel={t('dossier.uploadEditable')}
              onUpload={
                canUploadCamera
                  ? (file) => upload(`/api/v1/papers/${paper.id}/editable`, file)
                  : undefined
              }
              done={dossier.files.some((item) => item.kind === 'EDITABLE')}
            />
            <PaperFileSlot
              paperId={paper.id}
              title={t('dossier.cameraPdf')}
              hint={
                cameraStatus === 'NEEDS_MODS'
                  ? t('dossier.cameraModsHint')
                  : t('dossier.cameraPdfHint')
              }
              kind="CAMERA_READY"
              file={dossier.files.find((item) => item.kind === 'CAMERA_READY') ?? null}
              uploadLabel={t('dossier.uploadPdf')}
              onUpload={
                canUploadCamera
                  ? (file) => upload(`/api/v1/papers/${paper.id}/camera-ready`, file)
                  : undefined
              }
              done={dossier.files.some((item) => item.kind === 'CAMERA_READY')}
            />
          </div>
        </StagePanel>

        {(cameraStatus === 'NEEDS_MODS' || cameraStatus === 'WILL_DEPOSIT') &&
        (dossier.cameraReadyRemarks?.length ?? 0) > 0 ? (
          <RemarksChecklist
            paperId={paper.id}
            remarks={dossier.cameraReadyRemarks ?? []}
            path="camera-ready-remarks"
            manager={manager}
            onChanged={onChanged}
            onError={onError}
          />
        ) : null}

        {manager && cameraPendingReview ? (
          <StagePanel
            title={t('dossier.cameraReview')}
            hint={t('dossier.cameraReviewHint')}
            status={t('dossier.waiting')}
            statusTone="wait"
          >
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void send(
                  `/api/v1/papers/${paper.id}/camera-ready/decision`,
                  {
                    outcome: String(form.get('outcome')),
                    note: String(form.get('note') ?? ''),
                  } as unknown as BodyInit,
                  true,
                );
              }}
            >
              <label className="text-xs font-extrabold text-[#5c6578]">
                {t('dossier.cameraReview')}
                <select name="outcome" className={stageField} defaultValue="VALIDATED">
                  <option value="VALIDATED">{t('dossier.cameraValidated')}</option>
                  <option value="NEEDS_MODS">{t('dossier.cameraNotComfort')}</option>
                </select>
              </label>
              <label className="text-xs font-extrabold text-[#5c6578]">
                {t('dossier.cameraNote')}
                <textarea
                  name="note"
                  className={`${stageField} min-h-20`}
                  placeholder={t('dossier.cameraNoteHint')}
                />
              </label>
              <div>
                <Button type="submit">{t('dossier.saveCameraDecision')}</Button>
              </div>
            </form>
          </StagePanel>
        ) : null}

        {manager ? (
          <StagePanel
            title={t('dossier.cameraTemplate')}
            hint={t('dossier.cameraTemplateHint')}
            status={
              dossier.templateValidated ? t('dossier.ready') : t('dossier.waiting')
            }
            statusTone={dossier.templateValidated ? 'ok' : 'wait'}
          >
            <Button
              type="button"
              variant="outline"
              className="border-[#c5cad6]"
              onClick={() =>
                void send(
                  `/api/v1/papers/${paper.id}/template/validate`,
                  {} as BodyInit,
                  true,
                )
              }
            >
              {t('workflow.templateOk')}
            </Button>
          </StagePanel>
        ) : null}
      </div>
    );
    }

    const similarityStatus = dossier.similarityStatus ?? 'LOCKED';
    const similarityReady =
      cameraStatus === 'VALIDATED' ||
      similarityStatus === 'OPEN' ||
      similarityStatus === 'DEPOSITED' ||
      similarityStatus === 'VALIDATED';
    const canUploadSimilarity =
      author &&
      (similarityStatus === 'OPEN' ||
        similarityStatus === 'DEPOSITED' ||
        similarityStatus === 'LOCKED');
    const similarityPending =
      similarityStatus === 'DEPOSITED' ||
      (Boolean(dossier.similarity) &&
        dossier.files.some((item) => item.kind === 'SIMILARITY') &&
        !dossier.similarity?.verified &&
        similarityStatus !== 'VALIDATED');

    if (similarityReady) {
      actions.similarity = (
        <div className="mt-4 space-y-3">
          <StagePanel
            title={t('dossier.similarity')}
            hint={t('dossier.similarityStageHint')}
          >
            <div className="grid gap-3 lg:grid-cols-2">
              <PaperFileSlot
                paperId={paper.id}
                title={t('dossier.similarityReport')}
                hint={t('dossier.similarityHint')}
                kind="SIMILARITY"
                file={dossier.files.find((item) => item.kind === 'SIMILARITY') ?? null}
                uploadLabel={t('dossier.uploadSimilarity')}
                onUpload={
                  canUploadSimilarity
                    ? (file) =>
                        upload(`/api/v1/papers/${paper.id}/similarity-report`, file)
                    : undefined
                }
                done={dossier.files.some((item) => item.kind === 'SIMILARITY')}
              />
              <StagePanel
                title={t('dossier.cameraSimilarity')}
                hint={t('dossier.similarityPercentHint')}
              >
                {author &&
                (similarityStatus === 'OPEN' ||
                  similarityStatus === 'DEPOSITED' ||
                  similarityStatus === 'LOCKED') ? (
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const percentage = Number(
                        new FormData(event.currentTarget).get('percentage'),
                      );
                      void send(
                        `/api/v1/papers/${paper.id}/similarity`,
                        { percentage, note: '' } as unknown as BodyInit,
                        true,
                      );
                    }}
                  >
                    <label className="min-w-[8rem] flex-1 text-xs font-extrabold text-[#5c6578]">
                      {t('dossier.similarityValue')}
                      <input
                        name="percentage"
                        type="number"
                        min={0}
                        max={19.9}
                        step="0.1"
                        required
                        defaultValue={dossier.similarity?.percentage ?? ''}
                        className={stageField}
                      />
                    </label>
                    <Button type="submit">{t('workflow.save')}</Button>
                  </form>
                ) : null}
              </StagePanel>
            </div>
          </StagePanel>

          {manager && similarityPending ? (
            <StagePanel
              title={t('dossier.similarityReview')}
              hint={t('dossier.similarityReviewHint')}
              status={t('dossier.similarityUnderCheck')}
              statusTone="wait"
            >
              <Button
                type="button"
                onClick={() =>
                  void send(
                    `/api/v1/papers/${paper.id}/similarity/verify`,
                    {} as BodyInit,
                    true,
                  )
                }
              >
                {t('dossier.similarityValidated')}
              </Button>
            </StagePanel>
          ) : null}
        </div>
      );
    }

    const copyrightStage = dossier.copyrightStageStatus ?? 'LOCKED';
    const copyrightReady =
      similarityStatus === 'VALIDATED' ||
      Boolean(dossier.similarity?.verified) ||
      copyrightStage === 'OPEN' ||
      copyrightStage === 'DEPOSITED' ||
      copyrightStage === 'VALIDATED';
    const canUploadCopyright =
      author &&
      (copyrightStage === 'OPEN' ||
        copyrightStage === 'DEPOSITED' ||
        copyrightStage === 'LOCKED' ||
        dossier.copyrightStatus === 'REJECTED');
    const copyrightPending =
      copyrightStage === 'DEPOSITED' ||
      (dossier.copyrightStatus === 'PENDING' &&
        dossier.files.some((item) => item.kind === 'COPYRIGHT') &&
        copyrightStage !== 'VALIDATED');

    if (copyrightReady) {
    actions.copyright = (
      <div className="mt-4 space-y-3">
        <StagePanel
          title={t('dossier.copyright')}
          hint={t('dossier.copyrightStageHint')}
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <PaperFileSlot
              paperId={paper.id}
              title={t('dossier.copyright')}
              hint={t('dossier.copyrightHint')}
              kind="COPYRIGHT"
              file={dossier.files.find((item) => item.kind === 'COPYRIGHT') ?? null}
              uploadLabel={t('dossier.uploadCopyright')}
              onUpload={
                canUploadCopyright
                  ? (file) => upload(`/api/v1/papers/${paper.id}/copyright`, file)
                  : undefined
              }
              done={
                copyrightStage === 'VALIDATED' ||
                dossier.copyrightStatus === 'VALIDATED' ||
                Boolean(dossier.files.find((item) => item.kind === 'COPYRIGHT'))
              }
            />
            <StagePanel
              title={t('workflow.model')}
              hint={t('dossier.copyrightModelHint')}
            >
              {template.data ? (
                <div className="space-y-2">
                  <button
                    type="button"
                    className="text-sm font-extrabold text-[#3d4fd4]"
                    onClick={() => setModelOpen((value) => !value)}
                  >
                    {modelOpen ? t('nav.close') : t('workflow.model')}
                  </button>
                  {modelOpen ? (
                    <div className="rounded-xl border border-[#d8dce6] bg-white px-4 py-3">
                      <p className="text-sm font-extrabold">{template.data.subject}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#5c6578]">
                        {template.data.body}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-sm text-[#8b909a]">{t('dossier.noModel')}</p>
              )}
            </StagePanel>
          </div>
        </StagePanel>

        {manager && copyrightPending ? (
          <StagePanel
            title={t('dossier.copyrightReview')}
            hint={t('dossier.copyrightReviewHint')}
            status={t('dossier.copyrightUnderCheck')}
            statusTone="wait"
          >
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() =>
                  void send(
                    `/api/v1/papers/${paper.id}/copyright/validate`,
                    { accept: true } as unknown as BodyInit,
                    true,
                  )
                }
              >
                {t('dossier.copyrightValidated')}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="border-[#c5cad6]"
                onClick={() =>
                  void send(
                    `/api/v1/papers/${paper.id}/copyright/validate`,
                    { accept: false } as unknown as BodyInit,
                    true,
                  )
                }
              >
                {t('dossier.refuse')}
              </Button>
            </div>
          </StagePanel>
        ) : null}
      </div>
    );
    }
    }
  }

  const readyForPublication =
    open &&
    dossier.cameraReadyStatus === 'VALIDATED' &&
    (dossier.similarityStatus === 'VALIDATED' ||
      (Boolean(dossier.similarity?.verified) &&
        (dossier.similarity?.percentage ?? 100) < 20)) &&
    (dossier.copyrightStageStatus === 'VALIDATED' ||
      dossier.copyrightStatus === 'VALIDATED');

  if ((author || manager) && (dossier.doi || readyForPublication)) {
    actions.final = (
      <div className="mt-4 space-y-3">
        {!dossier.doi ? (
          <div className="relative overflow-hidden rounded-2xl border border-[#2fbf71]/35 bg-gradient-to-br from-[#e8f8ef] via-[#f4fbf7] to-[#eef3ff] px-5 py-6 sm:px-7 sm:py-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -right-6 -top-8 h-36 w-36 rounded-full bg-[#2fbf71]/20"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-10 left-8 h-28 w-28 rounded-full bg-[#3d4fd4]/12"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute right-16 bottom-4 h-16 w-16 rotate-12 rounded-2xl border-2 border-[#2fbf71]/35"
            />
            <p className="relative text-xs font-extrabold uppercase tracking-[0.18em] text-[#1c9a57]">
              {t('dossier.finalCongratulations')}
            </p>
            <h2 className="relative mt-2 max-w-xl text-xl font-extrabold leading-snug text-[#1c2744] sm:text-2xl">
              {t('dossier.finalReadyForPublication')}
            </h2>
            <p className="relative mt-2 max-w-lg text-sm font-semibold text-[#5c6578]">
              {t('dossier.finalCongratsBody')}
            </p>
            {author && !manager ? (
              <p className="relative mt-4 text-xs font-extrabold text-[#1c9a57]">
                {t('dossier.finalWaitingAdmin')}
              </p>
            ) : null}
          </div>
        ) : null}

        <PaperFilesStrip
          paperId={paper.id}
          files={dossier.files}
          kinds={[
            'MANUSCRIPT',
            'CAMERA_READY',
            'EDITABLE',
            'SIMILARITY',
            'COPYRIGHT',
            'SLIDES',
          ]}
        />
        <StagePanel
          title={t('dossier.final')}
          hint={
            dossier.doi
              ? `${t('dossier.finalReady')} ${dossier.doi}`
              : t('dossier.finalWaitingAdmin')
          }
          status={
            dossier.doi
              ? t('dossier.finalReady')
              : t('dossier.readyToPublish')
          }
          statusTone={dossier.doi ? 'ok' : 'wait'}
        >
          {dossier.doi ? (
            <Button
              type="button"
              variant="outline"
              className="border-[#c5cad6]"
              onClick={() =>
                void download(`/api/v1/papers/${paper.id}/attestation`, 'attestation.pdf')
              }
            >
              {t('dossier.downloadAttestation')}
            </Button>
          ) : manager ? (
            <Button
              type="button"
              onClick={() =>
                void send(`/api/v1/papers/${paper.id}/publish`, {} as BodyInit, true)
              }
            >
              {t('dossier.attestation')}
            </Button>
          ) : null}
        </StagePanel>
      </div>
    );
  }

  return actions;
}

function RemarksChecklist({
  paperId,
  remarks,
  path = 'remarks',
  manager,
  onChanged,
  onError,
}: {
  paperId: string;
  remarks: NonNullable<PaperDossier['remarks']>;
  path?: 'remarks' | 'presentation-remarks' | 'camera-ready-remarks';
  manager: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const { t } = useTranslation();
  const done = remarks.filter((item) => item.status === 'VALIDATED').length;
  const total = remarks.length;
  const hint =
    path === 'presentation-remarks'
      ? manager
        ? t('dossier.slidesRemarksHintManager')
        : t('dossier.slidesRemarksHintAuthor')
      : path === 'camera-ready-remarks'
        ? manager
          ? t('dossier.cameraRemarksHintManager')
          : t('dossier.cameraRemarksHintAuthor')
        : manager
          ? t('dossier.remarksHintManager')
          : t('dossier.remarksHintAuthor');

  async function setStatus(id: string, status: 'OPEN' | 'ADDRESSED' | 'VALIDATED') {
    const response = await apiFetch(`/api/v1/papers/${paperId}/${path}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      onError(await apiErrorMessage(response));
      return;
    }
    await onChanged();
  }

  return (
    <StagePanel
      title={t('dossier.remarksTitle')}
      hint={hint}
      status={t('dossier.remarksProgress', { done, total })}
      statusTone={done === total && total > 0 ? 'ok' : 'wait'}
    >
      <ul className="grid gap-2">
        {remarks.map((item) => (
          <li
            key={item.id}
            className="rounded-2xl border border-[#e4e7ee] bg-[#f8f9fc] px-3 py-3"
          >
            <p className="text-sm font-semibold text-[#1c2744]">{item.text}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-[#5c6578]">
                {item.status === 'VALIDATED'
                  ? t('dossier.remarkValidated')
                  : item.status === 'ADDRESSED'
                    ? t('dossier.remarkAddressed')
                    : t('dossier.remarkOpen')}
              </span>
              {!manager && item.status !== 'VALIDATED' ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 border-[#c5cad6] px-3 text-xs"
                  onClick={() =>
                    void setStatus(
                      item.id,
                      item.status === 'ADDRESSED' ? 'OPEN' : 'ADDRESSED',
                    )
                  }
                >
                  {item.status === 'ADDRESSED'
                    ? t('dossier.remarkUndo')
                    : t('dossier.remarkMarkDone')}
                </Button>
              ) : null}
              {manager && item.status !== 'VALIDATED' ? (
                <Button
                  type="button"
                  className="h-8 px-3 text-xs"
                  onClick={() => void setStatus(item.id, 'VALIDATED')}
                >
                  {t('dossier.remarkValidate')}
                </Button>
              ) : null}
              {manager && item.status === 'VALIDATED' ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 border-[#c5cad6] px-3 text-xs"
                  onClick={() => void setStatus(item.id, 'OPEN')}
                >
                  {t('dossier.remarkReopen')}
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </StagePanel>
  );
}
