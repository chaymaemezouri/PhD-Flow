import { LayoutGrid, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PapersLayout } from '@/features/papers/papers-layout';

export function PapersLayoutToggle({
  layout,
  onChange,
  labelKey = 'papers.layoutLabel',
}: {
  layout: PapersLayout;
  onChange: (layout: PapersLayout) => void;
  labelKey?: string;
}) {
  const { t } = useTranslation();

  return (
    <div
      className="inline-flex w-full rounded-xl border border-[#e4e7ee] bg-white p-1 sm:w-auto"
      role="group"
      aria-label={t(labelKey)}
    >
      <button
        type="button"
        onClick={() => onChange('cards')}
        aria-pressed={layout === 'cards'}
        title={t('papers.layoutCards')}
        className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold transition sm:flex-none ${
          layout === 'cards'
            ? 'bg-[#eef0f8] text-[#1c2744]'
            : 'text-[#8b909a] hover:text-[#1c2744]'
        }`}
      >
        <LayoutGrid className="size-3.5" />
        {t('papers.layoutCards')}
      </button>
      <button
        type="button"
        onClick={() => onChange('list')}
        aria-pressed={layout === 'list'}
        title={t('papers.layoutList')}
        className={`inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-extrabold transition sm:flex-none ${
          layout === 'list'
            ? 'bg-[#eef0f8] text-[#1c2744]'
            : 'text-[#8b909a] hover:text-[#1c2744]'
        }`}
      >
        <List className="size-3.5" />
        {t('papers.layoutList')}
      </button>
    </div>
  );
}
