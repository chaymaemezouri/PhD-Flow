import { brandColors } from '@scholarflow/ui';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';

export function Wordmark({ light = false }: { light?: boolean }) {
  const { t } = useTranslation();
  return (
    <Link to="/" className="flex items-center gap-2 no-underline">
      <span
        className="grid size-8 place-items-center rounded-md text-sm font-semibold"
        style={{
          backgroundColor: light ? '#f6f1e7' : brandColors.navy,
          color: light ? brandColors.navy : brandColors.paper,
        }}
      >
        PM
      </span>
      <span className="leading-tight">
        <span
          className={`block font-serif text-lg ${light ? 'text-white' : 'text-navy'}`}
        >
          {t('brand.name')}
        </span>
        <span
          className={`hidden text-[11px] tracking-wide sm:block ${light ? 'text-white/70' : 'text-muted-foreground'}`}
        >
          {t('brand.tagline')}
        </span>
      </span>
    </Link>
  );
}
