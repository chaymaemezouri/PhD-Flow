import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const tones = {
  neutral: 'bg-secondary text-secondary-foreground',
  info: 'bg-accent text-accent-foreground',
  success: 'bg-teal/15 text-teal',
  warning: 'bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100',
  danger: 'bg-destructive/10 text-destructive',
} as const;

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: keyof typeof tones;
};

export function Badge({ className, tone = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
