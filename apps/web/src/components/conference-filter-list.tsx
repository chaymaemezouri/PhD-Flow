import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type ConferenceOption = {
  id: string;
  name: string;
};

export function ConferenceFilterList({
  items,
  value,
  onChange,
}: {
  items: ConferenceOption[];
  value?: string;
  onChange: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  if (items.length <= 1) {
    return null;
  }
  const selected = items.find((item) => item.id === value);

  return (
    <div className="relative min-w-0 max-w-xl">
      <p className="text-sm font-bold text-[#1c2744]">{t('nav.conferences')}</p>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="mt-1.5 flex min-h-10 w-full items-center justify-between gap-2 rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-left text-sm font-semibold text-[#1c2744]"
      >
        <span className="truncate">
          {selected?.name ?? t('papers.chooseConference')}
        </span>
        <ChevronDown className="size-4 shrink-0 text-[#8b909a]" />
      </button>
      {open ? (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-[#e4e7ee] bg-white py-1 shadow-[0_12px_32px_rgba(28,39,68,0.12)]">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(item.id);
                  setOpen(false);
                }}
                className={`flex w-full px-3 py-2 text-left text-sm ${
                  item.id === value
                    ? 'bg-[#f6f7fb] font-extrabold text-[#1c2744]'
                    : 'font-semibold text-[#1c2744] hover:bg-[#f6f7fb]'
                }`}
              >
                {item.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
