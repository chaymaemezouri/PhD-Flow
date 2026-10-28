import { Printer } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { IconAction } from '@/components/icon-action';
import { cn } from '@/lib/utils';

export function PrintPageButton({
  labelKey = 'print.page',
  variant = 'button',
  className,
}: {
  labelKey?: string;
  variant?: 'button' | 'icon' | 'outline';
  className?: string;
}) {
  const { t } = useTranslation();
  const label = t(labelKey);

  if (variant === 'icon') {
    return <IconAction icon={Printer} label={label} onClick={() => window.print()} />;
  }

  return (
    <Button
      type="button"
      variant={variant === 'outline' ? 'outline' : 'default'}
      size="sm"
      className={cn('print:hidden gap-2', className)}
      onClick={() => window.print()}
    >
      <Printer className="size-4" aria-hidden />
      {label}
    </Button>
  );
}
