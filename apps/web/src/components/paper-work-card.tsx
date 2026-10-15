import { ArrowUpRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { focusStep, stepAction, type PaperStep } from '@/components/step-bar';

export interface WorkPaper {
  id: string;
  title: string;
  status: string;
  publicId: string | null;
  steps?: PaperStep[];
}

export function PaperWorkCard({ paper }: { paper: WorkPaper }) {
  const { t } = useTranslation();
  const steps = paper.steps ?? [];
  const focus = focusStep(steps);
  const href = focus
    ? stepAction(paper.id, focus.key)
    : `/workspace/submissions/${paper.id}`;
  const done = steps.filter((step) => step.state === 'done').length;
  const progress = steps.length === 0 ? 0 : Math.round((done / steps.length) * 100);
  const tone = focus?.state === 'failed' ? 'alert' : focus ? 'wait' : 'done';
  const styles = {
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
  }[tone];
  const label = focus
    ? t(`home.actions.${focus.key}.${focus.state}`)
    : paper.status === 'DRAFT'
      ? t('papers.draft')
      : t('home.clear');
  const stepName = focus
    ? t(`workflow.steps.${focus.key}`)
    : paper.status === 'DRAFT'
      ? t('papers.draft')
      : t('home.clear');

  return (
    <Link
      to={href}
      className="flex h-full flex-col rounded-xl border border-[#e4e7ee] bg-white p-4 text-[#1c2744] no-underline"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold tracking-wide text-[#6d7585]">
          {paper.publicId ?? t('papers.draft')}
        </p>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${styles.badge}`}
        >
          {tone === 'alert'
            ? t('home.blocked')
            : tone === 'wait'
              ? t('home.waiting')
              : t('home.doneSteps')}
        </span>
      </div>
      <h3 className="mt-2 truncate text-base font-extrabold">{paper.title}</h3>
      {label === stepName ? null : (
        <p className={`mt-1 text-sm font-semibold ${styles.text}`}>{label}</p>
      )}
      <div className="mt-4 flex items-center gap-3">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-[#eef1f6]">
          <div
            className={`h-full rounded-full ${styles.bar}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-bold text-[#6d7585]">
          {stepName} · {done}/{steps.length || 10}
        </span>
        <ArrowUpRight className="size-4 shrink-0 text-[#8b909a]" />
      </div>
    </Link>
  );
}
