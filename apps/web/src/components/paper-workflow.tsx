import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PaperFilesStrip, type PaperFileInfo } from '@/components/paper-file-preview';
import { isRegistrationComplete } from '@/features/papers/registration';
import { InfoCards, InfoGrid, StagePanel } from '@/components/stage-panel';
import { Button } from '@/components/ui/button';
import { useFeedback } from '@/features/feedback/feedback';

export interface PaperDossier {
  paperKind: 'ABSTRACT' | 'FULL';
  scopeStatus: 'PENDING' | 'ACCEPTED' | 'REFUSED';
  scopeReason?: string | null;
  conferenceName?: string | null;
  trackName: string | null;
  canManage: boolean;
  isAuthor?: boolean;
  isSessionChair?: boolean;
  absent?: boolean;
  presentationLanguage?: 'FR' | 'AR' | 'EN' | null;
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
  presentationReviewers?: { userId: string; name: string; mine: boolean }[];
  slides: boolean;
  paymentProof: boolean;
  paymentsEnabled: boolean;
  paymentAmount?: number | null;
  paymentCurrency?: string | null;
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
  copyrightRemarks?: {
    id: string;
    text: string;
    status: 'OPEN' | 'ADDRESSED' | 'VALIDATED';
    round: number;
  }[];
}

export interface WorkflowAuthor {
  firstName: string;
  lastName: string;
  email: string;
  affiliation?: string;
  corresponding?: boolean;
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
  authors?: WorkflowAuthor[];
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

const tabTint: Record<string, string> = {
  decision: 'border-[#d0daf5] bg-[#e8eeff]',
  registration: 'border-[#cfe6d8] bg-[#e8f6ee]',
  presentation: 'border-[#ecd9c6] bg-[#f8eee4]',
  camera: 'border-[#cde4ef] bg-[#e8f4fa]',
  similarity: 'border-[#ddd0f0] bg-[#f1ebfa]',
  copyright: 'border-[#ebcfd6] bg-[#f8eef1]',
  final: 'border-[#e6dcc0] bg-[#f6f1e4]',
};

type Tone = keyof typeof tone;

function hasFile(dossier: PaperDossier | undefined, kind: string) {
  return dossier?.files.some((file) => file.kind === kind) ?? false;
}

function latestStepFiles(
  files: PaperFileInfo[],
  options: {
    needsRevision: boolean;
    slidesStatus?: string | null;
    cameraReadyStatus?: string | null;
  },
): PaperFileInfo[] {
  const byKind = new Map(files.map((file) => [file.kind, file]));
  const hide = new Set<string>();
  if (byKind.has('REVISION') || options.needsRevision) {
    hide.add('MANUSCRIPT');
  }
  if (options.slidesStatus === 'NEEDS_MODS') {
    hide.add('SLIDES');
  }
  if (options.cameraReadyStatus === 'NEEDS_MODS') {
    hide.add('CAMERA_READY');
    hide.add('EDITABLE');
  }
  return [
    'REVISION',
    'ABSTRACT',
    'MANUSCRIPT',
    'PAYMENT_PROOF',
    'SLIDES',
    'CAMERA_READY',
    'EDITABLE',
    'SIMILARITY',
    'COPYRIGHT',
  ].flatMap((kind) => {
    const file = byKind.get(kind);
    return file && !hide.has(kind) ? [file] : [];
  });
}

function withFileState(
  files: PaperFileInfo[],
  labels: { abstract: string; regular: string },
) {
  return files.map((file) => {
    if (file.kind === 'ABSTRACT') {
      return { ...file, stateLabel: labels.abstract };
    }
    if (file.kind === 'MANUSCRIPT') {
      return { ...file, stateLabel: labels.regular };
    }
    return file;
  });
}

function moveAuthor(authors: WorkflowAuthor[], from: number, to: number) {
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

export function PaperWorkflow({
  paper,
  onScope,
  onAuthorsChange,
  authorsBusy = false,
  extras,
  children,
  authorLayout = false,
}: {
  paper?: WorkflowPaper;
  onScope?: (accept: boolean, reason?: string) => void;
  onAuthorsChange?: (authors: WorkflowAuthor[]) => void;
  authorsBusy?: boolean;
  extras?: Partial<Record<string, ReactNode>>;
  children: ReactNode;
  authorLayout?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const feedback = useFeedback();
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
  const hadRevisions =
    (dossier?.remarks?.length ?? 0) > 0 || hasFile(dossier, 'REVISION');
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
      return hadRevisions ? t('dossier.afterMods') : t('dossier.withoutMods');
    }
    return null;
  };
  // Fully registered: admin confirmed, and this paper has a verified receipt
  // when the conference asks for payment — never from another paper's status alone.
  const registered = dossier ? isRegistrationComplete(dossier) : false;
  const slidesStatus = dossier?.slidesStatus ?? 'LOCKED';
  // Presentation opens only after this paper is accepted and registration/payment
  // are done — never on a new submission because the author already registered
  // for the conference on another paper.
  const presentationUnlocked = accepted && registered;
  const presentationOpen =
    presentationUnlocked &&
    (slidesStatus === 'OPEN' ||
      slidesStatus === 'DEPOSITED' ||
      slidesStatus === 'NEEDS_MODS' ||
      slidesStatus === 'WILL_DEPOSIT' ||
      slidesStatus === 'VALIDATED' ||
      slidesStatus === 'LOCKED');
  const slidesValidated = presentationUnlocked && slidesStatus === 'VALIDATED';
  const scheduled =
    presentationUnlocked && Boolean(dossier?.scheduled || dossier?.schedule);
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
    if (!presentationUnlocked) {
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

  const fileStateLabels = {
    abstract: t('dossier.asAbstract'),
    regular: t('dossier.asRegular'),
  };
  const hasAbstractFile = hasFile(dossier, 'ABSTRACT');
  const hasRegularFile =
    hasFile(dossier, 'MANUSCRIPT') || hasFile(dossier, 'REVISION');
  const kindLabel = [
    hasAbstractFile ? fileStateLabels.abstract : null,
    hasRegularFile ? fileStateLabels.regular : null,
  ]
    .filter(Boolean)
    .join(' · ')
    || (dossier?.paperKind === 'ABSTRACT'
      ? fileStateLabels.abstract
      : dossier?.paperKind === 'FULL'
        ? fileStateLabels.regular
        : null);

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
                      const text = t('dossier.scopeRefuseReasonMissing');
                      setScopeError(text);
                      feedback.error(text);
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
              ? decisionLabel() ?? t('dossier.withoutMods')
              : (dossier?.reviews.length ?? 0) > 0
                ? t('dossier.underReviewing')
                : t('dossier.later'),
      facts: [],
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
          : dossier?.registration?.paymentStatus === 'PENDING' ||
              (Boolean(dossier?.paymentProof) &&
                dossier?.registration?.paymentStatus !== 'VERIFIED')
            ? t('dossier.underCheckReceipt')
            : dossier?.paymentsEnabled && !dossier?.paymentProof
              ? t('dossier.paymentAwaitingUpload')
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
                : dossier?.registration?.paymentStatus === 'PENDING' ||
                    (Boolean(dossier?.paymentProof) &&
                      dossier?.registration?.paymentStatus !== 'VERIFIED')
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
      facts: presentationUnlocked
        ? [
            {
              label: t('dossier.scheduleSession'),
              value: dossier?.schedule?.sessionTitle ?? t('dossier.waitingSchedule'),
            },
            {
              label: t('dossier.scheduleRoom'),
              value: dossier?.schedule?.roomName ?? t('dossier.waitingSchedule'),
            },
            ...(dossier?.schedule
              ? [
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
                ]
              : []),
            {
              label: t('dossier.sessionChair'),
              value:
                (dossier?.sessionChairs ?? []).length > 0
                  ? dossier!.sessionChairs.map((item) => item.name).join(', ')
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
  const doctorantView =
    authorLayout || (Boolean(dossier?.isAuthor) && !dossier?.canManage);
  // Session chair: only presentation follow-up — no admin stage actions.
  const sessionChairView =
    Boolean(dossier?.isSessionChair) && !dossier?.canManage && !doctorantView;
  const doctorantActionKeys = [
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
      case 'decision':
        return submitted;
      case 'registration':
        return accepted;
      case 'presentation':
        return presentationUnlocked;
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
  const authorStages = doctorantActionKeys
    .map((key) => stages.find((item) => item.key === key))
    .filter((item): item is (typeof stages)[number] => Boolean(item));
  const sessionChairStages = (['presentation'] as const)
    .map((key) => stages.find((item) => item.key === key))
    .filter((item): item is (typeof stages)[number] => Boolean(item));
  const menuStages = doctorantView
    ? authorStages
    : sessionChairView
      ? sessionChairStages
      : stages;

  const openMenuIndex = menuStages.findIndex(
    (item) => item.tone === 'current' || item.tone === 'wait' || item.tone === 'stop',
  );
  const [pickedKey, setPickedKey] = useState<string | null>(null);
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
  const currentBadgeTone =
    currentStage?.tone === 'done'
      ? 'text-[#148a4c]'
      : currentStage?.tone === 'stop'
        ? 'text-[#c54545]'
        : currentStage?.tone === 'wait'
          ? 'text-[#9a6410]'
          : 'text-[#3d4fd4]';

  useEffect(() => {
    const doneNow = new Set(
      stages.filter((item) => item.tone === 'done').map((item) => item.key),
    );
    if (prevDoneKeys.current.size > 0) {
      for (const key of doneNow) {
        if (!prevDoneKeys.current.has(key)) {
          const completed = stages.find((item) => item.key === key);
          if (completed) {
            feedback.success(
              t('dossier.stepCompleteBody', { step: completed.title }),
            );
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
  }, [feedback, stages, menuStages, t]);

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
        {item.key !== 'deposit' && item.facts.length > 0 ? (
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
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#5c6578]">
                    {item.note}
                  </p>
                ) : null}
              </div>
            )}
          </div>
        ) : item.key !== 'deposit' && item.note ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[#5c6578]">
            {item.note}
          </p>
        ) : null}
        {item.key === 'deposit' && children ? (
          <div className="mt-4">{children}</div>
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

  function renderAuthorTabContent(item: (typeof stages)[number]) {
    const unlocked = doctorantUnlocked(
      item.key as (typeof doctorantActionKeys)[number],
    );
    const hasActions = Boolean(item.extra) || Boolean(extras?.[item.key]);
    return (
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d8dce6] pb-3">
          <div>
            <p className="text-sm font-extrabold text-[#1c2744]">{item.title}</p>
            <p className="mt-0.5 text-xs font-semibold text-[#8b909a]">{item.actor}</p>
          </div>
          <span className="rounded-full bg-[#eef1f6] px-2.5 py-1 text-[11px] font-extrabold text-[#1c2744]">
            {item.status}
          </span>
        </div>
        {!unlocked ? (
          <p className="mt-4 text-sm font-semibold text-[#8b909a]">
            {t('dossier.authorWorkbenchLater')}
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            {!hasActions && item.key !== 'deposit' && item.facts.length > 0 ? (
              item.key === 'presentation' ? (
                <StagePanel
                  title={t('dossier.scheduleTitle')}
                  hint={t('dossier.scheduleHint')}
                >
                  <InfoGrid items={item.facts} />
                </StagePanel>
              ) : (
                <InfoCards items={item.facts} />
              )
            ) : null}
            {item.note ? (
              <div className="border-b border-[#eef0f4] pb-5">
                <p className="text-sm font-semibold text-[#3d4fd4]">
                  {item.key === 'decision' ? t('workflow.letter') : item.title}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm font-medium leading-relaxed text-[#1c2744]">
                  {item.note}
                </p>
              </div>
            ) : null}
            {item.extra}
            {extras?.[item.key] ?? null}
          </div>
        )}
      </div>
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

  const allFiles = latestStepFiles(dossier?.files ?? [], {
    needsRevision,
    slidesStatus,
    cameraReadyStatus: cameraStatus,
  });
  const depositRecord = stages.find((item) => item.key === 'deposit');
  const authors = paper?.authors ?? [];
  const paperStatusLabel =
    !paper || paper.status === 'DRAFT'
      ? t('papers.draft')
      : paper.status === 'WITHDRAWN'
        ? t('papers.withdrawn')
        : paper.status === 'CANCELLED'
          ? t('papers.cancelled')
          : t('papers.submitted');
  const currentDecision = decisionLabel();
  const conferenceName = paper?.conferenceName || dossier?.conferenceName || '';
  const scopeLabel = submitted
    ? scope === 'ACCEPTED'
      ? t('dossier.scopeAcceptedPresented')
      : scope === 'REFUSED'
        ? t('dossier.scopeNotAccepted')
        : t('dossier.waiting')
    : null;
  const infoFacts = [
    paper?.publicId ? { label: t('dossier.paperId'), value: paper.publicId } : null,
    paper?.title ? { label: t('papers.paperTitle'), value: paper.title } : null,
    kindLabel ? { label: t('papers.kind'), value: kindLabel } : null,
    dossier?.trackName ? { label: t('papers.track'), value: dossier.trackName } : null,
    conferenceName
      ? { label: t('papers.conference'), value: conferenceName }
      : null,
    paper?.submittedAt
      ? { label: t('dossier.scheduleDate'), value: date(paper.submittedAt) }
      : null,
    { label: t('papers.colStatus'), value: paperStatusLabel },
    scopeLabel ? { label: t('dossier.scope'), value: scopeLabel } : null,
    currentDecision
      ? { label: t('dossier.decision'), value: currentDecision }
      : null,
    dossier?.doi ? { label: t('dossier.paperDoi'), value: dossier.doi } : null,
  ].filter(Boolean) as { label: string; value: string }[];
  const recordSection = (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.75fr)] lg:items-start">
      <section className="rounded-2xl border border-[#e4e7ee] bg-white p-5 sm:p-6">
          <p className="text-base font-extrabold text-[#3d4fd4]">{t('dossier.paperInfo')}</p>
          {infoFacts.length > 0 ? (
            <div className="mt-5">
              <InfoCards items={infoFacts} />
            </div>
          ) : null}
          {paper?.keywords && paper.keywords.length > 0 ? (
            <div className="mt-6">
              <p className="text-sm font-semibold text-[#3d4fd4]">{t('papers.keywords')}</p>
              <p className="mt-1 text-sm font-medium text-[#1c2744]">
                {paper.keywords.join(' · ')}
              </p>
            </div>
          ) : null}
          {depositRecord?.note ? (
            <div className="mt-6">
              <p className="text-sm font-semibold text-[#3d4fd4]">{t('papers.abstract')}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm font-medium leading-7 text-[#1c2744]">
                {depositRecord.note}
              </p>
            </div>
          ) : null}
      </section>
      <section className="rounded-2xl border border-[#e4e7ee] bg-white p-5 sm:p-6">
          <p className="text-base font-extrabold text-[#3d4fd4]">{t('papers.stepAuthors')}</p>
          {authors.length === 0 ? (
            <p className="mt-3 text-sm font-semibold text-[#5c6578]">{t('dossier.noAuthors')}</p>
          ) : (
            <ol className="mt-4 grid gap-4">
              {authors.map((author, index) => {
                const canEditAuthors =
                  Boolean(onAuthorsChange) &&
                  paper?.status !== 'WITHDRAWN' &&
                  paper?.status !== 'CANCELLED';
                const total = authors.length;
                return (
                  <li
                    key={`${author.email}-${index}`}
                    className="flex items-start justify-between gap-3"
                  >
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-[#eef2ff] text-xs font-extrabold text-[#3d4fd4]">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-extrabold text-[#1c2744]">
                          {author.lastName} {author.firstName}
                          {author.corresponding ? (
                            <span className="ml-2 rounded-full bg-[#eef2ff] px-2 py-0.5 text-[11px] font-extrabold text-[#3d4fd4]">
                              {t('papers.corresponding')}
                            </span>
                          ) : null}
                        </p>
                        {author.affiliation ? (
                          <p className="mt-0.5 text-xs font-semibold text-[#3d4660]">
                            {author.affiliation}
                          </p>
                        ) : null}
                        <p className="mt-0.5 break-all text-xs font-semibold text-[#5c6578]">
                          {author.email}
                        </p>
                      </div>
                    </div>
                    {canEditAuthors ? (
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
                              className="border-[#c5cad6] bg-white"
                              disabled={authorsBusy || index === 0}
                              aria-label={t('papers.moveUp')}
                              title={t('papers.moveUp')}
                              onClick={() =>
                                onAuthorsChange?.(moveAuthor(authors, index, index - 1))
                              }
                            >
                              <ArrowUp className="size-4" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="border-[#c5cad6] bg-white"
                              disabled={authorsBusy || index === total - 1}
                              aria-label={t('papers.moveDown')}
                              title={t('papers.moveDown')}
                              onClick={() =>
                                onAuthorsChange?.(moveAuthor(authors, index, index + 1))
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
                          className="border-[#c5cad6] bg-white text-[#c54545]"
                          disabled={authorsBusy}
                          aria-label={t('papers.removeAuthor')}
                          title={t('papers.removeAuthor')}
                          onClick={() =>
                            onAuthorsChange?.(
                              authors.filter((_, itemIndex) => itemIndex !== index),
                            )
                          }
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
      </section>
    </div>
  );
  const authorWorkbench =
    doctorantView &&
    paper?.status &&
    paper.status !== 'DRAFT' &&
    paper.status !== 'CANCELLED' &&
    authorStages.length > 0 ? (
      <section
        className="rounded-2xl border border-[#e4e7ee] bg-white"
        aria-label={t('dossier.authorWorkbench')}
      >
        <div className="rounded-t-2xl bg-[#f3f5fb] px-3 pt-2">
          <div
            className="touch-scroll flex overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label={t('dossier.authorWorkbench')}
          >
            {authorStages.map((item, index) => {
              const active = item.key === activeKey;
              const unlocked = doctorantUnlocked(
                item.key as (typeof doctorantActionKeys)[number],
              );
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPickedKey(item.key)}
                  className={`relative shrink-0 px-5 pb-3 pt-3.5 text-left first:ml-0 ${
                    index > 0 ? '-ml-2' : ''
                  } ${active ? 'z-10 -mb-px' : 'z-0'}`}
                >
                  <span
                    aria-hidden
                    className={`absolute inset-0 origin-bottom-left -skew-x-[16deg] rounded-t-lg border border-b-0 ${
                      active
                        ? 'border-[#d8dce6] bg-white'
                        : tabTint[item.key] ?? 'border-[#d8dce6] bg-[#e8edf8]'
                    }`}
                  />
                  <span
                    className={`relative block whitespace-nowrap text-sm font-extrabold leading-tight ${
                      active
                        ? 'text-[#3d4fd4]'
                        : unlocked
                          ? 'text-[#44506a]'
                          : 'text-[#8b909a]'
                    }`}
                  >
                    {item.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="relative z-10 rounded-b-2xl border-t border-[#d8dce6] bg-white p-4 sm:p-5">
          {stage ? renderAuthorTabContent(stage) : null}
        </div>
      </section>
    ) : null;
  const filesSection = (
    <section className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5">
      <h2 className="text-base font-extrabold text-[#1c2744]">{t('dossier.finalFiles')}</h2>
      <p className="mt-1 text-xs font-semibold text-[#8b909a]">
        {t('dossier.finalFilesHint')}
      </p>
      <div className="mt-3">
        {paper?.id && allFiles.length > 0 ? (
          <PaperFilesStrip
            paperId={paper.id}
            files={withFileState(allFiles, fileStateLabels)}
          />
        ) : (
          <p className="text-sm font-semibold text-[#8b909a]">{t('dossier.emptyFiles')}</p>
        )}
      </div>
    </section>
  );

  const heading = paper?.title?.trim() || t('papers.new');
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <h1 className="min-w-0 break-words text-xl font-extrabold text-[#1c2744] sm:text-2xl lg:text-3xl">
          {heading}
        </h1>
        {currentStage ? (
          <p
            aria-label={t('dossier.currentState')}
            className="shrink-0 rounded-full border border-[#e4e7ee] bg-white px-3.5 py-1.5 text-sm font-extrabold text-[#1c2744]"
          >
            <span className="text-[#3d4fd4]">{t('dossier.currentState')}</span>
            <span className="mx-1.5 text-[#c5cad6]">·</span>
            {currentNumber}. {currentStage.title}
            <span className="mx-1.5 text-[#c5cad6]">·</span>
            <span className={currentBadgeTone}>{currentStage.status}</span>
          </p>
        ) : null}
      </div>

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

      {recordSection}

      {doctorantView && children ? children : null}

      {authorWorkbench}

      {doctorantView ? null : (
        <div className="grid gap-4 lg:grid-cols-[13.5rem_minmax(0,1fr)]">
          {actionsNav}
          <div className="space-y-4">
            {stage && (stage.key !== 'deposit' || children || extras?.deposit)
              ? renderStageBody(stage, stageNumber)
              : null}
          </div>
        </div>
      )}

      {filesSection}
    </div>
  );
}
