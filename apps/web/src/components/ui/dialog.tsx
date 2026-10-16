import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogTitle = DialogPrimitive.Title;
export const DialogDescription = DialogPrimitive.Description;

export function DialogContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[#1c2744]/35 backdrop-blur-[2px]" />
      <DialogPrimitive.Content
        className={cn(
          'fixed z-50 overflow-y-auto border border-[#e4e7ee] bg-white shadow-[0_24px_60px_rgba(28,39,68,0.18)]',
          'inset-x-0 bottom-0 max-h-[min(92dvh,40rem)] w-full rounded-t-[28px] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]',
          'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[min(90vh,720px)] sm:w-[min(100%-1.5rem,34rem)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[28px] sm:p-6 sm:pb-6',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute top-3 right-3 grid size-10 place-items-center rounded-full text-[#8b909a] hover:bg-[#f4f6fb] hover:text-[#1c2744] sm:top-4 sm:right-4 sm:size-auto sm:p-1.5">
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
