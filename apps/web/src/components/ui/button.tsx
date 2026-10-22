import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-bold transition-colors disabled:pointer-events-none disabled:opacity-50 lg:min-h-8 lg:gap-1.5 lg:text-xs',
  {
    variants: {
      variant: {
        default: 'bg-[#5d74ff] text-white hover:bg-[#4c63f0]',
        secondary:
          'bg-[#eef2ff] text-[#3d4fd4] hover:bg-[#e0e7ff]',
        outline:
          'border border-[#c5cad6] bg-white text-[#1c2744] hover:bg-[#f6f7fb]',
        ghost: 'text-[#3d4fd4] hover:bg-[#eef2ff] hover:text-[#3d4fd4]',
      },
      size: {
        default: 'h-10 px-4 lg:h-8 lg:px-3',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-5 lg:h-9 lg:px-3.5',
        icon: 'size-10 lg:size-8',
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
