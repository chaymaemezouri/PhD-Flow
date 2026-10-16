import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
    paper?.decision?.status === 'PUBLISHED' &&
    (paper.decision.outcome === 'ACCEPTED' ||
      paper.decision.outcome === 'CONDITIONALLY_ACCEPTED');
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
      const response = await apiFetch(`/api/v1/conferences/${paper!.conferenceId}/session-chairs`);
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
    enabled: Boolean(paper?.dossier?.canManage && paper.dossier.scopeStatus === 'ACCEPTED'),
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${paper!.conferenceId}/reviewers`);
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
            dossier.reviews.length > 0
              ? t('dossier.assigned')
              : t('dossier.notAssigned')
          }
          statusTone={dossier.reviews.length > 0 ? 'ok' : 'missing'}
        >
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              const reviewerId = String(new FormData(event.currentTarget).get('reviewerId'));
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
                    void send(`/api/v1/assignments/${mine!.id}/accept`, {} as BodyInit, true)
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
                  void send(`/api/v1/assignments/${mine!.id}/accept`, {} as BodyInit, true)
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
      <div className="mt-4">
        <StagePanel
          title={t('workflow.decide')}
          hint={t('dossier.reviewGoesToAuthor')}
          status={paper.decision ? t('dossier.completed') : t('dossier.waiting')}
          statusTone={paper.decision ? 'ok' : 'wait'}
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
                <option value="ACCEPTED">{t('dossier.adviceAccept')}</option>
                <option value="CONDITIONALLY_ACCEPTED">{t('dossier.adviceChanges')}</option>
                <option value="REVISION_REQUIRED">{t('workflow.outcomeRevision')}</option>
                <option value="REJECTED">{t('dossier.adviceReject')}</option>
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
      </div>
    );
  }

  if (
    !manager &&
    (paper.decision?.outcome === 'REVISION_REQUIRED' ||
      paper.decision?.outcome === 'CONDITIONALLY_ACCEPTED')
  ) {
    actions.decision = (
      <div className="mt-4">
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

  if (open) {
    actions.registration = (
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <StagePanel
          title={t('dossier.registration')}
          hint={t('dossier.registrationHint')}
          status={
            registeredNow
              ? t('dossier.registered')
              : dossier.registration?.status === 'REQUESTED'
                ? t('dossier.registrationSent')
                : t('dossier.notRegistered')
          }
          statusTone={
            registeredNow ? 'ok' : dossier.registration ? 'wait' : 'missing'
          }
        >
          <div className="flex flex-wrap gap-2">
            {!manager && !dossier.registration ? (
              <Button
                type="button"
                onClick={() =>
                  void send(
                    `/api/v1/conferences/${paper.conferenceId}/register`,
                    {} as BodyInit,
                    true,
                  )
                }
              >
                {t('dossier.register')}
              </Button>
            ) : null}
            {manager &&
            paper.createdById &&
            dossier.registration?.status === 'REQUESTED' &&
            dossier.registration.paymentStatus !== 'PENDING' ? (
              <Button
                type="button"
                onClick={() =>
                  void send(
                    `/api/v1/conferences/${paper.conferenceId}/registrations/${paper.createdById}/verify`,
                    {} as BodyInit,
                    true,
                  )
                }
              >
                {t('dossier.confirmRegistration')}
              </Button>
            ) : null}
            {registeredNow ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#c5cad6]"
                  onClick={() =>
                    void download(`/api/v1/papers/${paper.id}/certificate`, 'certificate.pdf')
                  }
                >
                  {t('dossier.downloadCertificate')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#c5cad6]"
                  onClick={() =>
                    void download(`/api/v1/papers/${paper.id}/receipt`, 'receipt.pdf')
                  }
                >
                  {t('dossier.downloadReceipt')}
                </Button>
              </>
            ) : null}
          </div>
        </StagePanel>

        {dossier.paymentsEnabled ? (
          <div className="space-y-3">
            <PaperFileSlot
              paperId={paper.id}
              title={t('dossier.uploadReceipt')}
              hint={t('dossier.paymentHint')}
              kind="PAYMENT_PROOF"
              file={dossier.files.find((item) => item.kind === 'PAYMENT_PROOF') ?? null}
              accept="application/pdf,image/png,image/jpeg"
              uploadLabel={t('dossier.uploadReceipt')}
              onUpload={
                manager
                  ? undefined
                  : (file) => upload(`/api/v1/papers/${paper.id}/payment-proof`, file)
              }
              done={dossier.paymentProof}
            />
            <StagePanel
              title={t('dossier.paymentStatus')}
              status={
                dossier.registration?.paymentStatus === 'VERIFIED'
                  ? t('dossier.ready')
                  : dossier.registration?.paymentStatus === 'PENDING'
                    ? t('dossier.paymentWait')
                    : t('dossier.missing')
              }
              statusTone={
                dossier.registration?.paymentStatus === 'VERIFIED'
                  ? 'ok'
                  : dossier.paymentProof
                    ? 'wait'
                    : 'missing'
              }
            >
              <div className="flex flex-wrap gap-2">
                {!manager && dossier.paymentProof ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-[#c5cad6]"
                    onClick={() =>
                      void send(
                        `/api/v1/papers/${paper.id}/payment-notice`,
                        {} as BodyInit,
                        true,
                      )
                    }
                  >
                    {t('dossier.paymentSent')}
                  </Button>
                ) : null}
                {manager &&
                dossier.paymentProof &&
                dossier.registration?.paymentStatus !== 'VERIFIED' ? (
                  <Button
                    type="button"
                    onClick={() =>
                      void send(
                        `/api/v1/papers/${paper.id}/payment/verify`,
                        {} as BodyInit,
                        true,
                      )
                    }
                  >
                    {t('dossier.validatePayment')}
                  </Button>
                ) : null}
              </div>
            </StagePanel>
          </div>
        ) : null}
      </div>
    );

    const sessionChair = dossier.sessionChairs?.some((item) => item.mine) ?? false;
    actions.presentation = (
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <PaperFileSlot
          paperId={paper.id}
          title={t('dossier.slides')}
          hint={t('dossier.slidesHint')}
          kind="SLIDES"
          file={dossier.files.find((item) => item.kind === 'SLIDES') ?? null}
          accept=".ppt,.pptx,application/pdf"
          uploadLabel={dossier.slides ? t('dossier.replaceSlides') : t('dossier.sendSlides')}
          onUpload={
            manager
              ? undefined
              : (file) => upload(`/api/v1/papers/${paper.id}/slides`, file)
          }
          done={dossier.slides}
        />
        <div className="space-y-3">
          {manager ? (
            <StagePanel
              title={t('dossier.assignChair')}
              hint={t('dossier.chairHint')}
              status={
                dossier.sessionChairs?.length
                  ? t('dossier.assigned')
                  : t('dossier.noChair')
              }
              statusTone={dossier.sessionChairs?.length ? 'ok' : 'missing'}
            >
              <form
                className="flex flex-col gap-2 sm:flex-row sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  const userId = String(new FormData(event.currentTarget).get('userId'));
                  void send(
                    `/api/v1/papers/${paper.id}/session-chair`,
                    { userId } as unknown as BodyInit,
                    true,
                  );
                }}
              >
                <label className="min-w-0 flex-1 text-xs font-extrabold text-[#5c6578]">
                  {t('dossier.chooseChair')}
                  <select name="userId" required className={stageField} defaultValue="">
                    <option value="">{t('dossier.chooseChair')}</option>
                    {chairs.data
                      ?.filter((person) => person.userId !== paper.createdById)
                      .map((person) => (
                        <option key={person.userId} value={person.userId}>
                          {person.firstName} {person.lastName}
                        </option>
                      ))}
                  </select>
                </label>
                <Button type="submit">{t('dossier.assignChair')}</Button>
              </form>
              {dossier.sessionChairs?.length ? (
                <p className="mt-2 text-xs font-bold text-[#5c6578]">
                  {dossier.sessionChairs.map((item) => item.name).join(' · ')}
                </p>
              ) : null}
            </StagePanel>
          ) : null}
          {(manager || sessionChair) && dossier.slides ? (
            <StagePanel
              title={t('dossier.markPresented')}
              hint={t('dossier.chairNote')}
              status={dossier.presented ? t('dossier.presented') : t('dossier.waiting')}
              statusTone={dossier.presented ? 'ok' : 'wait'}
            >
              <form
                className="grid gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const comment = String(new FormData(event.currentTarget).get('comment') ?? '');
                  void send(
                    `/api/v1/papers/${paper.id}/presented`,
                    { comment } as unknown as BodyInit,
                    true,
                  );
                }}
              >
                <label className="text-xs font-extrabold text-[#5c6578]">
                  {t('dossier.sessionComment')}
                  <textarea
                    name="comment"
                    defaultValue={dossier.sessionComment}
                    className={`${stageField} min-h-20`}
                  />
                </label>
                <div>
                  <Button type="submit">{t('dossier.markPresented')}</Button>
                </div>
              </form>
            </StagePanel>
          ) : null}
        </div>
      </div>
    );

    actions.camera = (
      <div className="mt-4 space-y-3">
        <div className="grid gap-3 lg:grid-cols-3">
          <PaperFileSlot
            paperId={paper.id}
            title={t('dossier.cameraWord')}
            hint={t('dossier.cameraWordHint')}
            kind="EDITABLE"
            file={dossier.files.find((item) => item.kind === 'EDITABLE') ?? null}
            accept=".pdf,.doc,.docx,.tex,.zip"
            uploadLabel={t('dossier.uploadEditable')}
            onUpload={
              manager
                ? undefined
                : (file) => upload(`/api/v1/papers/${paper.id}/editable`, file)
            }
            done={dossier.files.some((item) => item.kind === 'EDITABLE')}
          />
          <PaperFileSlot
            paperId={paper.id}
            title={t('dossier.cameraPdf')}
            hint={t('dossier.cameraPdfHint')}
            kind="CAMERA_READY"
            file={dossier.files.find((item) => item.kind === 'CAMERA_READY') ?? null}
            uploadLabel={t('dossier.uploadPdf')}
            onUpload={
              manager
                ? undefined
                : (file) => upload(`/api/v1/papers/${paper.id}/camera-ready`, file)
            }
            done={dossier.files.some((item) => item.kind === 'CAMERA_READY')}
          />
          <PaperFileSlot
            paperId={paper.id}
            title={t('workflow.report')}
            hint={t('dossier.similarityHint')}
            kind="SIMILARITY"
            file={dossier.files.find((item) => item.kind === 'SIMILARITY') ?? null}
            uploadLabel={t('dossier.uploadSimilarity')}
            onUpload={
              manager
                ? undefined
                : (file) => upload(`/api/v1/papers/${paper.id}/similarity-report`, file)
            }
            done={dossier.files.some((item) => item.kind === 'SIMILARITY')}
          />
        </div>

        <StagePanel
          title={t('dossier.cameraSimilarity')}
          hint={t('dossier.similarityPercentHint')}
          status={
            dossier.similarity?.verified
              ? t('dossier.ready')
              : dossier.similarity
                ? `${dossier.similarity.percentage} %`
                : t('dossier.missing')
          }
          statusTone={
            dossier.similarity?.verified
              ? 'ok'
              : dossier.similarity
                ? 'wait'
                : 'missing'
          }
        >
          {!manager ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const percentage = Number(new FormData(event.currentTarget).get('percentage'));
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
                  max={100}
                  step="0.1"
                  required
                  defaultValue={dossier.similarity?.percentage ?? ''}
                  className={stageField}
                />
              </label>
              <Button type="submit">{t('workflow.save')}</Button>
            </form>
          ) : null}
          {manager ? (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="border-[#c5cad6]"
                onClick={() =>
                  void send(`/api/v1/papers/${paper.id}/template/validate`, {} as BodyInit, true)
                }
              >
                {t('workflow.templateOk')}
              </Button>
              {dossier.similarity && !dossier.similarity.verified ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#c5cad6]"
                  onClick={() =>
                    void send(
                      `/api/v1/papers/${paper.id}/similarity/verify`,
                      {} as BodyInit,
                      true,
                    )
                  }
                >
                  {t('workflow.verify')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </StagePanel>
      </div>
    );

    actions.copyright = (
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <PaperFileSlot
          paperId={paper.id}
          title={t('dossier.copyright')}
          hint={t('dossier.copyrightHint')}
          kind="COPYRIGHT"
          file={dossier.files.find((item) => item.kind === 'COPYRIGHT') ?? null}
          uploadLabel={t('dossier.uploadCopyright')}
          onUpload={
            manager
              ? undefined
              : (file) => upload(`/api/v1/papers/${paper.id}/copyright`, file)
          }
          done={dossier.copyrightStatus === 'VALIDATED' || Boolean(
            dossier.files.find((item) => item.kind === 'COPYRIGHT'),
          )}
        />
        <StagePanel
          title={t('workflow.model')}
          hint={t('dossier.copyrightModelHint')}
          status={
            dossier.copyrightStatus === 'VALIDATED'
              ? t('dossier.ready')
              : dossier.copyrightStatus === 'REJECTED'
                ? t('dossier.refuse')
                : t('dossier.waiting')
          }
          statusTone={
            dossier.copyrightStatus === 'VALIDATED'
              ? 'ok'
              : dossier.copyrightStatus === 'REJECTED'
                ? 'missing'
                : 'wait'
          }
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
          {manager && dossier.copyrightStatus && dossier.copyrightStatus !== 'VALIDATED' ? (
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                className="border-[#c5cad6]"
                onClick={() =>
                  void send(
                    `/api/v1/papers/${paper.id}/copyright/validate`,
                    {} as BodyInit,
                    true,
                  )
                }
              >
                {t('dossier.ready')}
              </Button>
            </div>
          ) : null}
        </StagePanel>
      </div>
    );
  }

  const cameraReady =
    open &&
    dossier.files.some((file) => file.kind === 'EDITABLE') &&
    dossier.files.some((file) => file.kind === 'CAMERA_READY') &&
    dossier.templateValidated &&
    dossier.similarity?.verified &&
    dossier.similarity.percentage < 20 &&
    dossier.copyrightStatus === 'VALIDATED' &&
    dossier.presented &&
    !dossier.doi;

  if (dossier.doi || (manager && cameraReady)) {
    actions.final = (
      <div className="mt-4 space-y-3">
        <PaperFilesStrip
          paperId={paper.id}
          files={dossier.files}
          kinds={['MANUSCRIPT', 'CAMERA_READY', 'EDITABLE', 'SIMILARITY', 'COPYRIGHT', 'SLIDES']}
        />
        <StagePanel
          title={t('dossier.final')}
          hint={
            dossier.doi
              ? `${t('dossier.finalReady')} ${dossier.doi}`
              : t('dossier.adminPublishes')
          }
          status={dossier.doi ? t('dossier.finalReady') : t('dossier.readyToPublish')}
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
          ) : (
            <Button
              type="button"
              onClick={() =>
                void send(`/api/v1/papers/${paper.id}/publish`, {} as BodyInit, true)
              }
            >
              {t('dossier.attestation')}
            </Button>
          )}
        </StagePanel>
      </div>
    );
  }

  return actions;
}
