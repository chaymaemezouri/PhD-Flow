import type { ReactNode } from 'react';
import { Link } from 'react-router';

export function EmptyState({
  title,
  body,
  actionTo,
  actionLabel,
  secondaryTo,
  secondaryLabel,
  children,
}: {
  title: string;
  body?: string;
  actionTo?: string;
  actionLabel?: string;
  secondaryTo?: string;
  secondaryLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[#d8dce6] bg-gradient-to-b from-white to-[#f7f9fc] px-5 py-8 text-center">
      <p className="text-base font-extrabold text-[#1c2744]">{title}</p>
      {body ? (
        <p className="mx-auto mt-2 max-w-md text-sm font-semibold text-[#5c6578]">{body}</p>
      ) : null}
      {(actionTo && actionLabel) || (secondaryTo && secondaryLabel) || children ? (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
          {actionTo && actionLabel ? (
            <Link
              to={actionTo}
              className="inline-flex min-h-9 items-center rounded-xl bg-[#3d4fd4] px-3.5 text-sm font-extrabold text-white no-underline"
            >
              {actionLabel}
            </Link>
          ) : null}
          {secondaryTo && secondaryLabel ? (
            <Link
              to={secondaryTo}
              className="inline-flex min-h-9 items-center rounded-xl border border-[#d8dce6] bg-white px-3.5 text-sm font-extrabold text-[#3d4fd4] no-underline"
            >
              {secondaryLabel}
            </Link>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
