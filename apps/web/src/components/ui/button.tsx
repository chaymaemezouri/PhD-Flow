import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-xs font-bold transition-colors disabled:pointer-events-none disabled:opacity-50 sm:min-h-9 sm:gap-2',
  {
    variants: {
      variant: {
        default: 'bg-[#5d74ff]/85 text-white hover:bg-[#5d74ff]',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border border-border bg-card hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-8 px-3 text-xs sm:h-9 sm:px-3.5',
        sm: 'h-7 px-2.5 text-[11px]',
        lg: 'h-9 px-3.5 sm:h-10 sm:px-4 sm:text-sm',
        icon: 'size-8 sm:size-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
