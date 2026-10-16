import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface AssignedConference {
  id: string;
  name: string;
  shortName: string;
  city: string | null;
  country: string | null;
  startsOn: string | null;
  endsOn: string | null;
  role: string;
  granted: boolean;
}

const field =
  'mt-1 block w-full rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2 text-sm';

export function ConferenceAccessPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const preset = params.get('conference');
  const [selected, setSelected] = useState<string | null>(preset);
  const [password, setPassword] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const resumed = useRef(false);
  const assigned = useQuery({
    queryKey: ['assigned-conferences'],
    queryFn: async () => {
      const response = await apiFetch('/api/v1/conferences/assigned');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<AssignedConference[]>;
    },
  });
  const chosenId = selected ?? assigned.data?.[0]?.id ?? null;
  const chosen = assigned.data?.find((item) => item.id === chosenId) ?? null;
  const open = useMutation({
    mutationFn: async (input: { conferenceId: string; password?: string }) => {
      const response = await apiFetch(
        `/api/v1/conferences/${input.conferenceId}/access`,
        {
          method: 'POST',
          body: JSON.stringify(input.password ? { password: input.password } : {}),
        },
      );
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<{ id: string; name: string }>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['account'] });
      await queryClient.invalidateQueries({ queryKey: ['conferences'] });
      void navigate('/workspace/administrator');
    },
    onError: (error: Error) => setNotice(error.message),
  });

  useEffect(() => {
    const only = assigned.data?.length === 1 ? assigned.data[0] : null;
    if (!only?.granted || resumed.current) {
      return;
    }
    resumed.current = true;
    void open.mutateAsync({ conferenceId: only.id });
  }, [assigned.data, open]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold text-[#1c2744]">{t('access.title')}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5c6578]">
          {t('access.intro')}
        </p>
      </div>
      {notice ? <p className="text-sm font-extrabold text-[#c54545]">{notice}</p> : null}
      {assigned.isPending ? (
        <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>
      ) : null}
      {assigned.data?.length === 0 ? (
        <p className="text-sm text-[#5c6578]">{t('access.empty')}</p>
      ) : null}
      <ul className="grid gap-3">
        {assigned.data?.map((item) => {
          const place = [item.city, item.country].filter(Boolean).join(' · ');
          const active = (selected ?? assigned.data?.[0]?.id) === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                className={`w-full rounded-[28px] border bg-white p-5 text-left ${
                  active ? 'border-[#5d74ff]' : 'border-[#e4e7ee]'
                }`}
                onClick={() => {
                  setSelected(item.id);
                  setNotice(null);
                }}
              >
                <span className="block text-lg font-extrabold text-[#1c2744]">
                  {item.name}
                </span>
                <span className="mt-1 block text-sm text-[#5c6578]">
                  {item.shortName}
                  {place ? ` · ${place}` : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {assigned.data && assigned.data.length > 0 ? (
        <form
          className="rounded-[28px] border border-[#e4e7ee] bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            const conferenceId = selected ?? assigned.data?.[0]?.id ?? null;
            if (!conferenceId) {
              return;
            }
            setSelected(conferenceId);
            setNotice(null);
            void open.mutateAsync({
              conferenceId,
              password: chosen?.granted ? undefined : password,
            });
          }}
        >
          {chosen?.granted ? (
            <p className="text-sm text-[#5c6578]">{t('access.remembered')}</p>
          ) : (
            <label className="text-sm font-bold">
              {t('access.password')}
              <input
                type="password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={field}
              />
            </label>
          )}
          <div className="mt-4">
            <Button type="submit" disabled={open.isPending}>
              {t('access.enter')}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
