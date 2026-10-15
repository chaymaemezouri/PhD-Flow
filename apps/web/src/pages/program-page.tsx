import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface Membership {
  id: string;
  name: string;
  role: string;
  membershipStatus: string;
}

interface SessionRow {
  id: string;
  title: string;
  startsAt: string;
  room: { name: string; capacity: number };
  presentations: { id: string; score: number | null; paper: { title: string; publicId: string | null } }[];
}

export function ProgramPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const conferences = useQuery({
    queryKey: ['conferences'],
    queryFn: async () => {
      const response = await apiFetch('/api/v1/conferences');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<Membership[]>;
    },
  });
  const conference = conferences.data?.find((item) => item.membershipStatus === 'ACTIVE');
  const chair =
    conference?.role === 'CHAIR' || conference?.role === 'ADMINISTRATOR';
  const program = useQuery({
    queryKey: ['program', conference?.id],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${conference!.id}/program`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<SessionRow[]>;
    },
    enabled: Boolean(conference?.id),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl">{t('workflow.programTitle')}</h1>
      {message ? <p className="text-sm font-bold">{message}</p> : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {program.data?.map((session) => (
          <li key={session.id} className="rounded-2xl border border-[#e6e8ec] bg-white p-5">
            <p className="text-lg font-extrabold">{session.title}</p>
            <p className="text-sm font-semibold text-[#6d7690]">
              {session.room.name} · {new Date(session.startsAt).toLocaleString()}
            </p>
            <ul className="mt-2 text-sm">
              {session.presentations.map((item) => (
                <li key={item.id} className="mt-2">
                  <p>
                    {item.paper.publicId ?? item.paper.title}
                    {item.score !== null ? ` · ${item.score}/10` : ''}
                  </p>
                  {chair ? (
                    <form
                      className="mt-2 flex gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const score = Number(new FormData(event.currentTarget).get('score'));
                        void apiFetch(`/api/v1/presentations/${item.id}/assessment`, {
                          method: 'POST',
                          body: JSON.stringify({ score, comment: '' }),
                        }).then(async (response) => {
                          setMessage(response.ok ? t('workflow.saved') : await apiErrorMessage(response));
                          await queryClient.invalidateQueries({ queryKey: ['program'] });
                        });
                      }}
                    >
                      <input
                        name="score"
                        type="number"
                        min={1}
                        max={10}
                        aria-label={t('workflow.presentationScore')}
                        className="w-20 rounded-2xl border px-2 py-1"
                      />
                      <Button type="submit" size="sm">
                        {t('workflow.save')}
                      </Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {chair && conference ? (
        <form
          className="flex flex-wrap items-end gap-3 rounded-[24px] bg-white p-5"
          onSubmit={(event) => {
            event.preventDefault();
            const name = String(new FormData(event.currentTarget).get('name') ?? '');
            void apiFetch(`/api/v1/conferences/${conference.id}/rooms`, {
              method: 'POST',
              body: JSON.stringify({ name, capacity: 40 }),
            }).then(async (response) => {
              setMessage(response.ok ? t('workflow.saved') : await apiErrorMessage(response));
              await queryClient.invalidateQueries({ queryKey: ['program'] });
            });
          }}
        >
          <label className="text-sm font-bold">
            {t('workflow.room')}
            <input name="name" className="mt-1 block rounded-2xl border px-3 py-2" />
          </label>
          <Button type="submit">{t('workflow.save')}</Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void apiFetch(`/api/v1/conferences/${conference.id}/reminders`, {
                method: 'POST',
                body: JSON.stringify({}),
              }).then(async (response) => {
                setMessage(response.ok ? t('workflow.reminded') : await apiErrorMessage(response));
              });
            }}
          >
            {t('workflow.remind')}
          </Button>
          <a className="text-sm font-semibold text-[#1f3a5f]" href={`/api/v1/conferences/${conference.id}/export`}>
            {t('workflow.export')}
          </a>
        </form>
      ) : null}
    </div>
  );
}
