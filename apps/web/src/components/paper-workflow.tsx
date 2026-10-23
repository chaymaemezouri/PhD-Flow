import { ListChecks, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PaperFilesStrip, type PaperFileInfo } from '@/components/paper-file-preview';
import { InfoGrid, StagePanel } from '@/components/stage-panel';
import { Button } from '@/components/ui/button';

export interface PaperDossier {
  paperKind: 'ABSTRACT' | 'FULL';
  scopeStatus: 'PENDING' | 'ACCEPTED' | 'REFUSED';
  scopeReason?: string | null;
  conferenceName?: string | null;
  trackName: string | null;
  canManage: boolean;
  isAuthor?: boolean;
  templateValidated: boolean;
  doi: string | null;
  files: PaperFileInfo[];
  similarity: { percentage: number; verified: boolean } | null;
  copyrightStatus: string | null;
  presented: boolean;
  presentedAt: string | null;
  scheduled?: boolean;
  schedule?: {
    presentationId: string;
    sessionTitle: string;
    roomName: string;
    startsAt: string;
    endsAt: string;
    modality: 'IN_PERSON' | 'ONLINE';
    score: number | null;
    chairRemarks: string | null;
  } | null;
  slidesStatus?:
    | 'LOCKED'
    | 'OPEN'
    | 'DEPOSITED'
    | 'NEEDS_MODS'
    | 'WILL_DEPOSIT'
    | 'VALIDATED';
  cameraReadyStatus?:
    | 'LOCKED'
    | 'OPEN'
    | 'DEPOSITED'
    | 'NEEDS_MODS'
    | 'WILL_DEPOSIT'
    | 'VALIDATED';
  similarityStatus?: 'LOCKED' | 'OPEN' | 'DEPOSITED' | 'VALIDATED';
  copyrightStageStatus?: 'LOCKED' | 'OPEN' | 'DEPOSITED' | 'VALIDATED';
  sessionComment: string;
  sessionChairs: { userId: string; name: string; mine: boolean }[];
  slides: boolean;
  paymentProof: boolean;
  paymentsEnabled: boolean;
  registration: { status: string; paymentStatus: string } | null;
  reviews: {
    id: string;
    status: string;
    dueAt: string;
    assignedAt: string;
    reviewer: string;
    recommendation: string | null;
    comments: string;
    mine: boolean;
  }[];
  remarks?: {
    id: string;
    text: string;
    status: 'OPEN' | 'ADDRESSED' | 'VALIDATED';
    round: number;
  }[];
  remarksRound?: number | null;
  remarksDone?: boolean;
  slidesRemarks?: {
    id: string;
    text: string;
    status: 'OPEN' | 'ADDRESSED' | 'VALIDATED';
    round: number;
  }[];
  cameraReadyRemarks?: {
    id: string;
    text: string;
    status: 'OPEN' | 'ADDRESSED' | 'VALIDATED';
    round: number;
  }[];
}

interface WorkflowPaper {
  id: string;
  status: string;
  publicId: string | null;
  submittedAt: string | null;
  conferenceName?: string | null;
  title?: string | null;
  abstract?: string | null;
  keywords?: string[] | null;
  authors?: {
    firstName: string;
    lastName: string;
    email: string;
    corresponding?: boolean;
  }[];
  decision: { outcome: string; status: string; letter?: string } | null;
  dossier?: PaperDossier;
}

const tone = {
  current: 'border-[#f0a04b]/45 bg-[#f0a04b]/16',
  done: 'border-[#2fbf71]/40 bg-[#2fbf71]/16',
  stop: 'border-[#e35d5d]/40 bg-[#e35d5d]/14',
  wait: 'border-[#f0a04b]/45 bg-[#f0a04b]/16',
  later: 'border-[#e4e7ee] bg-white',
} as const;

type Tone = keyof typeof tone;

function hasFile(dossier: PaperDossier | undefined, kind: string) {
  return dossier?.files.some((file) => file.kind === kind) ?? false;
}

export function PaperWorkflow({
  paper,
  onScope,
  extras,
  children,
}: {
  paper?: WorkflowPaper;
  onScope?: (accept: boolean, reason?: string) => void;
  extras?: Partial<Record<string, ReactNode>>;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const [scopeReason, setScopeReason] = useState('');
  const [scopeError, setScopeError] = useState<string | null>(null);
  const dossier = paper?.dossier;
  const submitted = paper?.status === 'SUBMITTED';
  const withdrawn = paper?.status === 'WITHDRAWN';
  const cancelled = paper?.status === 'CANCELLED';
  const progressed = (dossier?.reviews.length ?? 0) > 0 || Boolean(paper?.decision);
  const scope =
    dossier?.scopeStatus === 'PENDING' && progressed
      ? 'ACCEPTED'
      : (dossier?.scopeStatus ?? 'PENDING');
  const stopped =
    withdrawn ||
    cancelled ||
    scope === 'REFUSED' ||
    paper?.decision?.outcome === 'REJECTED';
  const needsRevision =
    paper?.decision?.status === 'PUBLISHED' &&
    (paper.decision.outcome === 'CONDITIONALLY_ACCEPTED' ||
      paper.decision.outcome === 'REVISION_REQUIRED');
  const accepted =
    paper?.decision?.status === 'PUBLISHED' && paper.decision.outcome === 'ACCEPTED';
  const decisionLabel = () => {
    if (paper?.decision?.outcome === 'REJECTED') {
      return t('dossier.notAccepted');
    }
    if (paper?.decision?.outcome === 'CONDITIONALLY_ACCEPTED') {
      return t('dossier.minorMods');
    }
    if (paper?.decision?.outcome === 'REVISION_REQUIRED') {
      return t('dossier.majorMods');
    }
    if (accepted) {
      return t('dossier.withoutMods');
    }
    return null;
  };
  // Fully registered: admin confirmed, and payment verified when the conference requires it.
  const registered =
    dossier?.registration?.status === 'VERIFIED' &&
    (!dossier?.paymentsEnabled ||
      dossier.registration.paymentStatus === 'VERIFIED');
  const slidesStatus = dossier?.slidesStatus ?? 'LOCKED';
  // Presentation stage only after registration — never from leftover / early flags.
  const presentationOpen =
    registered &&
    (slidesStatus === 'OPEN' ||
      slidesStatus === 'DEPOSITED' ||
      slidesStatus === 'NEEDS_MODS' ||
      slidesStatus === 'WILL_DEPOSIT' ||
      slidesStatus === 'VALIDATED' ||
      slidesStatus === 'LOCKED');
  const slidesValidated = registered && slidesStatus === 'VALIDATED';
  const scheduled =
    registered && Boolean(dossier?.scheduled || dossier?.schedule);
  // "Presented" only after a scheduled session was explicitly marked — not leftover presentedAt.
  const deliveryPresented =
    registered &&
    scheduled &&
    Boolean(dossier?.presented || dossier?.presentedAt);
  const cameraStatus = dossier?.cameraReadyStatus ?? 'LOCKED';
  // Camera ready only after slides are validated — never while presentation is merely scheduled.
  const cameraOpen =
    slidesValidated &&
    (cameraStatus === 'OPEN' ||
      cameraStatus === 'DEPOSITED' ||
      cameraStatus === 'NEEDS_MODS' ||
      cameraStatus === 'WILL_DEPOSIT' ||
      cameraStatus === 'VALIDATED' ||
      cameraStatus === 'LOCKED');
  const cameraValidated = cameraStatus === 'VALIDATED';
  const similarityStatus = dossier?.similarityStatus ?? 'LOCKED';
  const similarityOpen =
    cameraValidated &&
    (similarityStatus === 'OPEN' ||
      similarityStatus === 'DEPOSITED' ||
      similarityStatus === 'VALIDATED' ||
      similarityStatus === 'LOCKED');
  const similarityValidated =
    similarityStatus === 'VALIDATED' ||
    (Boolean(dossier?.similarity?.verified) &&
      (dossier?.similarity?.percentage ?? 100) < 20);
  const copyrightStage = dossier?.copyrightStageStatus ?? 'LOCKED';
  const copyrightOpen =
    similarityValidated &&
    (copyrightStage === 'OPEN' ||
      copyrightStage === 'DEPOSITED' ||
      copyrightStage === 'VALIDATED' ||
      copyrightStage === 'LOCKED');
  const copyrightValidated =
    copyrightStage === 'VALIDATED' || dossier?.copyrightStatus === 'VALIDATED';
  const slidesLabel = () => {
    if (!registered) {
      return t('dossier.later');
    }
    if (deliveryPresented) {
      return t('dossier.presentationPresented');
    }
    if (slidesStatus === 'VALIDATED') {
      return t('dossier.presentationValidated');
    }
    if (slidesStatus === 'NEEDS_MODS') {
      return t('dossier.presentationNotComfort');
    }
    if (slidesStatus === 'WILL_DEPOSIT') {
      return t('dossier.presentationWillDeposer');
    }
    if (slidesStatus === 'DEPOSITED') {
      return t('dossier.presentationDeposited');
    }
    if (scheduled) {
      return t('dossier.presentationScheduled');
    }
    if (slidesStatus === 'OPEN' || slidesStatus === 'LOCKED') {
      return t('dossier.presentationOpen');
    }
    return t('dossier.later');
  };
  const cameraLabel = () => {
    if (!slidesValidated) {
      return t('dossier.later');
    }
    if (cameraStatus === 'VALIDATED') {
      return t('dossier.cameraValidated');
    }
    if (cameraStatus === 'NEEDS_MODS') {
      return t('dossier.cameraNotComfort');
    }
    if (cameraStatus === 'WILL_DEPOSIT') {
      return t('dossier.cameraWillDeposer');
    }
    if (cameraStatus === 'DEPOSITED') {
      return t('dossier.cameraUnderCheck');
    }
    if (cameraStatus === 'OPEN' || cameraStatus === 'LOCKED') {
      return t('dossier.cameraOpen');
    }
    return t('dossier.later');
  };
  const similarityLabel = () => {
    // similarityValidated already covers similarityStatus === 'VALIDATED'
    // (and the verified+% fallback). A second comparison is unreachable for TS.
    if (similarityValidated) {
      return t('dossier.similarityValidated');
    }
    if (similarityStatus === 'DEPOSITED') {
      return t('dossier.similarityUnderCheck');
    }
    if (similarityStatus === 'OPEN' || (cameraValidated && similarityStatus === 'LOCKED')) {
      return t('dossier.similarityOpen');
    }
    return t('dossier.later');
  };
  const copyrightLabel = () => {
    if (copyrightValidated) {
      return t('dossier.copyrightValidated');
    }
    if (dossier?.copyrightStatus === 'REJECTED') {
      return t('dossier.refuse');
    }
    if (copyrightStage === 'DEPOSITED') {
      return t('dossier.copyrightUnderCheck');
    }
    if (copyrightStage === 'OPEN' || (similarityValidated && copyrightStage === 'LOCKED')) {
      return t('dossier.copyrightOpen');
    }
    return t('dossier.later');
  };
  const publishable =
    accepted &&
    cameraValidated &&
    similarityValidated &&
    copyrightValidated &&
    slidesValidated &&
    !dossier?.doi;
  const advice = (value: string | null) => {
    if (value === 'ACCEPT') {
      return t('dossier.adviceAccept');
    }
    if (value === 'WEAK_ACCEPT' || value === 'BORDERLINE') {
      return t('dossier.adviceChanges');
    }
    if (value === 'REJECT' || value === 'WEAK_REJECT') {
      return t('dossier.adviceReject');
    }
    return value ?? t('dossier.waiting');
  };
  const check = (ok: boolean) => (ok ? t('dossier.ready') : t('dossier.missing'));
  const date = (value: string) =>
    new Date(value).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  const kindLabel =
    dossier?.paperKind === 'ABSTRACT'
      ? t('dossier.asPoster')
      : dossier?.paperKind === 'FULL'
        ? t('dossier.asRegular')
        : null;

  const stages: {
    key: string;
    title: string;
    actor: string;
    tone: Tone;
    status: string;
    detail?: string | null;
    facts: { label: string; value: string }[];
    note?: string | null;
    extra?: ReactNode;
  }[] = [
    {
      key: 'deposit',
      title: t('dossier.deposit'),
      actor: t('dossier.depositActor'),
      tone:
        !paper || paper.status === 'DRAFT'
          ? 'current'
          : withdrawn || cancelled
            ? 'stop'
            : 'done',
      status:
        !paper || paper.status === 'DRAFT'
          ? t('dossier.notCompleted')
          : paper.status === 'WITHDRAWN'
            ? t('dossier.withdrawn')
            : paper.status === 'CANCELLED'
              ? t('dossier.cancelled')
              : t('dossier.completed'),
      detail: kindLabel,
      facts: [
        paper?.publicId
          ? { label: t('dossier.paperId'), value: paper.publicId }
          : null,
        paper?.title ? { label: t('papers.paperTitle'), value: paper.title } : null,
        kindLabel ? { label: t('papers.kind'), value: kindLabel } : null,
        dossier?.trackName
          ? { label: t('papers.track'), value: dossier.trackName }
          : null,
        (paper?.conferenceName || dossier?.conferenceName)
          ? {
              label: t('papers.conference'),
              value: paper?.conferenceName || dossier?.conferenceName || '',
            }
          : null,
        paper?.keywords && paper.keywords.length > 0
          ? { label: t('papers.keywords'), value: paper.keywords.join(', ') }
          : null,
        paper?.authors && paper.authors.length > 0
          ? {
              label: t('papers.stepAuthors'),
              value: paper.authors
                .map(
                  (author) =>
                    `${author.firstName} ${author.lastName}${
                      author.corresponding ? ` (${t('papers.corresponding')})` : ''
                    }`,
                )
                .join(' · '),
            }
          : null,
        paper?.submittedAt
          ? {
              label: t('dossier.scheduleDate'),
              value: date(paper.submittedAt),
            }
          : null,
      ].filter(Boolean) as { label: string; value: string }[],
      note: paper?.abstract?.trim() ? paper.abstract.trim() : null,
      extra: null,
    },
    {
      key: 'scope',
      title: t('dossier.scope'),
      actor: t('dossier.scopeActor'),
      tone: !submitted
        ? 'later'
        : scope === 'REFUSED'
          ? 'stop'
          : scope === 'ACCEPTED'
            ? 'done'
            : 'current',
      status: !submitted
        ? t('dossier.later')
        : scope === 'ACCEPTED'
          ? t('dossier.scopeAcceptedPresented')
          : scope === 'REFUSED'
            ? t('dossier.scopeNotAccepted')
            : t('dossier.waiting'),
      detail: null,
      facts: [
        dossier?.trackName
          ? { label: t('papers.track'), value: dossier.trackName }
          : null,
        submitted
          ? {
              label: t('dossier.scope'),
              value:
                scope === 'ACCEPTED'
                  ? t('dossier.scopeAcceptedPresented')
                  : scope === 'REFUSED'
                    ? t('dossier.scopeNotAccepted')
                    : t('dossier.waiting'),
            }
          : null,
        scope === 'REFUSED' && dossier?.scopeReason
          ? { label: t('dossier.scopeRefuseReason'), value: dossier.scopeReason }
          : null,
      ].filter(Boolean) as { label: string; value: string }[],
      extra:
        submitted && scope === 'PENDING' && dossier?.canManage && onScope ? (
          <div className="mt-4">
            <StagePanel
              title={t('dossier.scope')}
              hint={t('dossier.scopePending')}
              status={t('dossier.waiting')}
              statusTone="wait"
            >
              <label className="grid gap-1.5">
                <span className="text-xs font-extrabold text-[#5c6578]">
                  {t('dossier.scopeRefuseReason')}
                </span>
                <textarea
                  value={scopeReason}
                  onChange={(event) => {
                    setScopeReason(event.target.value);
                    setScopeError(null);
                  }}
                  rows={3}
                  placeholder={t('dossier.scopeRefuseReasonHint')}
                  className="w-full rounded-xl border border-[#d8dce6] bg-[#f6f7fb] px-3 py-2 text-sm font-semibold text-[#1c2744] outline-none focus:border-[#3d4fd4]"
                />
              </label>
              {scopeError ? (
                <p className="mt-2 text-xs font-bold text-[#c54545]" role="alert">
                  {scopeError}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => {
                    setScopeError(null);
                    onScope(true);
                  }}
                >
                  {t('dossier.scopeAcceptedPresented')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#c5cad6]"
                  onClick={() => {
                    if (scopeReason.trim().length < 3) {
                      setScopeError(t('dossier.scopeRefuseReasonMissing'));
                      return;
                    }
                    setScopeError(null);
                    onScope(false, scopeReason.trim());
                  }}
                >
                  {t('dossier.scopeNotAccepted')}
                </Button>
              </div>
            </StagePanel>
          </div>
        ) : null,
    },
    {
      key: 'review',
      title: t('dossier.review'),
      actor: t('dossier.reviewActor'),
      tone:
        scope !== 'ACCEPTED'
          ? 'later'
          : (dossier?.reviews.length ?? 0) > 0
            ? 'done'
            : 'current',
      status:
        scope !== 'ACCEPTED'
          ? t('dossier.later')
          : (dossier?.reviews.length ?? 0) > 0
            ? t('dossier.assigned')
            : t('dossier.notAssigned'),
      facts:
        dossier && dossier.reviews.length > 0
          ? dossier.reviews.flatMap((item, index) => {
              const who = item.reviewer || t('dossier.reviewActor');
              return [
                {
                  label: `${t('dossier.review')} ${index + 1}`,
                  value: who,
                },
                {
                  label: t('dossier.scheduleDate'),
                  value: `${date(item.assignedAt)} → ${date(item.dueAt)}`,
                },
                {
                  label: t('dossier.decision'),
                  value: `${advice(item.recommendation)}${
                    item.comments ? ` · ${item.comments}` : ''
                  }`,
                },
              ];
            })
          : scope === 'ACCEPTED'
            ? [{ label: t('dossier.review'), value: t('dossier.noReview') }]
            : [],
    },
    {
      key: 'decision',
      title: t('dossier.decision'),
      actor: t('dossier.decisionActor'),
      tone:
        stopped && paper?.decision?.outcome === 'REJECTED'
          ? 'stop'
          : accepted
            ? 'done'
            : needsRevision || (dossier?.reviews.length ?? 0) > 0
              ? 'current'
              : 'later',
      status:
        paper?.decision?.outcome === 'REJECTED'
          ? t('dossier.notAccepted')
          : needsRevision
            ? decisionLabel() ?? t('dossier.adviceChanges')
            : accepted
              ? t('dossier.withoutMods')
              : (dossier?.reviews.length ?? 0) > 0
                ? t('dossier.underReviewing')
                : t('dossier.later'),
      facts: [
        {
          label: t('dossier.decision'),
          value:
            decisionLabel() ??
            ((dossier?.reviews.length ?? 0) > 0
              ? t('dossier.underReviewing')
              : t('dossier.later')),
        },
        needsRevision
          ? {
              label: t('dossier.presentationNote'),
              value: t('dossier.remarksProgress', {
                done: (dossier?.remarks ?? []).filter((item) => item.status === 'VALIDATED')
                  .length,
                total: dossier?.remarks?.length ?? 0,
              }),
            }
          : null,
      ].filter(Boolean) as { label: string; value: string }[],
      note: paper?.decision?.letter || null,
    },
    {
      key: 'registration',
      title: t('dossier.registration'),
      actor: t('dossier.registrationActor'),
      tone: !accepted ? 'later' : registered ? 'done' : 'current',
      status: !accepted
        ? t('dossier.later')
        : registered
          ? t('dossier.registered')
          : dossier?.registration?.paymentStatus === 'PENDING'
            ? t('dossier.underCheckReceipt')
            : dossier?.registration?.status === 'REQUESTED'
              ? t('dossier.registrationSent')
              : t('dossier.openForRegistration'),
      facts: accepted
        ? [
            {
              label: t('dossier.registration'),
              value: registered
                ? t('dossier.registered')
                : dossier?.registration?.status === 'REQUESTED'
                  ? t('dossier.registrationSent')
                  : t('dossier.openForRegistration'),
            },
            {
              label: t('dossier.paymentStatus'),
              value: registered
                ? t('dossier.paymentValidated')
                : dossier?.registration?.paymentStatus === 'PENDING'
                  ? t('dossier.underCheckReceipt')
                  : t('dossier.paymentAwaitingUpload'),
            },
          ]
        : [],
    },
    {
      key: 'presentation',
      title: t('dossier.presentation'),
      actor: t('dossier.presentationActor'),
      tone: deliveryPresented || slidesValidated
        ? 'done'
        : presentationOpen || scheduled
          ? slidesStatus === 'NEEDS_MODS' || slidesStatus === 'WILL_DEPOSIT'
            ? 'wait'
            : 'current'
          : 'later',
      status: slidesLabel(),
      facts: dossier?.schedule
        ? [
            {
              label: t('dossier.scheduleSession'),
              value: dossier.schedule.sessionTitle,
            },
            {
              label: t('dossier.scheduleRoom'),
              value: dossier.schedule.roomName,
            },
            {
              label: t('dossier.scheduleDate'),
              value: new Date(dossier.schedule.startsAt).toLocaleDateString(
                i18n.language,
              ),
            },
            {
              label: t('dossier.scheduleTime'),
              value: `${new Date(dossier.schedule.startsAt).toLocaleTimeString(
                i18n.language,
                { hour: '2-digit', minute: '2-digit' },
              )} – ${new Date(dossier.schedule.endsAt).toLocaleTimeString(
                i18n.language,
                { hour: '2-digit', minute: '2-digit' },
              )}`,
            },
            {
              label: t('dossier.scheduleModality'),
              value:
                dossier.schedule.modality === 'ONLINE'
                  ? t('dossier.modalityOnline')
                  : t('dossier.modalityInPerson'),
            },
            {
              label: t('dossier.sessionChair'),
              value:
                dossier.sessionChairs.length > 0
                  ? dossier.sessionChairs.map((item) => item.name).join(', ')
                  : t('dossier.noChair'),
            },
          ]
        : [],
    },
    {
      key: 'camera',
      title: t('dossier.camera'),
      actor: t('dossier.cameraActor'),
      tone: cameraValidated
        ? 'done'
        : cameraOpen
          ? cameraStatus === 'NEEDS_MODS' || cameraStatus === 'WILL_DEPOSIT'
            ? 'wait'
            : 'current'
          : 'later',
      status: cameraLabel(),
      facts: cameraOpen
        ? [
            {
              label: t('dossier.cameraWord'),
              value: check(hasFile(dossier, 'EDITABLE')),
            },
            {
              label: t('dossier.cameraPdf'),
              value: check(hasFile(dossier, 'CAMERA_READY')),
            },
            {
              label: t('dossier.cameraTemplate'),
              value: check(Boolean(dossier?.templateValidated)),
            },
            cameraStatus === 'NEEDS_MODS' || cameraStatus === 'WILL_DEPOSIT'
              ? {
                  label: t('dossier.presentationNote'),
                  value: t('dossier.remarksProgress', {
                    done: (dossier?.cameraReadyRemarks ?? []).filter(
                      (item) => item.status === 'VALIDATED',
                    ).length,
                    total: dossier?.cameraReadyRemarks?.length ?? 0,
                  }),
                }
              : null,
          ].filter(Boolean) as { label: string; value: string }[]
        : [],
    },
    {
      key: 'similarity',
      title: t('dossier.similarity'),
      actor: t('dossier.similarityActor'),
      tone: similarityValidated
        ? 'done'
        : similarityOpen
          ? similarityStatus === 'DEPOSITED'
            ? 'wait'
            : 'current'
          : 'later',
      status: similarityLabel(),
      facts: similarityOpen
        ? [
            {
              label: t('dossier.similarityReport'),
              value: check(hasFile(dossier, 'SIMILARITY')),
            },
            {
              label: t('dossier.cameraSimilarity'),
              value: dossier?.similarity
                ? `${dossier.similarity.percentage} %`
                : t('dossier.missing'),
            },
            {
              label: t('dossier.similarity'),
              value: similarityLabel(),
            },
          ]
        : [],
    },
    {
      key: 'copyright',
      title: t('dossier.copyright'),
      actor: t('dossier.copyrightActor'),
      tone: copyrightValidated
        ? 'done'
        : dossier?.copyrightStatus === 'REJECTED'
          ? 'stop'
          : copyrightOpen
            ? copyrightStage === 'DEPOSITED'
              ? 'wait'
              : 'current'
            : 'later',
      status: copyrightLabel(),
      facts: copyrightOpen
        ? [
            {
              label: t('dossier.copyright'),
              value: hasFile(dossier, 'COPYRIGHT')
                ? t('dossier.completed')
                : t('dossier.missing'),
            },
            {
              label: t('dossier.decision'),
              value: copyrightLabel(),
            },
          ]
        : [],
    },
    {
      key: 'final',
      title: t('dossier.final'),
      actor: t('dossier.finalActor'),
      tone: dossier?.doi
        ? 'done'
        : publishable
          ? 'current'
          : stopped
            ? 'stop'
            : 'later',
      status: dossier?.doi
        ? t('dossier.finalReady')
        : publishable
          ? t('dossier.finalReadyForPublication')
          : stopped
            ? t('dossier.ended')
            : t('dossier.later'),
      facts: [
        {
          label: t('dossier.final'),
          value: dossier?.doi
            ? t('dossier.finalReady')
            : publishable
              ? t('dossier.finalReadyForPublication')
              : stopped
                ? t('dossier.ended')
                : t('dossier.later'),
        },
        dossier?.doi ? { label: 'DOI', value: dossier.doi } : null,
      ].filter(Boolean) as { label: string; value: string }[],
      note: publishable && !dossier?.doi ? t('dossier.finalCongratulations') : null,
    },
  ];

  // Doctorant: action menu = ses étapes, débloquées seulement si la précédente est terminée.
  const doctorantView = Boolean(dossier?.isAuthor) && !dossier?.canManage;
  const doctorantActionKeys = [
    'deposit',
    'decision',
    'registration',
    'presentation',
    'camera',
    'similarity',
    'copyright',
    'final',
  ] as const;
  const doctorantUnlocked = (key: (typeof doctorantActionKeys)[number]) => {
    switch (key) {
      case 'deposit':
        return true;
      case 'decision':
        return submitted;
      case 'registration':
        return accepted;
      case 'presentation':
        return registered;
      case 'camera':
        return slidesValidated;
      case 'similarity':
        return cameraValidated;
      case 'copyright':
        return similarityValidated;
      case 'final':
        return copyrightValidated;
      default:
        return false;
    }
  };
  const menuStages = doctorantView
    ? stages.filter(
        (item) =>
          doctorantActionKeys.includes(
            item.key as (typeof doctorantActionKeys)[number],
          ) && doctorantUnlocked(item.key as (typeof doctorantActionKeys)[number]),
      )
    : stages;

  const openMenuIndex = menuStages.findIndex(
    (item) => item.tone === 'current' || item.tone === 'wait' || item.tone === 'stop',
  );
  const [pickedKey, setPickedKey] = useState<string | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [celebrateStep, setCelebrateStep] = useState<string | null>(null);
  const prevDoneKeys = useRef<Set<string>>(new Set());
  const fallbackKey =
    menuStages[openMenuIndex >= 0 ? openMenuIndex : 0]?.key ?? stages[0]?.key ?? null;
  const activeKey =
    pickedKey && menuStages.some((item) => item.key === pickedKey)
      ? pickedKey
      : fallbackKey;
  const stage = stages.find((item) => item.key === activeKey) ?? menuStages[0];
  const stageNumber = stage
    ? stages.findIndex((item) => item.key === stage.key) + 1
    : 0;

  const currentIndex = stages.findIndex(
    (item) => item.tone === 'current' || item.tone === 'wait' || item.tone === 'stop',
  );
  const currentStage =
    currentIndex >= 0
      ? stages[currentIndex]
      : stages.find((item) => item.tone === 'done')
        ? stages[stages.length - 1]
        : stages[0];
  const currentNumber =
    currentStage != null
      ? stages.findIndex((item) => item.key === currentStage.key) + 1
      : 0;
  const currentBannerTone =
    currentStage?.tone === 'done'
      ? 'border-[#2fbf71]/35 bg-[#e8f8ef]'
      : currentStage?.tone === 'stop'
        ? 'border-[#e35d5d]/35 bg-[#fdecec]'
        : currentStage?.tone === 'wait'
          ? 'border-[#f0a04b]/40 bg-[#fff6ea]'
          : 'border-[#5d74ff]/30 bg-[#eef2ff]';
  const currentBadgeTone =
    currentStage?.tone === 'done'
      ? 'bg-[#2fbf71]/18 text-[#1c9a57]'
      : currentStage?.tone === 'stop'
        ? 'bg-[#e35d5d]/15 text-[#c54545]'
        : currentStage?.tone === 'wait'
          ? 'bg-[#f0a04b]/20 text-[#9a6410]'
          : 'bg-[#5d74ff]/18 text-[#3d4fd4]';

  useEffect(() => {
    const doneNow = new Set(
      stages.filter((item) => item.tone === 'done').map((item) => item.key),
    );
    if (prevDoneKeys.current.size > 0) {
      for (const key of doneNow) {
        if (!prevDoneKeys.current.has(key)) {
          const completed = stages.find((item) => item.key === key);
          if (completed) {
            setCelebrateStep(completed.title);
            const nextOpen = menuStages.find(
              (item) =>
                item.tone === 'current' || item.tone === 'wait' || item.tone === 'stop',
            );
            if (nextOpen) {
              setPickedKey(nextOpen.key);
            }
          }
          break;
        }
      }
    }
    prevDoneKeys.current = doneNow;
  }, [stages, menuStages]);

  useEffect(() => {
    if (!celebrateStep) {
      return;
    }
    const timer = window.setTimeout(() => setCelebrateStep(null), 4500);
    return () => window.clearTimeout(timer);
  }, [celebrateStep]);

  function renderStageBody(item: (typeof stages)[number], number: number) {
    return (
      <section className="rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5 lg:rounded-2xl">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-[#1c2744] sm:text-lg">
              {number}. {item.title}
            </h2>
            <p className="mt-1 text-xs font-bold text-[#8b909a]">{item.actor}</p>
          </div>
          <span className="rounded-full bg-[#f6f7fb] px-3 py-1 text-xs font-extrabold text-[#1c2744]">
            {item.status}
          </span>
        </div>
        {item.facts.length > 0 ? (
          <div className="mt-4">
            {item.key === 'presentation' ? (
              <StagePanel
                title={t('dossier.scheduleTitle')}
                hint={t('dossier.scheduleHint')}
              >
                <InfoGrid items={item.facts} />
              </StagePanel>
            ) : (
              <div className="rounded-2xl border border-[#d8dce6] bg-[#f6f7fb] p-3 sm:p-4">
                <InfoGrid items={item.facts} />
                {item.note ? (
                  <div className="mt-3">
                    {item.key === 'deposit' ? (
                      <p className="text-xs font-extrabold text-[#8b909a]">
                        {t('papers.abstract')}
                      </p>
                    ) : null}
                    <p className="mt-0.5 whitespace-pre-wrap text-sm leading-relaxed text-[#5c6578]">
                      {item.note}
                    </p>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : item.note ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#5c6578]">
            {item.note}
          </p>
        ) : null}
        {item.key === 'deposit' &&
        paper?.id &&
        dossier?.files?.some((file) => file.kind === 'MANUSCRIPT') ? (
          <div className="mt-4">
            <PaperFilesStrip
              paperId={paper.id}
              files={dossier.files}
              kinds={['MANUSCRIPT', 'REVISION']}
            />
          </div>
        ) : null}
        {paper?.id && dossier?.files?.length && item.key === 'decision' ? (
          <PaperFilesStrip
            paperId={paper.id}
            files={dossier.files}
            kinds={['REVISION']}
          />
        ) : null}
        {item.key === 'deposit' && children ? (
          <div className="mt-5 border-t border-[#e4e7ee] pt-5">{children}</div>
        ) : null}
        {item.extra}
        {extras?.[item.key] ? (
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#9aa3b5]">
              {t('dossier.currentDeposit')}
            </p>
            {extras[item.key]}
          </div>
        ) : null}
      </section>
    );
  }

  const actionsNav = (
    <nav
      className="rounded-2xl border border-[#e4e7ee] bg-white p-2 sm:p-3"
      aria-label={t('dossier.actionsMenu')}
    >
      <p className="mb-2 px-2 pt-1 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#9aa3b5]">
        {t('dossier.actionsMenu')}
      </p>
      <ul className="grid gap-0.5">
        {menuStages.map((item) => {
          const active = item.key === activeKey;
          const number = stages.findIndex((entry) => entry.key === item.key) + 1;
          return (
            <li key={item.key}>
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                className={`flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
                  active
                    ? 'bg-[#5d74ff]/15 text-[#3d4fd4]'
                    : 'text-[#5c6578] hover:bg-[#f4f5f7] hover:text-[#1c2744]'
                }`}
                onClick={() => {
                  setPickedKey(item.key);
                  setActionsOpen(false);
                }}
              >
                <span
                  className={`mt-1 size-2 shrink-0 rounded-full ${
                    item.tone === 'done'
                      ? 'bg-[#2fbf71]'
                      : item.tone === 'stop'
                        ? 'bg-[#e35d5d]'
                        : item.tone === 'later'
                          ? 'bg-[#d8dce6]'
                          : 'bg-[#f0a04b]'
                  }`}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block text-xs font-extrabold leading-snug">
                    {number}. {item.title}
                  </span>
                  <span className="mt-0.5 block text-[10px] font-bold leading-snug opacity-80">
                    {item.status}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const finalFiles =
    paper?.id && dossier?.files && dossier.files.length > 0 ? (
      <section className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5">
        <h2 className="text-base font-extrabold text-[#1c2744]">{t('dossier.finalFiles')}</h2>
        <p className="mt-1 text-xs font-semibold text-[#8b909a]">
          {t('dossier.finalFilesHint')}
        </p>
        <div className="mt-3">
          <PaperFilesStrip
            paperId={paper.id}
            files={dossier.files}
            kinds={[
              'MANUSCRIPT',
              'REVISION',
              'SLIDES',
              'CAMERA_READY',
              'EDITABLE',
              'SIMILARITY',
              'COPYRIGHT',
              'PAYMENT_PROOF',
            ]}
          />
        </div>
      </section>
    ) : null;

  return (
    <div className="space-y-5">
      {celebrateStep ? (
        <div
          role="status"
          className="rounded-2xl border border-[#2fbf71]/40 bg-[#e8f8ef] px-4 py-4 sm:px-5"
        >
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#1c9a57]">
            {t('dossier.stepCompleteTitle')}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#1c2744]">
            {t('dossier.stepCompleteBody', { step: celebrateStep })}
          </p>
        </div>
      ) : null}

      {currentStage ? (
        <section
          aria-label={t('dossier.currentState')}
          className={`rounded-2xl border px-4 py-4 sm:px-5 ${currentBannerTone}`}
        >
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#8b909a]">
            {t('dossier.currentState')}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold text-[#1c2744] sm:text-xl">
                {currentNumber}. {currentStage.title}
              </h2>
              <p className="mt-1 text-sm font-semibold text-[#5c6578]">
                {currentStage.actor}
              </p>
            </div>
            <span
              className={`rounded-full px-3.5 py-1.5 text-sm font-extrabold ${currentBadgeTone}`}
            >
              {currentStage.status}
            </span>
          </div>
        </section>
      ) : null}

      <section aria-label={t('dossier.evolutionTitle')}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-extrabold text-[#1c2744] sm:text-lg">
              {t('dossier.evolutionTitle')}
            </h2>
            <p className="mt-0.5 text-xs text-[#8b909a] sm:text-sm">
              {t('dossier.evolutionHint')}
            </p>
          </div>
          {doctorantView ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="border-[#c5cad6]"
              aria-expanded={actionsOpen}
              aria-label={
                actionsOpen ? t('dossier.actionsMenuClose') : t('dossier.actionsMenuOpen')
              }
              onClick={() => setActionsOpen((open) => !open)}
            >
              {actionsOpen ? <X className="size-4" /> : <ListChecks className="size-4" />}
            </Button>
          ) : null}
        </div>
        <ol className="touch-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-2 snap-x snap-mandatory">
          {stages.map((item, index) => (
            <li
              key={item.key}
              className="w-[min(70vw,11rem)] shrink-0 snap-start sm:min-w-36 sm:flex-1 sm:w-auto"
            >
              <div
                className={`h-full min-h-20 w-full rounded-2xl border px-3 py-3 ${tone[item.tone]}`}
              >
                <span className="block text-sm font-extrabold leading-snug text-[#1c2744]">
                  {index + 1}. {item.title}
                </span>
                <span className="mt-1 block text-xs font-bold leading-snug text-[#5c6578]">
                  {item.status}
                </span>
                {item.detail ? (
                  <span className="mt-0.5 block text-[11px] font-semibold leading-snug text-[#5c6578]">
                    {item.detail}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {doctorantView ? (
        <div className="space-y-4">
          {actionsOpen ? actionsNav : null}
          {stage ? renderStageBody(stage, stageNumber) : null}
          {finalFiles}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
          {actionsNav}
          <div className="space-y-4">
            {stage ? renderStageBody(stage, stageNumber) : null}
            {finalFiles}
          </div>
        </div>
      )}
    </div>
  );
}
