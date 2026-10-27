import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

export interface FieldSelectOption {
  value: string;
  label: string;
}

export function FieldSelect({
  value,
  defaultValue = '',
  onChange,
  options,
  placeholder,
  disabled,
  className,
  name,
  required,
}: {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  options: FieldSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  name?: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [internal, setInternal] = useState(value ?? defaultValue);
  const selectedValue = value ?? internal;
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((item) => item.value === selectedValue);

  useEffect(() => {
    if (value !== undefined) {
      setInternal(value);
    }
  }, [value]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (next: string) => {
    setInternal(next);
    onChange?.(next);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative mt-1.5 w-full">
      {name ? (
        <input type="hidden" name={name} value={selectedValue} required={required} />
      ) : null}
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex items-center justify-between gap-2 text-left',
          className,
          'mt-0',
          !selected && 'text-[#8b909a]',
        )}
      >
        <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
        <ChevronDown className="size-4 shrink-0 text-[#8b909a]" />
      </button>
      {open ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-[#c5cad6] bg-white py-1 shadow-[0_12px_32px_rgba(28,39,68,0.16)]"
        >
          {placeholder ? (
            <li role="option" aria-selected={!selectedValue}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm font-semibold text-[#8b909a] hover:bg-[#f4f7ff]"
                onClick={() => choose('')}
              >
                {placeholder}
              </button>
            </li>
          ) : null}
          {options.map((item) => {
            const active = item.value === selectedValue;
            return (
              <li key={item.value} role="option" aria-selected={active}>
                <button
                  type="button"
                  className={cn(
                    'block w-full px-3 py-2 text-left text-sm font-semibold text-[#1c2744] hover:bg-[#eef2ff]',
                    active && 'bg-[#eef2ff] text-[#3d4fd4]',
                  )}
                  onClick={() => choose(item.value)}
                >
                  {item.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
