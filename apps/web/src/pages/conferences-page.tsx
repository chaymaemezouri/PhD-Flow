import type { ConferenceRole, MembershipStatus } from '@scholarflow/types';
import { createConferenceSchema } from '@scholarflow/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface Mine {
  id: string;
  name: string;
  shortName: string;
  status: string;
  role: ConferenceRole;
  membershipStatus: MembershipStatus;
  city: string | null;
  country: string | null;
  startsOn: string | null;
  endsOn: string | null;
}

async function loadMine(): Promise<Mine[]> {
  const response = await apiFetch('/api/v1/conferences');
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<Mine[]>;
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

export function ConferencesPage() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!creating) {
      return;
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setCreating(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [creating]);
  const mine = useQuery({ queryKey: ['conferences'], queryFn: loadMine });
  const create = useMutation({
    mutationFn: async (values: unknown) => {
      const response = await apiFetch('/api/v1/conferences', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
    },
    onSuccess: async () => {
      setName('');
      setShortName('');
      setDescription('');
      setCity('');
      setCountry('');
      setCreating(false);
      await queryClient.invalidateQueries({ queryKey: ['conferences'] });
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1c2744]">{t('conferences.title')}</h1>
          <p className="mt-2 max-w-2xl text-sm text-[#5c6578]">{t('conferences.intro')}</p>
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          {t('conferences.create')}
        </Button>
      </div>
      {mine.isPending ? <p className="text-sm text-[#8b909a]">{t('common.loading')}</p> : null}
      {mine.isError ? <p className="text-sm text-[#c54545]">{mine.error.message}</p> : null}
      {mine.data?.length === 0 ? (
        <p className="text-sm text-[#5c6578]">{t('conferences.empty')}</p>
      ) : null}
      <ul className="grid gap-3">
        {mine.data?.map((item) => {
          const place = [item.city, item.country].filter(Boolean).join(' · ');
          const when = formatRange(item.startsOn, item.endsOn, i18n.language);
          const where = [place, when].filter(Boolean).join(' · ');
          return (
            <li key={item.id} className="rounded-2xl border border-[#e4e7ee] bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold tracking-wide text-[#5d74ff]">{item.shortName}</p>
                  <h2 className="mt-1 text-xl font-extrabold">
                    <Link to={`/workspace/conferences/${item.id}`} className="text-[#1c2744] no-underline">
                      {item.name}
                    </Link>
                  </h2>
                  {where ? <p className="mt-1 text-sm text-[#5c6578]">{where}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#5d74ff]/12 px-3 py-1 text-xs font-bold text-[#3d4fd4]">
                    {t(`conferences.roles.${item.role}`, { defaultValue: item.role })}
                  </span>
                  <span className="rounded-full bg-[#2fbf71]/14 px-3 py-1 text-xs font-bold text-[#1c9a57]">
                    {t(`conferences.states.${item.status}`, { defaultValue: item.status })}
                  </span>
                  <span className="rounded-full bg-[#f4f7ff] px-3 py-1 text-xs font-bold text-[#5c6578]">
                    {t(`conferences.membership.${item.membershipStatus}`, {
                      defaultValue: item.membershipStatus,
                    })}
                  </span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
                <Link
                  to={`/workspace/conferences/${item.id}`}
                  className="rounded-full bg-[#eef2ff] px-3 py-1 text-[#3d4fd4] no-underline"
                >
                  {t('home.manage')}
                </Link>
                <Link to="/workspace/program" className="rounded-full bg-[#eef2ff] px-3 py-1 text-[#3d4fd4] no-underline">
                  {t('home.program')}
                </Link>
                <Link to="/workspace/follow-up" className="rounded-full bg-[#eef2ff] px-3 py-1 text-[#3d4fd4] no-underline">
                  {t('home.publication')}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      {creating ? (
        <div className="fixed inset-0 z-[60] grid place-items-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-[#243044]/30"
            aria-label={t('nav.close')}
            onClick={() => setCreating(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-conference-title"
            className="relative z-10 w-full max-w-lg rounded-2xl border border-[#e4e7ee] bg-white p-5 shadow-[0_16px_40px_rgba(28,36,48,0.16)]"
          >
        <h2 id="create-conference-title" className="text-lg font-extrabold">{t('conferences.create')}</h2>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            const parsed = createConferenceSchema.safeParse({
              name,
              shortName,
              description,
              city,
              country,
            });
            if (!parsed.success) {
              setError(parsed.error.issues[0]?.message ?? t('conferences.loadError'));
              return;
            }
            void create.mutateAsync(parsed.data).catch((caught: unknown) => {
              setError(caught instanceof Error ? caught.message : t('conferences.loadError'));
            });
          }}
        >
          <label className="text-sm font-bold text-[#1c2744]">
            {t('conferences.name')}
            <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="text-sm font-bold text-[#1c2744]">
            {t('conferences.shortName')}
            <Input className="mt-1" value={shortName} onChange={(event) => setShortName(event.target.value)} />
          </label>
          <label className="text-sm font-bold text-[#1c2744] sm:col-span-2">
            {t('conferences.description')}
            <Input className="mt-1" value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
          <label className="text-sm font-bold text-[#1c2744]">
            {t('auth.city')}
            <Input className="mt-1" value={city} onChange={(event) => setCity(event.target.value)} />
          </label>
          <label className="text-sm font-bold text-[#1c2744]">
            {t('auth.country')}
            <Input className="mt-1" value={country} onChange={(event) => setCountry(event.target.value)} />
          </label>
          {error ? <p className="text-sm text-[#c54545] sm:col-span-2">{error}</p> : null}
          <div>
            <Button type="submit" disabled={create.isPending}>
              {t('conferences.create')}
            </Button>
          </div>
        </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
