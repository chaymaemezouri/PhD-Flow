import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function IconAction({
  icon: Icon,
  label,
  onClick,
  href,
  download,
  tone = 'neutral',
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  download?: string | boolean;
  tone?: 'neutral' | 'danger' | 'accent';
  disabled?: boolean;
}) {
  const className = cn(
    'inline-grid size-9 shrink-0 place-items-center rounded-xl border transition disabled:opacity-40',
    tone === 'danger'
      ? 'border-[#f3d0d0] bg-[#fff5f5] text-[#c54545] hover:bg-[#fde8e8]'
      : tone === 'accent'
        ? 'border-[#cfd6f5] bg-[#eef2ff] text-[#3d4fd4] hover:bg-[#e4e9ff]'
        : 'border-[#e4e7ee] bg-white text-[#5c6578] hover:bg-[#f6f7fb] hover:text-[#1c2744]',
  );

  if (href && !disabled) {
    return (
      <a
        href={href}
        download={download}
        aria-label={label}
        title={label}
        className={className}
      >
        <Icon className="size-4" />
      </a>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={className}
    >
      <Icon className="size-4" />
    </button>
  );
}
