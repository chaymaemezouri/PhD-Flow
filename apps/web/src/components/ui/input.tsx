import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-xl border border-[#c5cad6] bg-white px-3 text-sm font-semibold text-[#1c2744] shadow-[inset_0_1px_2px_rgba(28,39,68,0.04)] outline-none placeholder:font-medium placeholder:text-[#8b909a] focus:border-[#3d4fd4] focus:ring-2 focus:ring-[#3d4fd4]/20 disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...props}
    />
  );
}
