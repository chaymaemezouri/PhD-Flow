import type { PublicConference } from '@scholarflow/types';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Wordmark } from '@/components/wordmark';
import { apiErrorMessage, apiFetch } from '@/services/api';

async function loadDirectory(): Promise<PublicConference[]> {
  const response = await apiFetch('/api/v1/directory');
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<PublicConference[]>;
}

async function loadConference(slug: string): Promise<PublicConference> {
  const response = await apiFetch(`/api/v1/directory/${slug}`);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<PublicConference>;
}

function formatDay(value: string, language: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(language, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatRange(start: string | null, end: string | null, language: string) {
  if (start && end && start !== end) {
    return `${formatDay(start, language)} – ${formatDay(end, language)}`;
  }
  if (start) {
    return formatDay(start, language);
  }
  if (end) {
    return formatDay(end, language);
  }
  return null;
}

export function DirectoryPage() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams();
  const list = useQuery({
    queryKey: ['directory'],
    queryFn: loadDirectory,
    enabled: !slug,
  });
  const detail = useQuery({
    queryKey: ['directory', slug],
    queryFn: () => loadConference(slug ?? ''),
    enabled: Boolean(slug),
  });
  const conference = detail.data;
  const place = conference
    ? [conference.city, conference.country].filter(Boolean).join(' · ')
    : '';
  const when = conference
    ? formatRange(conference.startsOn, conference.endsOn, i18n.language)
    : null;
  const where = [place, when].filter(Boolean).join(' · ');

  return (
    <div className="min-h-screen bg-[#f3f6fb] text-[#1c2744]">
      <header className="border-b border-[#e4e7ee] bg-white">
        <div className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-10">
          <Wordmark />
          <Button asChild variant="outline">
            <Link to="/">{t('common.home')}</Link>
          </Button>
        </div>
      </header>
      <main className="w-full px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
        {slug ? null : (
          <>
            <h1 className="text-3xl font-extrabold">{t('conferences.directoryTitle')}</h1>
            <p className="mt-2 max-w-2xl text-sm text-[#5c6578]">
              {t('conferences.directoryIntro')}
            </p>
          </>
        )}
        {!slug && list.isPending ? (
          <p className="mt-6 text-sm text-[#8b909a]">{t('common.loading')}</p>
        ) : null}
        {!slug && list.isError ? (
          <p className="mt-6 text-sm text-[#c54545]">{t('conferences.loadError')}</p>
        ) : null}
        {!slug && list.data?.length === 0 ? (
          <p className="mt-6 text-sm text-[#5c6578]">{t('conferences.directoryEmpty')}</p>
        ) : null}
        {!slug ? (
          <ul className="mt-6 grid gap-3">
            {list.data?.map((item) => {
              const itemPlace = [item.city, item.country].filter(Boolean).join(' · ');
              const itemWhen = formatRange(item.startsOn, item.endsOn, i18n.language);
              const itemWhere = [itemPlace, itemWhen].filter(Boolean).join(' · ');
              return (
                <li
                  key={item.id}
                  className="rounded-2xl border border-[#e4e7ee] bg-white p-5"
                >
                  <p className="text-xs font-bold tracking-wide text-[#5d74ff]">
                    {item.shortName}
                  </p>
                  <h2 className="mt-1 text-xl font-extrabold">
                    <Link
                      to={`/directory/${item.slug}`}
                      className="text-[#1c2744] no-underline"
                    >
                      {item.name}
                    </Link>
                  </h2>
                  {itemWhere ? (
                    <p className="mt-1 text-sm text-[#5c6578]">{itemWhere}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {slug && detail.isPending ? (
          <p className="mt-6 text-sm text-[#8b909a]">{t('common.loading')}</p>
        ) : null}
        {slug && detail.isError ? (
          <p className="mt-6 text-sm text-[#c54545]">{t('conferences.notPublic')}</p>
        ) : null}
        {conference ? (
          <article className="mt-6 space-y-4">
            <div>
              <Link
                to="/directory"
                className="text-sm font-bold text-[#8b909a] no-underline"
              >
                {t('conferences.directoryTitle')}
              </Link>
              <h2 className="mt-2 text-3xl font-extrabold">{conference.name}</h2>
              {where ? <p className="mt-2 text-sm text-[#5c6578]">{where}</p> : null}
              {conference.description ? (
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[#5c6578]">
                  {conference.description}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#5d74ff]/12 px-3 py-1 text-xs font-bold text-[#3d4fd4]">
                  {conference.shortName}
                </span>
                <span className="rounded-full bg-[#f0a04b]/16 px-3 py-1 text-xs font-bold text-[#9a6410]">
                  {t(`conferences.review.${conference.reviewMode}`, {
                    defaultValue: conference.reviewMode,
                  })}
                </span>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-2xl border border-[#e4e7ee] bg-white p-5">
                <h3 className="text-lg font-extrabold">{t('conferences.tracks')}</h3>
                {conference.tracks.length === 0 ? (
                  <p className="mt-3 text-sm text-[#8b909a]">
                    {t('conferences.noTracks')}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {conference.tracks.map((track) => (
                      <li
                        key={track.id}
                        className="rounded-xl bg-[#f7f8fb] px-4 py-3 text-sm"
                      >
                        <span className="mr-2 rounded-full bg-white px-2 py-0.5 text-xs font-extrabold">
                          {track.code}
                        </span>
                        {track.name}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              <section className="rounded-2xl border border-[#e4e7ee] bg-white p-5">
                <h3 className="text-lg font-extrabold">{t('conferences.deadlines')}</h3>
                {conference.deadlines.length === 0 ? (
                  <p className="mt-3 text-sm text-[#8b909a]">
                    {t('conferences.noDeadlines')}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {conference.deadlines.map((deadline) => (
                      <li
                        key={deadline.id}
                        className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f8fb] px-4 py-3 text-sm"
                      >
                        <span className="font-extrabold">
                          {deadline.label.trim() ||
                            t(`conferences.kinds.${deadline.kind}`, {
                              defaultValue: deadline.kind,
                            })}
                        </span>
                        <span className="text-[#5c6578]">
                          {new Date(deadline.dueAt).toLocaleString(i18n.language, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </article>
        ) : null}
      </main>
    </div>
  );
}
