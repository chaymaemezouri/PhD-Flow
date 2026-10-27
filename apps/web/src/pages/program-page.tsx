import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';
import { AssignmentField } from '@/components/assignment-picker';
import { FieldSelect } from '@/components/field-select';
import { ConferenceWorkNav } from '@/components/conference-work-nav';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCurrentUser } from '@/features/auth/use-account';
import { useFeedback } from '@/features/feedback/feedback';
import { isSessionChair } from '@/features/navigation/home-path';
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
  endsAt: string;
  room: { name: string; capacity: number };
  presentations: {
    id: string;
    modality: 'IN_PERSON' | 'ONLINE';
    score: number | null;
    comment: string;
    presentedAt: string | null;
    paper: {
      id: string;
      title: string;
      publicId: string | null;
      sessionComment: string;
      sessionChairs: { userId: string; name: string; mine: boolean }[];
      presentationReviewers?: { userId: string; name: string; mine: boolean }[];
    };
  }[];
}

interface ProgramView {
  sessions: SessionRow[];
  rooms: { id: string; name: string; capacity?: number }[];
}

export function ProgramPage() {
  const { t } = useTranslation();
  const account = useCurrentUser();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const feedback = useFeedback();
  const sessionChairSelf = isSessionChair(account.data?.profile?.academicTitle);
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
  const active =
    conferences.data?.filter((item) => item.membershipStatus === 'ACTIVE') ?? [];
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
        {
          id: string;
          title: string;
          publicId: string | null;
          decision: { outcome: string; status: string } | null;
        }[]
      >;
    },
    enabled: Boolean(conference?.id && chair),
  });
  const accepted =
    papers.data?.filter(
      (paper) =>
        paper.decision?.status === 'PUBLISHED' &&
        paper.decision.outcome === 'ACCEPTED',
    ) ?? [];
  const [roomId, setRoomId] = useState('');
  const [placeSessionId, setPlaceSessionId] = useState('');
  const [placePaperId, setPlacePaperId] = useState('');
  const [addSessionOpen, setAddSessionOpen] = useState(false);
  const [addPlaceOpen, setAddPlaceOpen] = useState(false);
  const [addRoomOpen, setAddRoomOpen] = useState(false);
  const field =
    'mt-1 block rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2 text-sm';

  return (
    <div className="space-y-5">
      {conference && !sessionChairSelf ? (
        <ConferenceWorkNav
          conferenceId={conference.id}
          conferenceName={conference.name}
          role={conference.role}
          current="program"
        />
      ) : (
        <div>
          <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl lg:text-3xl">
            {conference?.name ?? t('workflow.programTitle')}
          </h1>
          {conference ? (
            <p className="mt-1 text-sm font-semibold text-[#5c6578]">
              {t('conferences.workHintProgram')}
            </p>
          ) : null}
        </div>
      )}
      {chair && conference ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => setAddSessionOpen(true)}>
            <Plus className="size-4" />
            {t('workflow.addSession')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setAddPlaceOpen(true)}
            disabled={!program.data || accepted.length === 0}
          >
            <Plus className="size-4" />
            {t('workflow.placePaper')}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => setAddRoomOpen(true)}>
            <Plus className="size-4" />
            {t('workflow.addRoom')}
          </Button>
          <a
            className="inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold text-[#1f3a5f]"
            href={`/api/v1/conferences/${conference.id}/export`}
          >
            {t('workflow.export')}
          </a>
        </div>
      ) : null}
      {program.data && program.data.sessions.length === 0 ? (
        <p className="rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm text-[#5c6578]">
          {t('workflow.noSessions')}
        </p>
      ) : null}
      <ul className="grid gap-3">
        {program.data?.sessions.map((session) => (
          <li
            key={session.id}
            className="rounded-[28px] border border-[#e4e7ee] bg-white p-5"
          >
            <p className="text-lg font-extrabold text-[#1c2744]">{session.title}</p>
            <p className="mt-1 text-sm text-[#5c6578]">
              {session.room.name} · {new Date(session.startsAt).toLocaleString()} –{' '}
              {new Date(session.endsAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </p>
            {session.presentations.length === 0 ? (
              <p className="mt-3 text-sm text-[#8b909a]">{t('workflow.sessionEmpty')}</p>
            ) : (
              <ul className="mt-4 grid gap-2">
                {session.presentations.map((item) => (
                  <li
                    key={item.id}
                    className={`rounded-2xl px-4 py-3 ${
                      item.presentedAt ? 'bg-[#e8f8ef]' : 'bg-[#f6f7fb]'
                    }`}
                  >
                    <p className="text-sm font-extrabold leading-snug text-[#1c2744]">
                      {item.paper.title}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[#5c6578]">
                      {[
                        item.paper.publicId,
                        item.modality === 'ONLINE'
                          ? t('dossier.modalityOnline')
                          : t('dossier.modalityInPerson'),
                        item.presentedAt
                          ? t('dossier.presentationPresented')
                          : t('dossier.presentationScheduled'),
                        item.score !== null ? `${item.score}/10` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {item.paper.sessionChairs.length > 0 ? (
                      <p className="mt-1 text-xs font-semibold text-[#8b909a]">
                        {t('dossier.sessionChair')}:{' '}
                        {item.paper.sessionChairs.map((c) => c.name).join(', ')}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={addSessionOpen} onOpenChange={setAddSessionOpen}>
        <DialogContent>
          <DialogTitle>{t('workflow.addSession')}</DialogTitle>
          <DialogDescription>{t('workflow.sessionTitle')}</DialogDescription>
          {conference && program.data ? (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                const startsAt = new Date(String(data.get('startsAt'))).toISOString();
                const endsAt = new Date(String(data.get('endsAt'))).toISOString();
                void apiFetch(`/api/v1/conferences/${conference.id}/sessions`, {
                  method: 'POST',
                  body: JSON.stringify({
                    roomId: roomId || String(data.get('roomId')),
                    title: String(data.get('title')),
                    startsAt,
                    endsAt,
                  }),
                }).then(async (response) => {
                  if (response.ok) {
                    feedback.success(t('workflow.saved'));
                    setAddSessionOpen(false);
                  } else {
                    feedback.error(await apiErrorMessage(response));
                  }
                  await queryClient.invalidateQueries({ queryKey: ['program'] });
                });
              }}
            >
              <AssignmentField
                label={t('workflow.room')}
                title={t('workflow.room')}
                placeholder={t('workflow.room')}
                value={roomId}
                onChange={setRoomId}
                options={program.data.rooms.map((room) => ({
                  id: room.id,
                  title: room.name,
                  subtitle: room.capacity != null ? String(room.capacity) : undefined,
                }))}
              />
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
              <Button type="submit" disabled={program.data.rooms.length === 0 || !roomId}>
                {t('workflow.save')}
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={addPlaceOpen} onOpenChange={setAddPlaceOpen}>
        <DialogContent>
          <DialogTitle>{t('workflow.placePaper')}</DialogTitle>
          <DialogDescription>{t('workflow.choosePaper')}</DialogDescription>
          {program.data ? (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                void apiFetch(`/api/v1/sessions/${placeSessionId}/presentations`, {
                  method: 'POST',
                  body: JSON.stringify({
                    paperId: placePaperId,
                    modality: String(data.get('modality') || 'IN_PERSON'),
                  }),
                }).then(async (response) => {
                  if (response.ok) {
                    feedback.success(t('workflow.saved'));
                    setAddPlaceOpen(false);
                  } else {
                    feedback.error(await apiErrorMessage(response));
                  }
                  await queryClient.invalidateQueries({ queryKey: ['program'] });
                  await queryClient.invalidateQueries({ queryKey: ['conference-papers'] });
                });
              }}
            >
              <AssignmentField
                label={t('workflow.session')}
                title={t('workflow.session')}
                placeholder={t('workflow.session')}
                value={placeSessionId}
                onChange={setPlaceSessionId}
                options={program.data.sessions.map((session) => ({
                  id: session.id,
                  title: session.title,
                  subtitle: session.room.name,
                }))}
              />
              <AssignmentField
                label={t('workflow.choosePaper')}
                title={t('workflow.choosePaper')}
                placeholder={t('workflow.choosePaper')}
                value={placePaperId}
                onChange={setPlacePaperId}
                options={accepted.map((paper) => ({
                  id: paper.id,
                  title: paper.title,
                  subtitle: paper.publicId ?? undefined,
                  code: paper.publicId?.replace(/\D/g, '').slice(-4),
                }))}
              />
              <label className="text-sm font-bold">
                {t('dossier.scheduleModality')}
                <FieldSelect
                  name="modality"
                  className={field}
                  defaultValue="IN_PERSON"
                  options={[
                    { value: 'IN_PERSON', label: t('dossier.modalityInPerson') },
                    { value: 'ONLINE', label: t('dossier.modalityOnline') },
                  ]}
                />
              </label>
              <Button
                type="submit"
                disabled={
                  program.data.sessions.length === 0 || !placeSessionId || !placePaperId
                }
              >
                {t('workflow.save')}
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={addRoomOpen} onOpenChange={setAddRoomOpen}>
        <DialogContent>
          <DialogTitle>{t('workflow.addRoom')}</DialogTitle>
          <DialogDescription>{t('workflow.room')}</DialogDescription>
          {conference ? (
            <form
              className="grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const name = String(new FormData(event.currentTarget).get('name') ?? '');
                void apiFetch(`/api/v1/conferences/${conference.id}/rooms`, {
                  method: 'POST',
                  body: JSON.stringify({ name, capacity: 40 }),
                }).then(async (response) => {
                  if (response.ok) {
                    feedback.success(t('workflow.saved'));
                    setAddRoomOpen(false);
                  } else {
                    feedback.error(await apiErrorMessage(response));
                  }
                  await queryClient.invalidateQueries({ queryKey: ['program'] });
                });
              }}
            >
              <label className="text-sm font-bold">
                {t('workflow.room')}
                <input name="name" required className={field} />
              </label>
              <Button type="submit">{t('workflow.save')}</Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
