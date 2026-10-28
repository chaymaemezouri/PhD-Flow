import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { apiErrorMessage, apiFetch } from '@/services/api';

type SearchResult = {
  papers: { id: string; title: string; publicId: string | null; status: string }[];
  conferences: { id: string; name: string; slug: string }[];
  reviews: { id: string; title: string; publicId: string | null; status: string }[];
};

export function GlobalSearch() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const needle = query.trim();
  const search = useQuery({
    queryKey: ['global-search', needle],
    enabled: needle.length >= 2,
    queryFn: async () => {
      const response = await apiFetch(
        `/api/v1/search?q=${encodeURIComponent(needle)}`,
      );
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<SearchResult>;
    },
  });

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const papers = search.data?.papers ?? [];
  const conferences = search.data?.conferences ?? [];
  const reviews = search.data?.reviews ?? [];
  const empty =
    needle.length >= 2 &&
    !search.isFetching &&
    papers.length === 0 &&
    conferences.length === 0 &&
    reviews.length === 0;

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1 sm:max-w-sm">
      <label className="flex min-h-10 items-center gap-2 rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2">
        <Search className="size-4 shrink-0 text-[#8b909a]" />
        <span className="sr-only">{t('top.search')}</span>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={t('top.searchPlaceholder')}
          className="w-full bg-transparent text-sm font-semibold text-[#1c2744] outline-none placeholder:font-medium placeholder:text-[#8b909a]"
        />
      </label>
      {open && needle.length >= 2 ? (
        <div className="absolute z-40 mt-1 max-h-80 w-full overflow-y-auto rounded-2xl border border-[#e4e7ee] bg-white py-2 shadow-[0_12px_32px_rgba(28,39,68,0.12)]">
          {search.isFetching ? (
            <p className="px-3 py-2 text-sm text-[#8b909a]">{t('common.loading')}</p>
          ) : null}
          {empty ? (
            <p className="px-3 py-2 text-sm text-[#8b909a]">{t('top.searchEmpty')}</p>
          ) : null}
          {conferences.length > 0 ? (
            <ResultGroup label={t('nav.conferences')}>
              {conferences.map((item) => (
                <Link
                  key={item.id}
                  to={`/workspace/conferences/${item.id}`}
                  className="block px-3 py-2 text-sm font-semibold text-[#1c2744] no-underline hover:bg-[#f6f7fb]"
                  onClick={() => setOpen(false)}
                >
                  {item.name}
                </Link>
              ))}
            </ResultGroup>
          ) : null}
          {papers.length > 0 ? (
            <ResultGroup label={t('nav.submissions')}>
              {papers.map((item) => (
                <Link
                  key={item.id}
                  to={`/workspace/submissions/${item.id}`}
                  className="block px-3 py-2 text-sm font-semibold text-[#1c2744] no-underline hover:bg-[#f6f7fb]"
                  onClick={() => setOpen(false)}
                >
                  <span className="block truncate">{item.title}</span>
                  {item.publicId ? (
                    <span className="text-xs font-bold text-[#8b909a]">{item.publicId}</span>
                  ) : null}
                </Link>
              ))}
            </ResultGroup>
          ) : null}
          {reviews.length > 0 ? (
            <ResultGroup label={t('nav.reviews')}>
              {reviews.map((item) => (
                <Link
                  key={item.id}
                  to={`/workspace/reviews/${item.id}`}
                  className="block px-3 py-2 text-sm font-semibold text-[#1c2744] no-underline hover:bg-[#f6f7fb]"
                  onClick={() => setOpen(false)}
                >
                  <span className="block truncate">{item.title}</span>
                </Link>
              ))}
            </ResultGroup>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ResultGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[#eef1f8] py-1 last:border-b-0">
      <p className="px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#8b909a]">
        {label}
      </p>
      {children}
    </div>
  );
}
