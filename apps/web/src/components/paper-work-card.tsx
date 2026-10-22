import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { focusStep, stepAction, type PaperStep } from '@/components/step-bar';

export interface WorkPaper {
  id: string;
  title: string;
  status: string;
  publicId: string | null;
  conferenceName?: string | null;
  steps?: PaperStep[];
}

const stageLabel: Record<string, string> = {
  submission: 'dossier.deposit',
  notification: 'dossier.decision',
  track: 'dossier.scope',
  presentation: 'dossier.presentation',
  registration: 'dossier.registration',
  editable: 'dossier.camera',
  cameraPdf: 'dossier.camera',
  template: 'dossier.camera',
  similarity: 'dossier.camera',
  copyright: 'dossier.copyright',
};

export type PaperWorkTone = 'alert' | 'wait' | 'done';

export function paperWorkMeta(
  paper: WorkPaper,
  t: (key: string) => string,
): {
  href: string;
  tone: PaperWorkTone;
  label: string;
  stepName: string;
  done: number;
  total: number;
  progress: number;
  statusLabel: string;
} {
  const steps = paper.steps ?? [];
  const focus = focusStep(steps);
  const href = stepAction(paper.id);
  const done = steps.filter((step) => step.state === 'done').length;
  const total = steps.length || 10;
  const progress = steps.length === 0 ? 0 : Math.round((done / steps.length) * 100);
  const tone: PaperWorkTone =
    focus?.state === 'failed' ? 'alert' : focus ? 'wait' : 'done';
  const label = focus
    ? t(`home.actions.${focus.key}.${focus.state}`)
    : paper.status === 'DRAFT'
      ? t('papers.draft')
      : t('home.clear');
  const stepName = focus
    ? t(stageLabel[focus.key] ?? `workflow.steps.${focus.key}`)
    : paper.status === 'DRAFT'
      ? t('dossier.deposit')
      : t('dossier.final');
  const statusLabel =
    tone === 'alert'
      ? t('home.blocked')
      : tone === 'wait'
        ? t('home.waiting')
        : t('home.doneSteps');

  return { href, tone, label, stepName, done, total, progress, statusLabel };
}

const toneStyles = {
  alert: {
    bar: 'bg-[#e35d5d]/40',
    badge: 'bg-[#e35d5d]/10 text-[#c54545]',
    text: 'text-[#c54545]',
  },
  wait: {
    bar: 'bg-[#f0a04b]/45',
    badge: 'bg-[#f0a04b]/14 text-[#9a6410]',
    text: 'text-[#9a6410]',
  },
  done: {
    bar: 'bg-[#2fbf71]/40',
    badge: 'bg-[#2fbf71]/12 text-[#1c9a57]',
    text: 'text-[#1c9a57]',
  },
} as const;

export function PaperWorkCard({ paper }: { paper: WorkPaper }) {
  const { t } = useTranslation();
  const meta = paperWorkMeta(paper, t);
  const styles = toneStyles[meta.tone];

  return (
    <Link
      to={meta.href}
      className="flex h-full flex-col rounded-xl border border-[#e4e7ee] bg-white p-4 text-[#1c2744] no-underline lg:p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold tracking-wide text-[#6d7585]">
          {paper.publicId ?? t('papers.draft')}
        </p>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${styles.badge}`}
        >
          {meta.statusLabel}
        </span>
      </div>
      {paper.conferenceName ? (
        <p className="mt-1.5 truncate text-[11px] font-bold text-[#8b909a]">
          {paper.conferenceName}
        </p>
      ) : null}
      <h3 className="mt-1 truncate text-base font-extrabold lg:mt-2 lg:text-sm">
        {paper.title}
      </h3>
      {meta.label === meta.stepName ? null : (
        <p className={`mt-1 text-sm font-semibold lg:text-xs ${styles.text}`}>
          {meta.label}
        </p>
      )}
      <div className="mt-4 flex items-center gap-3 lg:mt-3 lg:gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#eef1f6]">
          <div
            className={`h-full rounded-full ${styles.bar}`}
            style={{ width: `${meta.progress}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-bold text-[#6d7585]">
          {meta.stepName} · {meta.done}/{meta.total}
        </span>
        <ArrowUpRight className="size-4 shrink-0 text-[#8b909a]" />
      </div>
    </Link>
  );
}

export function PaperWorkListRow({ paper }: { paper: WorkPaper }) {
  const { t } = useTranslation();
  const meta = paperWorkMeta(paper, t);
  const styles = toneStyles[meta.tone];

  return (
    <tr className="bg-[#f6f7fb] text-[#1c2744]">
      <td className="rounded-l-2xl px-3 py-3 align-middle">
        <p className="text-xs font-bold tracking-wide text-[#8b909a]">
          {paper.publicId ?? t('papers.draft')}
        </p>
      </td>
      <td className="max-w-[18rem] px-3 py-3 align-middle sm:max-w-none">
        {paper.conferenceName ? (
          <p className="mb-0.5 truncate text-[11px] font-bold text-[#8b909a]">
            {paper.conferenceName}
          </p>
        ) : null}
        <Link
          to={meta.href}
          className="block truncate text-sm font-extrabold text-[#1c2744] no-underline"
        >
          {paper.title}
        </Link>
        {meta.label === meta.stepName ? null : (
          <p className={`mt-0.5 truncate text-xs font-semibold ${styles.text}`}>
            {meta.label}
          </p>
        )}
      </td>
      <td className="hidden px-3 py-3 align-middle md:table-cell">
        <p className="text-sm font-bold text-[#5c6578]">{meta.stepName}</p>
      </td>
      <td className="hidden px-3 py-3 align-middle lg:table-cell">
        <div className="flex min-w-[8rem] items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white">
            <div
              className={`h-full rounded-full ${styles.bar}`}
              style={{ width: `${meta.progress}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-bold text-[#8b909a]">
            {meta.done}/{meta.total}
          </span>
        </div>
      </td>
      <td className="px-3 py-3 align-middle">
        <span
          className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${styles.badge}`}
        >
          {meta.statusLabel}
        </span>
      </td>
      <td className="rounded-r-2xl px-3 py-3 text-right align-middle">
        <Link
          to={meta.href}
          className="inline-flex items-center gap-1 text-sm font-extrabold text-[#3d4fd4] no-underline"
        >
          {t('papers.open')}
          <ArrowUpRight className="size-4" />
        </Link>
      </td>
    </tr>
  );
}
