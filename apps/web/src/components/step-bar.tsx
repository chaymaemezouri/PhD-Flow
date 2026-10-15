import { useTranslation } from 'react-i18next';

export interface PaperStep {
  key: string;
  state: 'done' | 'pending' | 'failed';
}

const tone = {
  done: 'bg-[#2fbf71]',
  pending: 'bg-[#f0a04b]',
  failed: 'bg-[#e35d5d]',
} as const;

export function focusStep(steps: PaperStep[]): PaperStep | null {
  return steps.find((step) => step.state === 'failed') ?? steps.find((step) => step.state === 'pending') ?? null;
}

export function stepAction(paperId: string, key: string): string {
  if (key === 'presentation') {
    return '/workspace/program';
  }
  if (key === 'registration') {
    return '/workspace/conferences';
  }
  if (key === 'submission' || key === 'track') {
    return `/workspace/submissions/${paperId}`;
  }
  return `/workspace/follow-up?paper=${paperId}`;
}

export function StepLegend() {
  const { t } = useTranslation();
  return (
    <p className="mb-3 flex flex-wrap gap-3 text-xs font-bold text-[#6d7690]">
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-[#2fbf71]" />
        {t('workflow.stepDone')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-[#f0a04b]" />
        {t('workflow.stepPending')}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-[#e35d5d]" />
        {t('workflow.stepFailed')}
      </span>
    </p>
  );
}

export function StepBar({ steps }: { steps: PaperStep[] }) {
  const { t } = useTranslation();
  if (steps.length === 0) {
    return null;
  }
  return (
    <ol className="mt-3 grid w-full grid-cols-5 gap-x-2 gap-y-3 sm:grid-cols-10">
      {steps.map((step) => (
        <li key={step.key} className="min-w-0">
          <span className={`block h-2 rounded-full ${tone[step.state]}`} />
          <span className="mt-1 block text-[10px] font-bold leading-tight text-[#243044]">
            {t(`workflow.steps.${step.key}`)}
          </span>
          <span className="sr-only">{t(`workflow.step${step.state === 'done' ? 'Done' : step.state === 'failed' ? 'Failed' : 'Pending'}`)}</span>
        </li>
      ))}
    </ol>
  );
}
