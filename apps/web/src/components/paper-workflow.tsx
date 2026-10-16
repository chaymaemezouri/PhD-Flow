import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PaperFilesStrip, type PaperFileInfo } from '@/components/paper-file-preview';
import { StagePanel } from '@/components/stage-panel';
import { Button } from '@/components/ui/button';

export interface PaperDossier {
  paperKind: 'ABSTRACT' | 'FULL';
  scopeStatus: 'PENDING' | 'ACCEPTED' | 'REFUSED';
  trackName: string | null;
  canManage: boolean;
  templateValidated: boolean;
  doi: string | null;
  files: PaperFileInfo[];
  similarity: { percentage: number; verified: boolean } | null;
  copyrightStatus: string | null;
  presented: boolean;
  presentedAt: string | null;
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
}

interface WorkflowPaper {
  id: string;
  status: string;
  publicId: string | null;
  submittedAt: string | null;
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
  onScope?: (accept: boolean) => void;
  extras?: Partial<Record<string, ReactNode>>;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const dossier = paper?.dossier;
  const submitted = paper?.status === 'SUBMITTED';
  const withdrawn = paper?.status === 'WITHDRAWN';
  const progressed = (dossier?.reviews.length ?? 0) > 0 || Boolean(paper?.decision);
  const scope =
    dossier?.scopeStatus === 'PENDING' && progressed
      ? 'ACCEPTED'
      : (dossier?.scopeStatus ?? 'PENDING');
  const stopped = withdrawn || scope === 'REFUSED' || paper?.decision?.outcome === 'REJECTED';
  const accepted =
    paper?.decision?.status === 'PUBLISHED' &&
    (paper.decision.outcome === 'ACCEPTED' || paper.decision.outcome === 'CONDITIONALLY_ACCEPTED');
  const registered =
    dossier?.registration?.status === 'VERIFIED' ||
    dossier?.registration?.paymentStatus === 'VERIFIED';
  const publishable =
    accepted &&
    hasFile(dossier, 'EDITABLE') &&
    hasFile(dossier, 'CAMERA_READY') &&
    Boolean(dossier?.templateValidated) &&
    Boolean(dossier?.similarity?.verified) &&
    (dossier?.similarity?.percentage ?? 100) < 20 &&
    dossier?.copyrightStatus === 'VALIDATED' &&
    Boolean(dossier?.presented) &&
    !dossier?.doi;
  const reviewsSent = dossier?.reviews.filter((item) => item.recommendation) ?? [];
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

  const stages: {
    key: string;
    title: string;
    actor: string;
    tone: Tone;
    status: string;
    lines: string[];
    extra?: ReactNode;
  }[] = [
    {
      key: 'deposit',
      title: t('dossier.deposit'),
      actor: t('dossier.depositActor'),
      tone: !paper || paper.status === 'DRAFT' ? 'current' : withdrawn ? 'stop' : 'done',
      status: !paper || paper.status === 'DRAFT' ? t('dossier.notCompleted') : t('dossier.completed'),
      lines: [],
      extra: null,
    },
    {
      key: 'scope',
      title: t('dossier.scope'),
      actor: t('dossier.scopeActor'),
      tone: !submitted ? 'later' : scope === 'REFUSED' ? 'stop' : scope === 'ACCEPTED' ? 'done' : 'current',
      status: !submitted
        ? t('dossier.later')
        : scope === 'ACCEPTED'
          ? t('dossier.accept')
          : scope === 'REFUSED'
            ? t('dossier.refuse')
            : t('dossier.waiting'),
      lines: [
        dossier?.trackName
          ? `${t('papers.track')} : ${dossier.trackName}`
          : t('dossier.scopePending'),
        scope === 'ACCEPTED'
          ? t('dossier.scopeAccepted')
          : scope === 'REFUSED'
            ? t('dossier.scopeRefused')
            : `${t('dossier.accept')} : ${t('dossier.scopeAccepted')}`,
        scope === 'PENDING' && submitted ? `${t('dossier.refuse')} : ${t('dossier.scopeRefused')}` : '',
      ].filter(Boolean),
      extra:
        submitted && scope === 'PENDING' && dossier?.canManage && onScope ? (
          <div className="mt-4">
            <StagePanel
              title={t('dossier.scope')}
              hint={t('dossier.scopePending')}
              status={t('dossier.waiting')}
              statusTone="wait"
            >
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => onScope(true)}>
                  {t('dossier.accept')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-[#c5cad6]"
                  onClick={() => onScope(false)}
                >
                  {t('dossier.refuse')}
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
          : reviewsSent.length > 0
            ? 'done'
            : (dossier?.reviews.length ?? 0) > 0
              ? 'current'
              : 'wait',
      status:
        scope !== 'ACCEPTED'
          ? t('dossier.later')
          : reviewsSent.length > 0
            ? t('dossier.reviewSubmitted')
            : (dossier?.reviews.length ?? 0) > 0
              ? t('dossier.assigned')
              : t('dossier.notAssigned'),
      lines:
        dossier && dossier.reviews.length > 0
          ? dossier.reviews.map((item) => {
              const who = item.reviewer || t('dossier.reviewActor');
              return `${who} · ${date(item.assignedAt)} → ${date(item.dueAt)} · ${advice(item.recommendation)}${item.comments ? ` · ${item.comments}` : ''}`;
            })
          : [t('dossier.noReview')],
    },
    {
      key: 'decision',
      title: t('dossier.decision'),
      actor: t('dossier.decisionActor'),
      tone: stopped && paper?.decision?.outcome === 'REJECTED' ? 'stop' : accepted ? 'done' : scope === 'ACCEPTED' ? 'wait' : 'later',
      status:
        paper?.decision?.outcome === 'REJECTED'
          ? t('dossier.ended')
          : paper?.decision?.outcome === 'REVISION_REQUIRED' ||
              paper?.decision?.outcome === 'CONDITIONALLY_ACCEPTED'
            ? t('dossier.adviceChanges')
            : accepted
              ? t('dossier.keep')
              : scope === 'ACCEPTED'
                ? t('dossier.waiting')
                : t('dossier.later'),
      lines: [
        paper?.decision?.outcome === 'REJECTED'
          ? t('dossier.rejected')
          : paper?.decision?.outcome === 'REVISION_REQUIRED' ||
              paper?.decision?.outcome === 'CONDITIONALLY_ACCEPTED'
            ? t('dossier.withChanges')
            : accepted
              ? t('dossier.keep')
              : t('dossier.waiting'),
        paper?.decision?.letter ?? '',
      ].filter(Boolean),
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
          : dossier?.registration?.status === 'REQUESTED'
            ? t('dossier.registrationSent')
            : t('dossier.notRegistered'),
      lines: [
        !accepted
          ? t('dossier.notRegistered')
          : registered
            ? t('dossier.paymentDone')
            : dossier?.registration?.paymentStatus === 'PENDING'
              ? t('dossier.paymentWait')
              : dossier?.registration?.status === 'REQUESTED'
                ? t('dossier.registrationSentLine')
                : t('dossier.notRegistered'),
      ],
    },
    {
      key: 'presentation',
      title: t('dossier.presentation'),
      actor: t('dossier.presentationActor'),
      tone: dossier?.presented ? 'done' : dossier?.slides ? 'wait' : accepted ? 'current' : 'later',
      status: !accepted
        ? t('dossier.later')
        : dossier?.presented
          ? t('dossier.presented')
          : dossier?.slides
            ? t('dossier.pptSent')
            : t('dossier.notPresented'),
      lines: [
        ...(dossier?.sessionChairs?.length
          ? dossier.sessionChairs.map((item) => item.name)
          : [t('dossier.noChair')]),
        dossier?.slides ? t('dossier.pptSent') : t('dossier.pptWait'),
        dossier?.sessionComment ? dossier.sessionComment : t('dossier.chairNote'),
      ],
    },
    {
      key: 'camera',
      title: t('dossier.camera'),
      actor: t('dossier.cameraActor'),
      tone:
        hasFile(dossier, 'EDITABLE') &&
        hasFile(dossier, 'CAMERA_READY') &&
        dossier?.templateValidated &&
        dossier.similarity?.verified &&
        dossier.similarity.percentage < 20
          ? 'done'
          : accepted
            ? 'current'
            : 'later',
      status:
        hasFile(dossier, 'EDITABLE') &&
        hasFile(dossier, 'CAMERA_READY') &&
        dossier?.templateValidated &&
        dossier.similarity?.verified &&
        dossier.similarity.percentage < 20
          ? t('dossier.ready')
          : accepted
            ? t('dossier.waiting')
            : t('dossier.later'),
      lines: [
        `${t('dossier.cameraWord')} : ${check(hasFile(dossier, 'EDITABLE'))}`,
        `${t('dossier.cameraPdf')} : ${check(hasFile(dossier, 'CAMERA_READY'))}`,
        `${t('dossier.cameraTemplate')} : ${check(Boolean(dossier?.templateValidated))}`,
        `${t('dossier.cameraSimilarity')} : ${
          dossier?.similarity
            ? `${dossier.similarity.percentage} %${dossier.similarity.verified ? ` · ${t('dossier.ready')}` : ''}`
            : t('dossier.missing')
        }`,
      ],
    },
    {
      key: 'copyright',
      title: t('dossier.copyright'),
      actor: t('dossier.copyrightActor'),
      tone: dossier?.copyrightStatus === 'VALIDATED' ? 'done' : dossier?.copyrightStatus === 'REJECTED' ? 'stop' : accepted ? 'wait' : 'later',
      status: !accepted
        ? t('dossier.later')
        : dossier?.copyrightStatus === 'VALIDATED'
          ? t('dossier.ready')
          : dossier?.copyrightStatus === 'REJECTED'
            ? t('dossier.refuse')
            : t('dossier.missing'),
      lines: [
        t('dossier.copyrightSteps'),
        hasFile(dossier, 'COPYRIGHT') ? t('dossier.completed') : t('dossier.missing'),
        dossier?.copyrightStatus === 'VALIDATED'
          ? t('dossier.ready')
          : dossier?.copyrightStatus === 'REJECTED'
            ? t('dossier.refuse')
            : t('dossier.waiting'),
      ],
    },
    {
      key: 'final',
      title: t('dossier.final'),
      actor: t('dossier.finalActor'),
      tone: dossier?.doi ? 'done' : publishable ? 'current' : stopped ? 'stop' : 'later',
      status: dossier?.doi
        ? t('dossier.finalReady')
        : publishable
          ? t('dossier.readyToPublish')
          : stopped
            ? t('dossier.ended')
            : t('dossier.later'),
      lines: [
        dossier?.doi
          ? `${t('dossier.finalReady')} ${dossier.doi}`
          : publishable
            ? t('dossier.adminPublishes')
            : stopped
              ? t('dossier.ended')
              : t('dossier.attestation'),
      ],
    },
  ];

  const openIndex = stages.findIndex(
    (stage) => stage.tone === 'current' || stage.tone === 'wait' || stage.tone === 'stop',
  );
  const [picked, setPicked] = useState<number | null>(null);
  const selected = picked ?? (openIndex >= 0 ? openIndex : 0);
  const stage = stages[selected];

  return (
    <div className="space-y-4">
      <ol className="touch-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-2 snap-x snap-mandatory">
        {stages.map((item, index) => {
          const active = index === selected;
          return (
            <li key={item.key} className="w-[min(70vw,11rem)] shrink-0 snap-start sm:min-w-36 sm:flex-1 sm:w-auto">
              <button
                type="button"
                aria-expanded={active}
                className={`h-full min-h-20 w-full rounded-2xl border px-3 py-3 text-left ${tone[item.tone]} ${
                  active ? 'ring-2 ring-[#1c2744]/20' : ''
                }`}
                onClick={() => setPicked(index)}
              >
                <span className="block text-sm font-extrabold leading-snug text-[#1c2744]">
                  {index + 1}. {item.title}
                </span>
                <span className="mt-1 block text-xs font-bold leading-snug text-[#5c6578]">
                  {item.status}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {stage ? (
        <section className="rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-[#1c2744] sm:text-lg">
                {selected + 1}. {stage.title}
              </h2>
              <p className="mt-1 text-xs font-bold text-[#8b909a]">{stage.actor}</p>
            </div>
            <span className="rounded-full bg-[#f6f7fb] px-3 py-1 text-xs font-extrabold text-[#1c2744]">
              {stage.status}
            </span>
          </div>
          {stage.key === 'deposit' && paper ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-[#d8dce6] bg-[#f6f7fb] px-3 py-1 text-xs font-extrabold text-[#1c2744]">
                  {dossier?.paperKind === 'ABSTRACT' ? t('dossier.abstract') : t('dossier.full')}
                </span>
                <span className="rounded-full border border-[#d8dce6] bg-[#f6f7fb] px-3 py-1 text-xs font-extrabold text-[#1c2744]">
                  {paper.publicId ?? t('dossier.noId')}
                </span>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-extrabold ${
                    paper.status === 'SUBMITTED'
                      ? 'bg-[#2fbf71]/14 text-[#1c9a57]'
                      : paper.status === 'WITHDRAWN'
                        ? 'bg-[#e35d5d]/12 text-[#c54545]'
                        : 'bg-[#f0a04b]/16 text-[#9a6410]'
                  }`}
                >
                  {paper.status === 'DRAFT'
                    ? t('papers.draft')
                    : paper.status === 'WITHDRAWN'
                      ? t('papers.withdrawn')
                      : t('papers.submitted')}
                </span>
              </div>
              {paper.id && dossier?.files?.some((file) => file.kind === 'MANUSCRIPT') ? (
                <PaperFilesStrip
                  paperId={paper.id}
                  files={dossier.files}
                  kinds={['MANUSCRIPT', 'REVISION']}
                />
              ) : null}
            </div>
          ) : null}
          {stage.key !== 'deposit' && stage.lines.length > 0 ? (
            <ul className="mt-3 grid gap-1">
              {stage.lines.map((line, lineIndex) => (
                <li
                  key={`${stage.key}-${lineIndex}`}
                  className="text-sm leading-relaxed text-[#5c6578]"
                >
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
          {paper?.id && dossier?.files?.length && stage.key === 'decision' ? (
            <PaperFilesStrip
              paperId={paper.id}
              files={dossier.files}
              kinds={['REVISION']}
            />
          ) : null}
          {stage.key === 'deposit' && children ? (
            <div className="mt-5 border-t border-[#e4e7ee] pt-5">{children}</div>
          ) : null}
          {stage.extra}
          {extras?.[stage.key]}
        </section>
      ) : null}
    </div>
  );
}
