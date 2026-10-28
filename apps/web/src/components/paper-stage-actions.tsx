import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  PaperFilePeek,
  PaperFileSlot,
  PaperFilesStrip,
} from '@/components/paper-file-preview';
import type { PaperDossier } from '@/components/paper-workflow';
import { AssignmentField } from '@/components/assignment-picker';
import { FieldSelect } from '@/components/field-select';
import { RegistrationPaymentPanel } from '@/components/registration-payment-panel';
import { InfoCards, PageSection, PageSplit, StagePanel, stageField } from '@/components/stage-panel';
import { Button } from '@/components/ui/button';
import { useFeedback } from '@/features/feedback/feedback';
import { isRegistrationComplete } from '@/features/papers/registration';
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
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const [modelOpen, setModelOpen] = useState(false);
  const [reviewerId, setReviewerId] = useState('');
  const [chairId, setChairId] = useState('');
  const [sessionPick, setSessionPick] = useState('');
  const [modalityPick, setModalityPick] = useState('IN_PERSON');
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
        {
          userId: string;
          firstName: string;
          lastName: string;
          email?: string;
          academicTitle?: string;
        }[]
      >;
    },
  });
  const program = useQuery({
    queryKey: ['program', paper?.conferenceId],
    enabled: Boolean(paper?.dossier?.canManage && open),
    queryFn: async () => {
      const response = await apiFetch(
        `/api/v1/conferences/${paper!.conferenceId}/program`,
      );
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<{
        sessions: {
          id: string;
          title: string;
          startsAt: string;
          endsAt: string;
          room: { name: string };
        }[];
      }>;
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
  const registeredNow = isRegistrationComplete(dossier);
  const manager = dossier.canManage;
  const author = Boolean(dossier.isAuthor);
  const sessionChairs = dossier.sessionChairs ?? [];
  const presentationReviewers = dossier.presentationReviewers ?? [];
  const sessionChair = sessionChairs.some((item) => item.mine);
  const presentationReviewer = presentationReviewers.some((item) => item.mine);
  const reviewed = dossier.reviews.some((item) => item.recommendation);
  const mine = dossier.reviews.find((item) => item.mine);

  async function send(path: string, body?: BodyInit, json = false) {
    const response = await apiFetch(path, {
      method: 'POST',
      body: json ? JSON.stringify(body ?? {}) : body,
    });
    if (!response.ok) {
      onError(await apiErrorMessage(response));
      return false;
    }
    feedback.success(t('workflow.saved'));
    await onChanged();
    await queryClient.invalidateQueries({ queryKey: ['presentations-mine'] });
    await queryClient.invalidateQueries({ queryKey: ['program'] });
    return true;
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
          <AssignmentField
            className="min-w-0 text-xs font-extrabold text-[#5c6578]"
            label={t('reviews.chooseReviewer')}
            title={t('reviews.chooseReviewer')}
            placeholder={t('reviews.chooseReviewer')}
            value={reviewerId}
            onChange={(id) => {
              setReviewerId(id);
              if (!id) {
                return;
              }
              void send(
                `/api/v1/papers/${paper.id}/assignments`,
                { reviewerId: id } as unknown as BodyInit,
                true,
              ).then((ok) => {
                if (ok) {
                  setReviewerId('');
                }
              });
            }}
            options={(reviewers.data ?? []).map((person) => ({
              id: person.userId,
              title: `${person.firstName} ${person.lastName}`.trim(),
            }))}
          />
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
                href={`/workspace/reviews/${mine!.id}`}
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
              href={`/workspace/reviews/${mine!.id}`}
              className="inline-flex min-h-10 items-center rounded-full bg-[#3d4fd4] px-4 text-sm font-extrabold text-white no-underline"
            >
              {t('reviews.continueOnReviews')}
            </a>
          )}
        </StagePanel>
      </div>
    );
  }

  const remarksList = dossier.remarks ?? [];
  const reviewsList = dossier.reviews ?? [];
  const hadRevisions =
    remarksList.length > 0 || dossier.files.some((item) => item.kind === 'REVISION');
  const decisionHistory = (
    <>
      <ReviewsHistory reviews={reviewsList} />
      {remarksList.length > 0 ? (
        <RemarksChecklist
          paperId={paper.id}
          remarks={remarksList}
          path="remarks"
          manager={manager}
          readOnly={!needsRevision}
          onChanged={onChanged}
          onError={onError}
        />
      ) : null}
    </>
  );
  const authorDecisionHistory = (
    <div
      className={
        remarksList.length > 0
          ? 'grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.75fr)] lg:items-start lg:gap-0'
          : 'grid gap-5'
      }
    >
      <div className={remarksList.length > 0 ? 'lg:pr-8' : undefined}>
        <ReviewsHistory reviews={reviewsList} variant="page" />
      </div>
      {remarksList.length > 0 || needsRevision ? (
        <div className="grid gap-5 lg:border-l lg:border-[#eef0f4] lg:pl-8">
          {remarksList.length > 0 ? (
            <RemarksChecklist
              paperId={paper.id}
              remarks={remarksList}
              path="remarks"
              manager={manager}
              readOnly={!needsRevision}
              onChanged={onChanged}
              onError={onError}
              variant="page"
            />
          ) : null}
          {needsRevision ? (
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
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (manager && paper.status === 'SUBMITTED' && reviewed) {
    actions.decision = (
      <div className="mt-4 grid gap-4">
        <StagePanel
          title={t('workflow.decide')}
          hint={t('dossier.reviewGoesToAuthor')}
          status={
            open
              ? hadRevisions
                ? t('dossier.afterMods')
                : t('dossier.withoutMods')
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
              <FieldSelect
                name="outcome"
                className={stageField}
                defaultValue={paper.decision?.outcome ?? 'ACCEPTED'}
                options={[
                  {
                    value: 'ACCEPTED',
                    label: hadRevisions
                      ? t('dossier.afterMods')
                      : t('dossier.withoutMods'),
                  },
                  { value: 'CONDITIONALLY_ACCEPTED', label: t('dossier.minorMods') },
                  { value: 'REVISION_REQUIRED', label: t('dossier.majorMods') },
                  { value: 'REJECTED', label: t('dossier.notAccepted') },
                ]}
              />
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
        {decisionHistory}
      </div>
    );
  } else if (
    author &&
    (needsRevision ||
      remarksList.length > 0 ||
      reviewsList.some((item) => item.comments || item.recommendation))
  ) {
    actions.decision = authorDecisionHistory;
  }

  // Registration is per submission (dossier), not a global sidebar page.
  if (open && (author || manager)) {
    actions.registration = (
      <RegistrationPaymentPanel
        paperId={paper.id}
        conferenceId={paper.conferenceId}
        createdById={paper.createdById}
        dossier={dossier}
        onChanged={onChanged}
        onError={onError}
        manager={manager}
        variant={author && !manager ? 'page' : 'panel'}
      />
    );
  }

  if (open) {
    const slidesStatus = dossier.slidesStatus ?? 'LOCKED';
    // Actions only when registration unlocked the stage — not from leftover flags.
    const presentationReady =
      open &&
      registeredNow &&
      (slidesStatus === 'OPEN' ||
        slidesStatus === 'DEPOSITED' ||
        slidesStatus === 'NEEDS_MODS' ||
        slidesStatus === 'WILL_DEPOSIT' ||
        slidesStatus === 'VALIDATED' ||
        slidesStatus === 'LOCKED' ||
        Boolean(dossier.schedule));
    const canUploadSlides =
      author &&
      (slidesStatus === 'OPEN' ||
        slidesStatus === 'DEPOSITED' ||
        slidesStatus === 'NEEDS_MODS' ||
        slidesStatus === 'WILL_DEPOSIT');
    const slidesPendingReview =
      slidesStatus === 'DEPOSITED' || slidesStatus === 'WILL_DEPOSIT';
    const canActOnPresentation =
      author || manager || sessionChair || presentationReviewer;

    if (presentationReady && canActOnPresentation) {
      const peopleLine = (items: { name: string }[], empty: string) =>
        items.length > 0 ? items.map((item) => item.name).join(', ') : empty;
      const chairRemarksBlock =
        !sessionChair &&
        (dossier.presented || dossier.absent) &&
        (dossier.schedule?.chairRemarks || dossier.sessionComment) ? (
          <div
            className={`rounded-xl border px-3 py-3 ${
              dossier.absent
                ? 'border-[#e35d5d]/30 bg-[#fdecec]'
                : 'border-[#2fbf71]/30 bg-[#e8f8ef]'
            }`}
          >
            <p
              className={`text-xs font-extrabold uppercase tracking-wide ${
                dossier.absent ? 'text-[#c54545]' : 'text-[#1c9a57]'
              }`}
            >
              {dossier.absent ? t('sessionChair.absent') : t('dossier.chairRemarks')}
            </p>
            <p className="mt-1 text-sm font-semibold text-[#1c2744]">
              {dossier.schedule?.chairRemarks || dossier.sessionComment}
            </p>
            {dossier.schedule?.score !== null && dossier.schedule?.score !== undefined ? (
              <p className="mt-1 text-xs font-extrabold text-[#5c6578]">
                {t('dossier.chairScore')}: {dossier.schedule.score}/10
              </p>
            ) : null}
          </div>
        ) : null;

      const chairFollowUp =
        sessionChair && dossier.schedule ? (
          <StagePanel
            title={t('dossier.chairFollowUp')}
            hint={
              dossier.presented
                ? t('sessionChair.editHint')
                : dossier.absent
                  ? t('sessionChair.absentHint')
                  : t('dossier.chairFollowUpHint')
            }
            status={
              dossier.presented
                ? t('dossier.presentationPresented')
                : dossier.absent
                  ? t('sessionChair.absent')
                  : t('dossier.presentationScheduled')
            }
            statusTone={
              dossier.presented ? 'ok' : dossier.absent ? 'missing' : 'wait'
            }
          >
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const scoreRaw = String(form.get('score') ?? '');
                const intent = String(form.get('intent') ?? 'presented');
                void send(
                  `/api/v1/presentations/${dossier.schedule!.presentationId}/assessment`,
                  {
                    score: scoreRaw ? Number(scoreRaw) : undefined,
                    comment: String(form.get('comment') ?? ''),
                    presented: intent !== 'absent',
                    absent: intent === 'absent',
                  } as unknown as BodyInit,
                  true,
                );
              }}
            >
              {!dossier.absent ? (
                <label className="text-xs font-extrabold text-[#5c6578]">
                  {t('dossier.chairScore')}
                  <input
                    name="score"
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    defaultValue={dossier.schedule.score ?? ''}
                    className={stageField}
                  />
                </label>
              ) : null}
              <label className="text-xs font-extrabold text-[#5c6578]">
                {t('dossier.chairRemarks')}
                <textarea
                  name="comment"
                  className={`${stageField} min-h-20`}
                  placeholder={t('dossier.chairRemarksPlaceholder')}
                  defaultValue={
                    dossier.schedule.chairRemarks || dossier.sessionComment || ''
                  }
                  required
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" name="intent" value="presented">
                  {dossier.presented
                    ? t('sessionChair.saveAssessment')
                    : t('dossier.markPresented')}
                </Button>
                {!dossier.presented ? (
                  <Button type="submit" name="intent" value="absent" variant="secondary">
                    {t('sessionChair.markAbsent')}
                  </Button>
                ) : null}
              </div>
            </form>
          </StagePanel>
        ) : sessionChair && !dossier.schedule ? (
          <StagePanel
            title={t('dossier.chairFollowUp')}
            hint={t('dossier.waitingScheduleHint')}
            status={t('dossier.waitingSchedule')}
            statusTone="wait"
          />
        ) : null;

      const authorSlidesRemarks = (dossier.slidesRemarks?.length ?? 0) > 0;
      const canDecideSlides = (manager || presentationReviewer) && slidesPendingReview;
      const canSeeSlides =
        canUploadSlides || manager || presentationReviewer || sessionChair;
      const dedicatedChairs = (chairs.data ?? []).filter(
        (item) => item.academicTitle === 'Session chair',
      );
      const chairOptions = (dedicatedChairs.length > 0 ? dedicatedChairs : chairs.data ?? []).map(
        (item) => ({
          id: item.userId,
          title: `${item.firstName} ${item.lastName}`.trim(),
          subtitle:
            item.academicTitle === 'Session chair' ? item.email : item.academicTitle,
        }),
      );

      if (author && !manager && !sessionChair && !presentationReviewer) {
        const slidesFile = dossier.files.find((item) => item.kind === 'SLIDES') ?? null;
        actions.presentation = (
          <PageSplit
            left={
              <div className="grid gap-8">
                <PageSection
                  title={t('dossier.scheduleTitle')}
                  hint={t('dossier.scheduleHint')}
                >
                  <InfoCards
                    items={[
                      {
                        label: t('dossier.scheduleSession'),
                        value: dossier.schedule?.sessionTitle ?? t('dossier.waitingSchedule'),
                      },
                      {
                        label: t('dossier.scheduleRoom'),
                        value: dossier.schedule?.roomName ?? t('dossier.waitingSchedule'),
                      },
                      ...(dossier.schedule
                        ? [
                            {
                              label: t('dossier.scheduleTime'),
                              value: `${new Date(dossier.schedule.startsAt).toLocaleString()} – ${new Date(
                                dossier.schedule.endsAt,
                              ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
                            },
                            {
                              label: t('dossier.scheduleModality'),
                              value:
                                dossier.schedule.modality === 'ONLINE'
                                  ? t('dossier.modalityOnline')
                                  : t('dossier.modalityInPerson'),
                            },
                          ]
                        : []),
                      {
                        label: t('dossier.sessionChair'),
                        value: peopleLine(sessionChairs, t('dossier.noChair')),
                      },
                      {
                        label: t('sessionChair.talkLanguage'),
                        value: dossier.presentationLanguage
                          ? t(`sessionChair.lang${dossier.presentationLanguage}`)
                          : t('sessionChair.talkLanguageUnset'),
                      },
                    ]}
                  />
                  <label className="mt-4 block text-xs font-extrabold text-[#5c6578]">
                    {t('sessionChair.talkLanguage')}
                    <select
                      className={`${stageField} mt-1`}
                      value={dossier.presentationLanguage ?? ''}
                      onChange={(event) => {
                        const language = event.target.value as 'FR' | 'AR' | 'EN';
                        if (!language) {
                          return;
                        }
                        void send(
                          `/api/v1/papers/${paper.id}/presentation-language`,
                          { language } as unknown as BodyInit,
                          true,
                        );
                      }}
                    >
                      <option value="">{t('sessionChair.talkLanguageUnset')}</option>
                      <option value="FR">{t('sessionChair.langFR')}</option>
                      <option value="AR">{t('sessionChair.langAR')}</option>
                      <option value="EN">{t('sessionChair.langEN')}</option>
                    </select>
                    <span className="mt-1 block text-xs font-semibold text-[#8b909a]">
                      {t('sessionChair.talkLanguageHint')}
                    </span>
                  </label>
                  {chairRemarksBlock}
                </PageSection>
                {canSeeSlides ? (
                  <PageSection
                    title={t('dossier.slides')}
                    hint={
                      slidesStatus === 'NEEDS_MODS'
                        ? t('dossier.slidesModsHint')
                        : t('dossier.slidesHint')
                    }
                  >
                    <PaperFileSlot
                      paperId={paper.id}
                      hint={
                        slidesStatus === 'NEEDS_MODS'
                          ? t('dossier.slidesModsHint')
                          : t('dossier.slidesHint')
                      }
                      kind="SLIDES"
                      file={slidesFile}
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
                  </PageSection>
                ) : null}
              </div>
            }
            right={
              authorSlidesRemarks ? (
                <RemarksChecklist
                  paperId={paper.id}
                  remarks={dossier.slidesRemarks ?? []}
                  path="presentation-remarks"
                  manager={false}
                  readOnly={
                    slidesStatus !== 'NEEDS_MODS' && slidesStatus !== 'WILL_DEPOSIT'
                  }
                  onChanged={onChanged}
                  onError={onError}
                  variant="page"
                />
              ) : slidesFile ? (
                <PageSection title={t('dossier.slides')}>
                  <PaperFilePeek paperId={paper.id} file={slidesFile} />
                </PageSection>
              ) : null
            }
          />
        );
      } else {
      actions.presentation = (
        <div className="mt-4 grid gap-4">
          <StagePanel
            title={t('dossier.scheduleTitle')}
            hint={t('dossier.scheduleHint')}
            status={
              dossier.schedule
                ? t('dossier.presentationScheduled')
                : t('dossier.waitingSchedule')
            }
            statusTone={dossier.schedule ? 'ok' : 'wait'}
          >
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-extrabold text-[#8b909a]">
                  {t('dossier.scheduleSession')}
                </dt>
                <dd className="font-semibold text-[#1c2744]">
                  {dossier.schedule?.sessionTitle ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-extrabold text-[#8b909a]">
                  {t('dossier.scheduleRoom')}
                </dt>
                <dd className="font-semibold text-[#1c2744]">
                  {dossier.schedule?.roomName ?? '—'}
                </dd>
              </div>
              {dossier.schedule ? (
                <>
                  <div>
                    <dt className="text-xs font-extrabold text-[#8b909a]">
                      {t('dossier.scheduleTime')}
                    </dt>
                    <dd className="font-semibold text-[#1c2744]">
                      {`${new Date(dossier.schedule.startsAt).toLocaleString()} – ${new Date(
                        dossier.schedule.endsAt,
                      ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-extrabold text-[#8b909a]">
                      {t('dossier.scheduleModality')}
                    </dt>
                    <dd className="font-semibold text-[#1c2744]">
                      {dossier.schedule.modality === 'ONLINE'
                        ? t('dossier.modalityOnline')
                        : t('dossier.modalityInPerson')}
                    </dd>
                  </div>
                </>
              ) : null}
              <div>
                <dt className="text-xs font-extrabold text-[#8b909a]">
                  {t('dossier.sessionChair')}
                </dt>
                <dd className="font-semibold text-[#1c2744]">
                  {peopleLine(sessionChairs, t('dossier.noChair'))}
                </dd>
              </div>
            </dl>
            {manager ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <FieldSelect
                  className={stageField}
                  value={sessionPick}
                  onChange={setSessionPick}
                  placeholder={t('dossier.chooseSession')}
                  options={(program.data?.sessions ?? []).map((session) => ({
                    value: session.id,
                    label: `${session.title} · ${session.room.name} · ${new Date(
                      session.startsAt,
                    ).toLocaleString()}`,
                  }))}
                />
                <FieldSelect
                  className={stageField}
                  value={modalityPick}
                  onChange={setModalityPick}
                  options={[
                    { value: 'IN_PERSON', label: t('dossier.modalityInPerson') },
                    { value: 'ONLINE', label: t('dossier.modalityOnline') },
                  ]}
                />
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    disabled={!sessionPick}
                    onClick={() =>
                      void send(
                        `/api/v1/sessions/${sessionPick}/presentations`,
                        {
                          paperId: paper.id,
                          modality: modalityPick,
                        } as unknown as BodyInit,
                        true,
                      )
                    }
                  >
                    {t('dossier.saveSchedule')}
                  </Button>
                  {(program.data?.sessions ?? []).length === 0 ? (
                    <p className="mt-2 text-xs font-semibold text-[#8b909a]">
                      {t('dossier.noSessionsYet')}
                    </p>
                  ) : null}
                </div>
                <div className="sm:col-span-2">
                  <AssignmentField
                    className="min-w-0 text-xs font-extrabold text-[#5c6578]"
                    label={t('dossier.sessionChair')}
                    title={t('dossier.assignChair')}
                    hint={t('dossier.chooseChair')}
                    placeholder={t('dossier.chooseChair')}
                    value={chairId}
                    onChange={(id) => {
                      setChairId(id);
                      if (!id) {
                        return;
                      }
                      void send(
                        `/api/v1/papers/${paper.id}/session-chair`,
                        { userId: id } as unknown as BodyInit,
                        true,
                      ).then((ok) => {
                        if (ok) {
                          setChairId('');
                        }
                      });
                    }}
                    options={chairOptions}
                  />
                </div>
              </div>
            ) : null}
          </StagePanel>

          {chairRemarksBlock}
          {chairFollowUp}

          {canSeeSlides ? (
            <StagePanel
              title={t('dossier.slides')}
              hint={t('dossier.slidesHint')}
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

          {authorSlidesRemarks ? (
            <RemarksChecklist
              paperId={paper.id}
              remarks={dossier.slidesRemarks ?? []}
              path="presentation-remarks"
              manager={manager}
              readOnly={
                slidesStatus !== 'NEEDS_MODS' && slidesStatus !== 'WILL_DEPOSIT'
              }
              onChanged={onChanged}
              onError={onError}
            />
          ) : null}

          {canDecideSlides ? (
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
                  <FieldSelect
                    name="outcome"
                    className={stageField}
                    defaultValue="VALIDATED"
                    options={[
                      { value: 'VALIDATED', label: t('dossier.presentationValidated') },
                      { value: 'NEEDS_MODS', label: t('dossier.presentationNotComfort') },
                    ]}
                  />
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

        </div>
      );
      }
    }

    if (manager || (author && slidesStatus === 'VALIDATED')) {
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
    const authorCameraRemarks = (dossier.cameraReadyRemarks?.length ?? 0) > 0;
    const authorCameraWork = author;

    if (cameraReadyStage && (manager || authorCameraWork)) {
    const cameraPdf = dossier.files.find((item) => item.kind === 'CAMERA_READY') ?? null;
    const cameraWord = dossier.files.find((item) => item.kind === 'EDITABLE') ?? null;
    if (author && !manager) {
      actions.camera = (
        <PageSplit
          left={
            <PageSection
              hint={
                cameraStatus === 'NEEDS_MODS'
                  ? t('dossier.cameraModsHint')
                  : t('dossier.cameraHint')
              }
            >
              <div className="grid gap-5">
                <PaperFileSlot
                  paperId={paper.id}
                  title={t('dossier.cameraWord')}
                  hint={t('dossier.cameraWordHint')}
                  kind="EDITABLE"
                  file={cameraWord}
                  accept=".pdf,.doc,.docx,.tex,.zip"
                  uploadLabel={t('dossier.uploadEditable')}
                  onUpload={
                    canUploadCamera
                      ? (file) => upload(`/api/v1/papers/${paper.id}/editable`, file)
                      : undefined
                  }
                  done={Boolean(cameraWord)}
                />
                <PaperFileSlot
                  paperId={paper.id}
                  title={t('dossier.cameraPdf')}
                  hint={t('dossier.cameraPdfHint')}
                  kind="CAMERA_READY"
                  file={cameraPdf}
                  uploadLabel={t('dossier.uploadPdf')}
                  onUpload={
                    canUploadCamera
                      ? (file) =>
                          upload(`/api/v1/papers/${paper.id}/camera-ready`, file)
                      : undefined
                  }
                  done={Boolean(cameraPdf)}
                />
              </div>
            </PageSection>
          }
          right={
            authorCameraRemarks ? (
              <RemarksChecklist
                paperId={paper.id}
                remarks={dossier.cameraReadyRemarks ?? []}
                path="camera-ready-remarks"
                manager={false}
                readOnly={
                  cameraStatus !== 'NEEDS_MODS' && cameraStatus !== 'WILL_DEPOSIT'
                }
                onChanged={onChanged}
                onError={onError}
                variant="page"
              />
            ) : cameraPdf ? (
              <PageSection title={t('dossier.cameraPdf')}>
                <PaperFilePeek paperId={paper.id} file={cameraPdf} />
              </PageSection>
            ) : null
          }
        />
      );
    } else {
    actions.camera = (
      <div className="mt-4 space-y-3">
        {canUploadCamera || manager ? (
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
        ) : null}

        {authorCameraRemarks ? (
          <RemarksChecklist
            paperId={paper.id}
            remarks={dossier.cameraReadyRemarks ?? []}
            path="camera-ready-remarks"
            manager={manager}
            readOnly={
              cameraStatus !== 'NEEDS_MODS' && cameraStatus !== 'WILL_DEPOSIT'
            }
            onChanged={onChanged}
            onError={onError}
          />
        ) : null}

        {manager && cameraStatus !== 'VALIDATED' ? (
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
                <FieldSelect
                  name="outcome"
                  className={stageField}
                  defaultValue={
                    cameraPendingReview &&
                    dossier.files.some((item) => item.kind === 'CAMERA_READY') &&
                    dossier.files.some((item) => item.kind === 'EDITABLE')
                      ? 'VALIDATED'
                      : 'NEEDS_MODS'
                  }
                  options={[
                    ...(cameraPendingReview &&
                    dossier.files.some((item) => item.kind === 'CAMERA_READY') &&
                    dossier.files.some((item) => item.kind === 'EDITABLE')
                      ? [
                          {
                            value: 'VALIDATED',
                            label: t('dossier.cameraValidated'),
                          },
                        ]
                      : []),
                    {
                      value: 'NEEDS_MODS',
                      label: t('dossier.cameraNotComfort'),
                    },
                  ]}
                />
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

    const authorSimilarityWork = author;

    if (similarityReady && (manager || authorSimilarityWork)) {
      const similarityFile =
        dossier.files.find((item) => item.kind === 'SIMILARITY') ?? null;
      if (author && !manager) {
        actions.similarity = (
          <PageSplit
            left={
              <PageSection hint={t('dossier.similarityStageHint')}>
                <InfoCards
                  items={[
                    {
                      label: t('dossier.similarityValue'),
                      value: dossier.similarity
                        ? `${dossier.similarity.percentage} %`
                        : t('dossier.missing'),
                    },
                  ]}
                />
                <div className="mt-5 grid gap-5">
                  <PaperFileSlot
                    paperId={paper.id}
                    title={t('dossier.similarityReport')}
                    hint={t('dossier.similarityHint')}
                    kind="SIMILARITY"
                    file={similarityFile}
                    uploadLabel={t('dossier.uploadSimilarity')}
                    onUpload={
                      canUploadSimilarity
                        ? (file) =>
                            upload(`/api/v1/papers/${paper.id}/similarity-report`, file)
                        : undefined
                    }
                    done={Boolean(similarityFile)}
                  />
                  {canUploadSimilarity ||
                  similarityStatus === 'OPEN' ||
                  similarityStatus === 'DEPOSITED' ||
                  similarityStatus === 'LOCKED' ? (
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
                      <label className="min-w-[8rem] flex-1 text-sm font-semibold text-[#3d4fd4]">
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
                </div>
              </PageSection>
            }
            right={
              similarityFile ? (
                <PageSection title={t('dossier.similarityReport')}>
                  <PaperFilePeek paperId={paper.id} file={similarityFile} />
                </PageSection>
              ) : null
            }
          />
        );
      } else {
      actions.similarity = (
        <div className="mt-4 space-y-3">
          {canUploadSimilarity ||
          (author &&
            (similarityStatus === 'OPEN' ||
              similarityStatus === 'DEPOSITED' ||
              similarityStatus === 'LOCKED')) ||
          manager ? (
            <StagePanel
              title={t('dossier.similarity')}
              hint={t('dossier.similarityStageHint')}
            >
              <div className="grid gap-3 lg:grid-cols-2">
                {canUploadSimilarity || manager ? (
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
                ) : null}
                {author &&
                (similarityStatus === 'OPEN' ||
                  similarityStatus === 'DEPOSITED' ||
                  similarityStatus === 'LOCKED') ? (
                  <StagePanel
                    title={t('dossier.cameraSimilarity')}
                    hint={t('dossier.similarityPercentHint')}
                  >
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
                  </StagePanel>
                ) : manager ? (
                  <StagePanel
                    title={t('dossier.cameraSimilarity')}
                    hint={t('dossier.similarityPercentHint')}
                  >
                    <p className="text-sm font-semibold text-[#1c2744]">
                      {dossier.similarity
                        ? `${dossier.similarity.percentage} %`
                        : t('dossier.missing')}
                    </p>
                  </StagePanel>
                ) : null}
              </div>
            </StagePanel>
          ) : null}

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

    if (manager || (author && copyrightReady)) {
    const copyrightFile =
      dossier.files.find((item) => item.kind === 'COPYRIGHT') ?? null;
    const copyrightRemarks = dossier.copyrightRemarks ?? [];
    const hasCopyrightRemarks = copyrightRemarks.length > 0;
    if (author && !manager) {
      actions.copyright = (
        <PageSplit
          left={
            <div className="grid gap-8">
              <PageSection hint={t('dossier.copyrightStageHint')}>
                <PaperFileSlot
                  paperId={paper.id}
                  hint={t('dossier.copyrightHint')}
                  kind="COPYRIGHT"
                  file={copyrightFile}
                  uploadLabel={t('dossier.uploadCopyright')}
                  onUpload={
                    canUploadCopyright
                      ? (file) => upload(`/api/v1/papers/${paper.id}/copyright`, file)
                      : undefined
                  }
                  done={Boolean(copyrightFile)}
                />
              </PageSection>
              <PageSection
                title={t('workflow.model')}
                hint={t('dossier.copyrightModelHint')}
              >
                {template.data ? (
                  <div>
                    <p className="text-sm font-extrabold text-[#1c2744]">
                      {template.data.subject}
                    </p>
                    <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-relaxed text-[#1c2744]">
                      {template.data.body}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm font-medium text-[#8b909a]">
                    {t('dossier.noModel')}
                  </p>
                )}
              </PageSection>
            </div>
          }
          right={
            hasCopyrightRemarks ? (
              <RemarksChecklist
                paperId={paper.id}
                remarks={copyrightRemarks}
                path="copyright-remarks"
                manager={false}
                readOnly={copyrightStage === 'VALIDATED'}
                onChanged={onChanged}
                onError={onError}
                variant="page"
              />
            ) : copyrightFile ? (
              <PaperFilePeek paperId={paper.id} file={copyrightFile} />
            ) : null
          }
        />
      );
    } else {
    actions.copyright = (
      <div className="mt-4 space-y-3">
        {canUploadCopyright || manager ? (
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
              {canUploadCopyright || manager ? (
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
              ) : null}
            </div>
          </StagePanel>
        ) : null}

        {hasCopyrightRemarks ? (
          <RemarksChecklist
            paperId={paper.id}
            remarks={copyrightRemarks}
            path="copyright-remarks"
            manager={manager}
            readOnly={copyrightStage === 'VALIDATED'}
            onChanged={onChanged}
            onError={onError}
          />
        ) : null}

        {manager && copyrightStage !== 'VALIDATED' ? (
          <StagePanel
            title={t('dossier.copyrightReview')}
            hint={t('dossier.copyrightReviewHint')}
            status={t('dossier.waiting')}
            statusTone="wait"
          >
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void send(
                  `/api/v1/papers/${paper.id}/copyright/validate`,
                  {
                    accept: String(form.get('outcome')) === 'VALIDATED',
                    note: String(form.get('note') ?? ''),
                  } as unknown as BodyInit,
                  true,
                );
              }}
            >
              <label className="text-xs font-extrabold text-[#5c6578]">
                {t('dossier.copyrightReview')}
                <FieldSelect
                  name="outcome"
                  className={stageField}
                  defaultValue={
                    copyrightPending && copyrightFile ? 'VALIDATED' : 'NEEDS_MODS'
                  }
                  options={[
                    ...(copyrightPending && copyrightFile
                      ? [
                          {
                            value: 'VALIDATED',
                            label: t('dossier.copyrightValidated'),
                          },
                        ]
                      : []),
                    {
                      value: 'NEEDS_MODS',
                      label: t('dossier.copyrightNotComfort'),
                    },
                  ]}
                />
              </label>
              <label className="text-xs font-extrabold text-[#5c6578]">
                {t('dossier.copyrightNote')}
                <textarea
                  name="note"
                  className={`${stageField} min-h-20`}
                  placeholder={t('dossier.copyrightNoteHint')}
                />
              </label>
              <div>
                <Button type="submit">{t('dossier.saveCopyrightDecision')}</Button>
              </div>
            </form>
          </StagePanel>
        ) : null}
      </div>
    );
    }
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

  // Chercheur: attestation download only. Waiting / publish stay in workflow + admin actions.
  if (author && !manager && (dossier.doi || readyForPublication)) {
    const finalPdf =
      dossier.files.find((item) => item.kind === 'CAMERA_READY') ?? null;
    actions.final = (
      <PageSplit
        left={
          <PageSection
            hint={
              dossier.doi
                ? t('dossier.finalReady')
                : t('dossier.finalReadyForPublication')
            }
          >
            {dossier.doi ? (
              <InfoCards items={[{ label: t('dossier.paperDoi'), value: dossier.doi }]} />
            ) : (
              <p className="text-sm font-medium leading-relaxed text-[#1c2744]">
                {t('dossier.finalCongratulations')}
              </p>
            )}
            {dossier.doi ? (
              <div className="mt-5">
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#c5cad6]"
                  onClick={() =>
                    void download(
                      `/api/v1/papers/${paper.id}/attestation`,
                      'attestation.pdf',
                    )
                  }
                >
                  {t('dossier.downloadAttestation')}
                </Button>
              </div>
            ) : null}
          </PageSection>
        }
        right={
          finalPdf ? (
            <PageSection title={t('dossier.cameraPdf')}>
              <PaperFilePeek paperId={paper.id} file={finalPdf} />
            </PageSection>
          ) : null
        }
      />
    );
  } else if (manager && (dossier.doi || readyForPublication)) {
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
            dossier.doi ? t('dossier.finalReady') : t('dossier.readyToPublish')
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

function commentPoints(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/^[-•]\s*/, '').trim())
    .filter(Boolean);
  if (lines.length > 1) {
    return lines;
  }
  const sentences = (lines[0] ?? '')
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-ÖØ-Ý])/)
    .map((part) => part.trim())
    .filter(Boolean);
  return sentences.length > 1 ? sentences : lines;
}

function ReviewsHistory({
  reviews,
  variant = 'panel',
}: {
  reviews: NonNullable<PaperDossier['reviews']>;
  variant?: 'panel' | 'page';
}) {
  const { t } = useTranslation();
  const rows = reviews.filter((item) => item.recommendation || item.comments);
  if (rows.length === 0) {
    return null;
  }
  const advice = (value: string | null) =>
    value === 'ACCEPT'
      ? t('dossier.adviceAccept')
      : value === 'REJECT' || value === 'WEAK_REJECT'
        ? t('dossier.adviceReject')
        : t('dossier.adviceChanges');
  const list = (
    <ol className={variant === 'page' ? 'mt-5 grid gap-6' : 'grid gap-2'}>
      {rows.map((item, index) => {
        const points = item.comments ? commentPoints(item.comments) : [];
        return (
          <li
            key={item.id}
            className={
              variant === 'page'
                ? 'flex items-start gap-3 border-b border-[#eef0f4] pb-6 last:border-0 last:pb-0'
                : 'rounded-2xl border border-[#e4e7ee] bg-[#f8f9fc] px-3 py-3'
            }
          >
            {variant === 'page' ? (
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#eef2ff] text-xs font-extrabold text-[#3d4fd4]">
                {index + 1}
              </span>
            ) : null}
            <div className="min-w-0">
              <p
                className={
                  variant === 'page'
                    ? 'font-extrabold text-[#1c2744]'
                    : 'text-xs font-extrabold text-[#5c6578]'
                }
              >
                {item.reviewer
                  ? `${t('dossier.review')} ${index + 1} · ${item.reviewer}`
                  : `${t('dossier.review')} ${index + 1}`}
              </p>
              {item.recommendation ? (
                <p
                  className={
                    variant === 'page'
                      ? 'mt-1 text-sm font-semibold text-[#3d4fd4]'
                      : 'mt-1 text-sm font-extrabold text-[#1c2744]'
                  }
                >
                  {advice(item.recommendation)}
                </p>
              ) : null}
              {points.length > 0 ? (
                points.length === 1 ? (
                  <p
                    className={
                      variant === 'page'
                        ? 'mt-2 text-sm font-medium leading-relaxed text-[#1c2744]'
                        : 'mt-1 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-[#5c6578]'
                    }
                  >
                    {points[0]}
                  </p>
                ) : (
                  <ul className="mt-2 grid gap-1.5">
                    {points.map((point) => (
                      <li
                        key={point}
                        className="text-sm font-medium leading-relaxed text-[#1c2744]"
                      >
                        {point}
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
  if (variant === 'page') {
    return (
      <section>
        <p className="text-base font-extrabold text-[#3d4fd4]">
          {t('dossier.reviewsHistory')}
        </p>
        <p className="mt-1 text-xs text-[#8b909a]">{t('dossier.reviewsHistoryHint')}</p>
        {list}
      </section>
    );
  }
  return (
    <StagePanel
      title={t('dossier.reviewsHistory')}
      hint={t('dossier.reviewsHistoryHint')}
      status={`${rows.length}`}
      statusTone="ok"
    >
      {list}
    </StagePanel>
  );
}

function RemarksChecklist({
  paperId,
  remarks,
  path = 'remarks',
  manager,
  readOnly = false,
  onChanged,
  onError,
  variant = 'panel',
}: {
  paperId: string;
  remarks: NonNullable<PaperDossier['remarks']>;
  path?:
    | 'remarks'
    | 'presentation-remarks'
    | 'camera-ready-remarks'
    | 'copyright-remarks';
  manager: boolean;
  readOnly?: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
  variant?: 'panel' | 'page';
}) {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const done = remarks.filter((item) => item.status === 'VALIDATED').length;
  const total = remarks.length;
  const currentRound = remarks.reduce(
    (max, item) => (item.round > max ? item.round : max),
    0,
  );
  const rounds = [...new Set(remarks.map((item) => item.round))].sort(
    (left, right) => left - right,
  );
  const hint = readOnly
    ? t('dossier.remarksHistoryHint')
    : path === 'presentation-remarks'
      ? manager
        ? t('dossier.slidesRemarksHintManager')
        : t('dossier.slidesRemarksHintAuthor')
      : path === 'camera-ready-remarks'
        ? manager
          ? t('dossier.cameraRemarksHintManager')
          : t('dossier.cameraRemarksHintAuthor')
        : path === 'copyright-remarks'
          ? manager
            ? t('dossier.copyrightRemarksHintManager')
            : t('dossier.copyrightRemarksHintAuthor')
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
    feedback.success(t('workflow.saved'));
    await onChanged();
  }

  const body = (
    <div className={variant === 'page' ? 'mt-5 grid gap-6' : 'grid gap-4'}>
      {rounds.map((round) => (
        <div
          key={round}
          className={
            variant === 'page'
              ? 'grid gap-3 border-b border-[#eef0f4] pb-6 last:border-0 last:pb-0'
              : 'grid gap-2'
          }
        >
          {rounds.length > 1 ? (
            <p
              className={
                variant === 'page'
                  ? 'text-sm font-semibold text-[#3d4fd4]'
                  : 'text-xs font-extrabold uppercase tracking-wide text-[#8b909a]'
              }
            >
              {t('dossier.remarksRound', { round })}
            </p>
          ) : null}
          <ul className={variant === 'page' ? 'grid gap-3' : 'grid gap-2'}>
            {remarks
              .filter((item) => item.round === round)
              .map((item) => {
                const canAct = !readOnly && round === currentRound;
                const statusLabel =
                  item.status === 'VALIDATED'
                    ? t('dossier.remarkValidated')
                    : item.status === 'ADDRESSED'
                      ? t('dossier.remarkAddressed')
                      : t('dossier.remarkOpen');
                return (
                  <li
                    key={item.id}
                    className={
                      variant === 'page'
                        ? 'flex items-start gap-3'
                        : 'rounded-2xl border border-[#e4e7ee] bg-[#f8f9fc] px-3 py-3'
                    }
                  >
                    {variant === 'page' ? (
                      <span
                        className={`mt-1.5 size-2 shrink-0 rounded-full ${
                          item.status === 'VALIDATED'
                            ? 'bg-[#148a4c]'
                            : item.status === 'ADDRESSED'
                              ? 'bg-[#e0a020]'
                              : 'bg-[#c5cad6]'
                        }`}
                        aria-hidden
                      />
                    ) : null}
                    <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium leading-relaxed text-[#1c2744]">
                        {item.text}
                      </p>
                      <span
                        className={`shrink-0 text-xs font-extrabold ${
                          item.status === 'VALIDATED'
                            ? 'text-[#148a4c]'
                            : item.status === 'ADDRESSED'
                              ? 'text-[#9a6410]'
                              : 'text-[#5c6578]'
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    {canAct ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
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
                    ) : null}
                    </div>
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );

  if (variant === 'page') {
    return (
      <section>
        <div className="flex items-start justify-between gap-3">
          <p className="text-base font-extrabold text-[#3d4fd4]">
            {t('dossier.remarksTitle')}
          </p>
          <span className="text-xs font-extrabold text-[#148a4c]">
            {t('dossier.remarksProgress', { done, total })}
          </span>
        </div>
        <p className="mt-1 text-xs text-[#8b909a]">{hint}</p>
        {body}
      </section>
    );
  }

  return (
    <StagePanel
      title={readOnly ? t('dossier.remarksHistory') : t('dossier.remarksTitle')}
      hint={hint}
      status={t('dossier.remarksProgress', { done, total })}
      statusTone={done === total && total > 0 ? 'ok' : 'wait'}
    >
      {body}
    </StagePanel>
  );
}
