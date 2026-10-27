import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface AssignmentOption {
  id: string;
  title: string;
  subtitle?: string;
  code?: string;
  group?: string;
}

export interface AssignmentFilter {
  id: string;
  label: string;
}

const avatarTones = [
  'bg-[#3d4fd4]',
  'bg-[#7c3aed]',
  'bg-[#db2777]',
  'bg-[#0f766e]',
  'bg-[#ea580c]',
  'bg-[#2563eb]',
];

const PAGE_SIZE = 7;

function toneFor(id: string) {
  let hash = 0;
  for (const char of id) {
    hash = (hash + char.charCodeAt(0) * 17) % avatarTones.length;
  }
  return avatarTones[hash] ?? avatarTones[0];
}

function initials(title: string) {
  const parts = title.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return '•';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function AssignmentField({
  label,
  name,
  value,
  onChange,
  options,
  placeholder,
  title,
  hint,
  filters,
  disabled,
  required,
  className,
}: {
  label: string;
  name?: string;
  value: string;
  onChange: (id: string) => void;
  options: AssignmentOption[];
  placeholder: string;
  title: string;
  hint?: string;
  filters?: AssignmentFilter[];
  disabled?: boolean;
  required?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.id === value) ?? null;

  return (
    <div className={cn('block text-sm font-bold', className)}>
      <span>{label}</span>
      {name ? <input type="hidden" name={name} value={value} required={required} /> : null}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="mt-1.5 flex min-h-10 w-full items-center justify-between gap-2 rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2 text-left text-sm font-semibold text-[#1c2744] disabled:opacity-60"
      >
        <span className={selected ? 'truncate' : 'truncate text-[#8b909a]'}>
          {selected
            ? selected.subtitle
              ? `${selected.title} · ${selected.subtitle}`
              : selected.title
            : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-[#8b909a]" />
      </button>
      <AssignmentPicker
        open={open}
        onOpenChange={setOpen}
        title={title}
        hint={hint}
        options={options}
        value={value}
        filters={filters}
        onConfirm={(id) => {
          onChange(id);
          setOpen(false);
        }}
      />
    </div>
  );
}

export function AssignmentPicker({
  open,
  onOpenChange,
  title,
  hint,
  options,
  value,
  filters,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  hint?: string;
  options: AssignmentOption[];
  value: string;
  filters?: AssignmentFilter[];
  onConfirm: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(filters?.[0]?.id ?? 'all');
  const [picked, setPicked] = useState(value);
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery('');
    setFilter(filters?.[0]?.id ?? 'all');
    setPicked(value);
    setPage(0);
  }, [open, filters, value]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return options.filter((item) => {
      if (filter && filter !== 'all' && item.group && item.group !== filter) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return `${item.title} ${item.subtitle ?? ''} ${item.code ?? ''}`
        .toLowerCase()
        .includes(needle);
    });
  }, [filter, options, query]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const from = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, safePage * PAGE_SIZE + slice.length);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[70] bg-[#1c2744]/25"
        className="z-[80] flex max-h-[min(92dvh,40rem)] flex-col overflow-hidden p-0 sm:max-h-[min(90vh,36rem)] sm:w-[min(100%-1.5rem,36rem)] sm:p-0"
      >
        <div className="border-b border-[#eef1f8] px-4 py-4 pr-12 sm:px-5">
          <DialogTitle className="text-lg font-extrabold text-[#1c2744]">
            {title}
          </DialogTitle>
          {hint ? (
            <DialogDescription className="mt-1 text-sm text-[#5c6578]">
              {hint}
            </DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col px-4 pt-3 sm:px-5">
          <input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder={t('picker.search')}
            className="h-10 w-full rounded-xl border border-[#e4e7ee] bg-[#f6f7fb] px-3 text-sm outline-none placeholder:text-[#a0a6b2]"
          />
          {filters && filters.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setFilter(item.id);
                    setPage(0);
                  }}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-extrabold',
                    filter === item.id
                      ? 'bg-[#eef2ff] text-[#3d4fd4]'
                      : 'bg-white text-[#5c6578] ring-1 ring-[#e4e7ee]',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
          <p className="mt-3 text-xs font-semibold text-[#8b909a]">
            {t('picker.count', { count: filtered.length })}
          </p>
          <ul className="mt-2 min-h-0 flex-1 overflow-y-auto">
            {slice.length === 0 ? (
              <li className="py-8 text-center text-sm text-[#8b909a]">
                {t('picker.empty')}
              </li>
            ) : (
              slice.map((item, index) => {
                const active = picked === item.id;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setPicked(item.id)}
                      onDoubleClick={() => onConfirm(item.id)}
                      className={cn(
                        'flex w-full items-center gap-3 border-b border-[#eef1f8] px-1 py-2.5 text-left',
                        active ? 'bg-[#f4f6ff]' : 'bg-white hover:bg-[#f8f9fc]',
                      )}
                    >
                      <span
                        className={cn(
                          'grid size-9 shrink-0 place-items-center rounded-full text-[10px] font-extrabold text-white',
                          toneFor(item.id),
                        )}
                      >
                        {item.code ??
                          String(from + index).padStart(4, '0')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-extrabold text-[#1c2744]">
                          {item.title}
                        </span>
                        {item.subtitle ? (
                          <span className="mt-0.5 block truncate text-xs font-semibold text-[#8b909a]">
                            {item.subtitle}
                          </span>
                        ) : null}
                      </span>
                      <span className="sr-only">{initials(item.title)}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          <div className="flex items-center justify-between py-3 text-xs font-semibold text-[#8b909a]">
            <span>
              {t('picker.range', { from, to, total: filtered.length })}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={safePage <= 0}
                onClick={() => setPage((current) => Math.max(0, current - 1))}
              >
                {t('picker.prev')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((current) => current + 1)}
              >
                {t('picker.next')}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#eef1f8] px-4 py-3 sm:px-5">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={!picked}
            onClick={() => {
              if (picked) {
                onConfirm(picked);
              }
            }}
          >
            {t('picker.apply')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
