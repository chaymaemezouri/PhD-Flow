import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function StagePanel({
  title,
  hint,
  status,
  statusTone = 'neutral',
  children,
  className,
}: {
  title: string;
  hint?: string;
  status?: string;
  statusTone?: 'ok' | 'wait' | 'missing' | 'neutral';
  children?: ReactNode;
  className?: string;
}) {
  const tone =
    statusTone === 'ok'
      ? 'bg-[#2fbf71]/14 text-[#1c9a57]'
      : statusTone === 'wait'
        ? 'bg-[#f0a04b]/16 text-[#9a6410]'
        : statusTone === 'missing'
          ? 'bg-white text-[#8b909a]'
          : 'bg-white text-[#5c6578]';

  return (
    <div
      className={cn(
        'rounded-2xl border border-[#d8dce6] bg-[#f6f7fb] p-3 sm:p-4',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-[#1c2744]">{title}</p>
          {hint ? (
            <p className="mt-0.5 text-xs font-semibold text-[#8b909a]">{hint}</p>
          ) : null}
        </div>
        {status ? (
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${tone}`}>
            {status}
          </span>
        ) : null}
      </div>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export function InfoGrid({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  if (items.length === 0) {
    return null;
  }
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {items.map((item) => (
        <div key={`${item.label}-${item.value}`}>
          <dt className="text-xs font-extrabold text-[#8b909a]">{item.label}</dt>
          <dd className="font-semibold text-[#1c2744]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const stageField =
  'mt-1.5 block w-full rounded-xl border border-[#c5cad6] bg-white px-3 py-2.5 text-sm font-semibold text-[#1c2744] outline-none focus:border-[#3d4fd4] focus:ring-2 focus:ring-[#3d4fd4]/20';
