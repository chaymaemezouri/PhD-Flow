import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { pickConference } from '@/features/navigation/pick-conference';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface Membership {
  id: string;
  name: string;
  role: string;
  membershipStatus: string;
  status: string;
  startsOn: string | null;
}

interface SessionRow {
  id: string;
  title: string;
  startsAt: string;
  room: { name: string; capacity: number };
  presentations: { id: string; score: number | null; paper: { title: string; publicId: string | null } }[];
}

interface ProgramView {
  sessions: SessionRow[];
  rooms: { id: string; name: string }[];
}

export function ProgramPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
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
  const active = conferences.data?.filter((item) => item.membershipStatus === 'ACTIVE') ?? [];
  const conference = pickConference(active, params.get('conference'));
  const chair = conference?.role === 'CHAIR' || conference?.role === 'ADMINISTRATOR';
  const program = useQuery({
    queryKey: ['program', conference?.id],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${conference!.id}/program`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<ProgramView>;
    },
    enabled: Boolean(conference?.id),
  });
  const papers = useQuery({
    queryKey: ['conference-papers', conference?.id],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${conference!.id}/papers`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<
        { id: string; title: string; publicId: string | null; decision: { outcome: string; status: string } | null }[]
      >;
    },
    enabled: Boolean(conference?.id && chair),
  });
  const accepted =
    papers.data?.filter(
      (paper) =>
        paper.decision?.status === 'PUBLISHED' &&
        (paper.decision.outcome === 'ACCEPTED' || paper.decision.outcome === 'CONDITIONALLY_ACCEPTED'),
    ) ?? [];
  const field = 'mt-1 block rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2 text-sm';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-extrabold text-[#1c2744]">{t('workflow.programTitle')}</h1>
        {conference ? <p className="mt-2 text-sm text-[#5c6578]">{conference.name}</p> : null}
      </div>
      {active.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {active.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === conference?.id}
              className={`rounded-full px-3 py-2 text-sm font-bold ${
                item.id === conference?.id ? 'bg-[#5d74ff]/15 text-[#3d4fd4]' : 'bg-white text-[#5c6578]'
              }`}
              onClick={() => setParams({ conference: item.id })}
            >
              {item.name}
            </button>
          ))}
        </div>
      ) : null}
      {message ? <p className="text-sm font-extrabold text-[#1c2744]">{message}</p> : null}
      {program.data && program.data.sessions.length === 0 ? (
        <p className="rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm text-[#5c6578]">{t('workflow.noSessions')}</p>
      ) : null}
      <ul className="grid gap-3">
        {program.data?.sessions.map((session) => (
          <li key={session.id} className="rounded-[28px] border border-[#e4e7ee] bg-white p-5">
            <p className="text-lg font-extrabold text-[#1c2744]">{session.title}</p>
            <p className="mt-1 text-sm text-[#5c6578]">
              {session.room.name} · {new Date(session.startsAt).toLocaleString()}
            </p>
            {session.presentations.length === 0 ? (
              <p className="mt-3 text-sm text-[#8b909a]">{t('workflow.sessionEmpty')}</p>
            ) : (
              <ul className="mt-4 grid gap-3">
                {session.presentations.map((item) => (
                  <li key={item.id} className="rounded-2xl bg-[#f6f7fb] px-4 py-3">
                    <p className="text-sm font-extrabold leading-snug text-[#1c2744]">{item.paper.title}</p>
                    <p className="mt-1 text-xs text-[#8b909a]">
                      {item.paper.publicId}
                      {item.score !== null ? ` · ${item.score}/10` : ''}
                    </p>
                    {chair ? (
                      <form
                        className="mt-3 flex flex-wrap items-end gap-2"
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
                        <label className="text-xs font-bold text-[#5c6578]">
                          {t('workflow.presentationScore')}
                          <input
                            name="score"
                            type="number"
                            min={1}
                            max={10}
                            required
                            defaultValue={item.score ?? ''}
                            className="mt-1 block w-24 rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-sm"
                          />
                        </label>
                        <Button type="submit" size="sm">
                          {t('workflow.save')}
                        </Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {chair && conference && program.data ? (
        <form
          className="grid gap-3 rounded-[28px] border border-[#e4e7ee] bg-white p-5 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            const startsAt = new Date(String(data.get('startsAt'))).toISOString();
            const endsAt = new Date(String(data.get('endsAt'))).toISOString();
            void apiFetch(`/api/v1/conferences/${conference.id}/sessions`, {
              method: 'POST',
              body: JSON.stringify({
                roomId: String(data.get('roomId')),
                title: String(data.get('title')),
                startsAt,
                endsAt,
              }),
            }).then(async (response) => {
              setMessage(response.ok ? t('workflow.saved') : await apiErrorMessage(response));
              await queryClient.invalidateQueries({ queryKey: ['program'] });
            });
          }}
        >
          <h2 className="text-lg font-extrabold md:col-span-2">{t('workflow.session')}</h2>
          <label className="text-sm font-bold">
            {t('workflow.room')}
            <select name="roomId" required className={field} defaultValue={program.data.rooms[0]?.id ?? ''}>
              {program.data.rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            {t('workflow.sessionTitle')}
            <input name="title" required className={field} />
          </label>
          <label className="text-sm font-bold">
            {t('workflow.starts')}
            <input name="startsAt" type="datetime-local" required className={field} />
          </label>
          <label className="text-sm font-bold">
            {t('workflow.ends')}
            <input name="endsAt" type="datetime-local" required className={field} />
          </label>
          <div className="md:col-span-2">
            <Button type="submit" disabled={program.data.rooms.length === 0}>
              {t('workflow.save')}
            </Button>
          </div>
        </form>
      ) : null}
      {chair && conference && program.data && accepted.length > 0 ? (
        <form
          className="grid gap-3 rounded-[28px] border border-[#e4e7ee] bg-white p-5 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void apiFetch(`/api/v1/sessions/${String(data.get('sessionId'))}/presentations`, {
              method: 'POST',
              body: JSON.stringify({ paperId: String(data.get('paperId')) }),
            }).then(async (response) => {
              setMessage(response.ok ? t('workflow.saved') : await apiErrorMessage(response));
              await queryClient.invalidateQueries({ queryKey: ['program'] });
              await queryClient.invalidateQueries({ queryKey: ['conference-papers'] });
            });
          }}
        >
          <h2 className="text-lg font-extrabold md:col-span-2">{t('workflow.placePaper')}</h2>
          <label className="text-sm font-bold">
            {t('workflow.session')}
            <select name="sessionId" required className={field} defaultValue={program.data.sessions[0]?.id ?? ''}>
              {program.data.sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-bold">
            {t('workflow.choosePaper')}
            <select name="paperId" required className={field}>
              {accepted.map((paper) => (
                <option key={paper.id} value={paper.id}>
                  {paper.publicId ? `${paper.publicId} · ${paper.title}` : paper.title}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-2">
            <Button type="submit" disabled={program.data.sessions.length === 0}>
              {t('workflow.save')}
            </Button>
          </div>
        </form>
      ) : null}
      {chair && conference ? (
        <form
          className="flex flex-wrap items-end gap-3 rounded-[28px] border border-[#e4e7ee] bg-white p-5"
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
