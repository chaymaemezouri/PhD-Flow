import { ArrowUpRight, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import {
  reviewHref,
  reviewQueueMeta,
  type ReviewAssignment,
  type ReviewBoard,
} from '@/features/reviews/review-queue';

const FILTERS: { id: ReviewBoard; label: string }[] = [
  { id: 'all', label: 'home.boardAll' },
  { id: 'invited', label: 'home.toAccept' },
  { id: 'active', label: 'home.inProgress' },
  { id: 'waiting', label: 'reviews.sectionWaiting' },
  { id: 'done', label: 'home.returned' },
];

export function ReviewQueueToolbar({
  board,
  onBoard,
  counts,
  query,
  onQuery,
}: {
  board: ReviewBoard;
  onBoard: (board: ReviewBoard) => void;
  counts: Record<ReviewBoard, number>;
  query: string;
  onQuery: (value: string) => void;
}) {
  const { t } = useTranslation();
  const options = FILTERS.filter(
    (item) => item.id !== 'waiting' || counts.waiting > 0,
  );
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <label className="block text-xs font-extrabold uppercase tracking-[0.06em] text-[#8b909a]">
        {t('home.filterBoard')}
        <select
          value={board}
          onChange={(event) => onBoard(event.target.value as ReviewBoard)}
          className="mt-1.5 block min-h-10 w-full min-w-[14rem] rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-[#1c2744]"
        >
          {options.map((item) => (
            <option key={item.id} value={item.id}>
              {t(item.label)} · {counts[item.id]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex min-w-0 items-center gap-2 rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 sm:w-72">
        <Search className="size-4 shrink-0 text-[#8b909a]" />
        <span className="sr-only">{t('reviews.searchPlaceholder')}</span>
        <input
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          placeholder={t('reviews.searchPlaceholder')}
          className="w-full bg-transparent text-sm outline-none placeholder:text-[#a0a6b2]"
        />
      </label>
    </div>
  );
}

export function ReviewQueueList({
  items,
  empty,
}: {
  items: ReviewAssignment[];
  empty: string;
}) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <p className="rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm text-[#5c6578]">{empty}</p>
    );
  }

  return (
    <ul className="divide-y divide-[#eef1f6] overflow-hidden rounded-2xl border border-[#e4e7ee] bg-[#fafbfe]">
      {items.map((item) => {
        const meta = reviewQueueMeta(item);
        return (
          <li key={item.id}>
            <Link
              to={reviewHref(item.id)}
              className="relative flex items-center gap-3 py-3.5 pl-5 pr-3 text-[#1c2744] no-underline hover:bg-white sm:gap-4 sm:px-5 sm:pl-6"
            >
              <span
                className={`absolute inset-y-3 left-0 w-1 rounded-r-full ${meta.bar}`}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-extrabold tracking-wide text-[#8b909a]">
                    {item.publicId ?? t('reviews.title')}
                  </p>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[11px] font-extrabold ${meta.badge}`}
                  >
                    {item.needsRereview
                      ? t('reviews.sectionRereview')
                      : t(`reviews.statuses.${item.status}`, {
                          defaultValue: item.status,
                        })}
                  </span>
                </div>
                {item.conferenceName ? (
                  <p className="mt-1 truncate text-[11px] font-bold text-[#8b909a]">
                    {item.conferenceName}
                  </p>
                ) : null}
                <h3 className="mt-1 truncate text-sm font-extrabold sm:text-base">
                    {item.paperTitle}
                  </h3>
                <p className={`mt-1 text-xs font-semibold sm:text-sm ${meta.hint}`}>
                  {t(meta.nextKey, { defaultValue: item.status })}
                </p>
                <p className="mt-1 text-xs font-semibold text-[#8b909a]">
                  {t('home.reviewDue', {
                    date: new Date(item.expiresAt).toLocaleDateString(),
                  })}
                  {item.score !== null
                    ? ` · ${t('home.reviewScore', { score: item.score })}`
                    : ''}
                </p>
              </div>
              <span
                className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3 text-[11px] font-extrabold sm:min-h-10 sm:px-4 sm:text-xs ${meta.actionClass}`}
              >
                {t(meta.actionKey)}
                <ArrowUpRight className="size-3.5" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
