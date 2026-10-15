import type { PublicConference } from '@scholarflow/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface ConferenceDetail extends PublicConference {
  status: string;
  visibility: string;
  paymentsEnabled: boolean;
  canManage: boolean;
  canViewMembers: boolean;
  myMembership: { id: string; role: string; status: string } | null;
  templates: {
    id: string;
    kind: string;
    language: string;
    subject: string;
    body: string;
  }[];
  members: {
    id: string;
    email: string;
    role: string;
    status: string;
    firstName: string;
    lastName: string;
  }[];
  invitations?: {
    id: string;
    email: string;
    role: string;
    expiresAt: string;
  }[];
  myRegistration: { status: string; paymentStatus: string } | null;
  registrations: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    status: string;
    paymentStatus: string;
  }[];
}

async function loadConference(id: string): Promise<ConferenceDetail> {
  const response = await apiFetch(`/api/v1/conferences/${id}`);
  if (!response.ok) {
    throw new Error(await apiErrorMessage(response));
  }
  return response.json() as Promise<ConferenceDetail>;
}

export function ConferenceManagePage() {
  const { t, i18n } = useTranslation();
  const { conferenceId = '' } = useParams();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [trackName, setTrackName] = useState('');
  const [trackCode, setTrackCode] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [deadlineKind, setDeadlineKind] = useState('SUBMISSION');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('AUTHOR');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const query = useQuery({
    queryKey: ['conference', conferenceId],
    queryFn: () => loadConference(conferenceId),
  });
  const conference = query.data;

  async function send(path: string, method: string, payload?: unknown) {
    setMessage(null);
    const response = await apiFetch(path, {
      method,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    if (!response.ok) {
      setMessage(await apiErrorMessage(response));
      return false;
    }
    await queryClient.invalidateQueries({ queryKey: ['conference', conferenceId] });
    await queryClient.invalidateQueries({ queryKey: ['conferences'] });
    return true;
  }

  const publish = useMutation({
    mutationFn: () =>
      send(`/api/v1/conferences/${conferenceId}`, 'PATCH', {
        status: 'PUBLISHED',
        visibility: 'PUBLIC',
      }),
  });

  if (query.isPending) {
    return <p>{t('common.loading')}</p>;
  }
  if (query.isError || !conference) {
    return <p>{t('conferences.notPublic')}</p>;
  }

  const place = [conference.city, conference.country].filter(Boolean).join(' · ');
  const when = formatRange(conference.startsOn, conference.endsOn, i18n.language);
  const where = [place, when].filter(Boolean).join(' · ');

  return (
    <div className="space-y-5">
      <div>
        <Link
          to="/workspace/conferences"
          className="text-sm font-bold text-[#8b909a] no-underline"
        >
          {t('conferences.back')}
        </Link>
        <h1 className="mt-2 text-3xl font-extrabold text-[#1c2744]">{conference.name}</h1>
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
          <span className="rounded-full bg-[#2fbf71]/14 px-3 py-1 text-xs font-bold text-[#1c9a57]">
            {t(`conferences.states.${conference.status}`, {
              defaultValue: conference.status,
            })}
          </span>
          {conference.myMembership ? (
            <span className="rounded-full bg-[#5d74ff]/12 px-3 py-1 text-xs font-bold text-[#3d4fd4]">
              {t(`conferences.roles.${conference.myMembership.role}`, {
                defaultValue: conference.myMembership.role,
              })}
            </span>
          ) : null}
        </div>
        {conference.status === 'PUBLISHED' && conference.visibility === 'PUBLIC' ? (
          <Link
            to={`/directory/${conference.slug}`}
            className="mt-3 inline-block rounded-full bg-[#eef2ff] px-3 py-1 text-sm font-bold text-[#3d4fd4] no-underline"
          >
            {t('conferences.viewPublic')}
          </Link>
        ) : null}
      </div>
      {message ? <p className="text-sm">{message}</p> : null}
      {conference.canManage ? (
        <form
          key={`${conference.name}-${conference.shortName}-${conference.website}-${conference.city}-${conference.startsOn}-${conference.endsOn}-${conference.paymentsEnabled}`}
          className="grid gap-3 rounded-2xl border border-[#e4e7ee] bg-white p-5 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void send(`/api/v1/conferences/${conferenceId}`, 'PATCH', {
              name: String(data.get('name')),
              shortName: String(data.get('shortName')),
              description: String(data.get('description') ?? ''),
              website: String(data.get('website') ?? ''),
              city: String(data.get('city')),
              country: String(data.get('country')),
              startsOn: String(data.get('startsOn') || '') || null,
              endsOn: String(data.get('endsOn') || '') || null,
              paymentsEnabled: data.get('paymentsEnabled') === 'on',
            }).then((ok) => {
              if (ok) {
                setMessage(t('workflow.saved'));
              }
            });
          }}
        >
          <h2 className="text-lg font-extrabold md:col-span-2">
            {t('conferences.edit')}
          </h2>
          <label className="text-sm font-bold md:col-span-2">
            {t('conferences.name')}
            <Input
              name="name"
              required
              minLength={3}
              defaultValue={conference.name}
              className="mt-1"
            />
          </label>
          <label className="text-sm font-bold">
            {t('conferences.shortName')}
            <Input
              name="shortName"
              required
              minLength={2}
              maxLength={40}
              defaultValue={conference.shortName}
              className="mt-1"
            />
          </label>
          <label className="text-sm font-bold">
            {t('conferences.site')}
            <Input
              name="website"
              type="url"
              defaultValue={conference.website ?? ''}
              placeholder="https://"
              className="mt-1"
            />
          </label>
          <label className="text-sm font-bold md:col-span-2">
            {t('conferences.description')}
            <textarea
              name="description"
              maxLength={4000}
              defaultValue={conference.description}
              className="mt-1 min-h-24 w-full rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm font-bold">
            {t('auth.city')}
            <Input name="city" defaultValue={conference.city ?? ''} className="mt-1" />
          </label>
          <label className="text-sm font-bold">
            {t('auth.country')}
            <Input
              name="country"
              defaultValue={conference.country ?? ''}
              className="mt-1"
            />
          </label>
          <label className="text-sm font-bold">
            {t('workflow.starts')}
            <Input
              name="startsOn"
              type="date"
              defaultValue={conference.startsOn ?? ''}
              className="mt-1"
            />
          </label>
          <label className="text-sm font-bold">
            {t('workflow.ends')}
            <Input
              name="endsOn"
              type="date"
              defaultValue={conference.endsOn ?? ''}
              className="mt-1"
            />
          </label>
          <label className="flex items-center gap-2 text-sm font-bold md:col-span-2">
            <input
              name="paymentsEnabled"
              type="checkbox"
              defaultChecked={conference.paymentsEnabled}
              className="size-4 accent-[#5d74ff]"
            />
            {t('conferences.payments')}
          </label>
          <div>
            <Button type="submit">{t('workflow.save')}</Button>
          </div>
        </form>
      ) : null}
      {conference.status === 'PUBLISHED' && !conference.myRegistration ? (
        <div className="rounded-2xl bg-[#5d74ff]/10 px-4 py-3">
          {conference.paymentsEnabled ? (
            <p className="mb-3 text-sm text-[#3d4fd4]">{t('workflow.feeDue')}</p>
          ) : null}
          <Button
            type="button"
            onClick={() =>
              void send(`/api/v1/conferences/${conferenceId}/register`, 'POST', {})
            }
          >
            {t('workflow.register')}
          </Button>
        </div>
      ) : null}
      {conference.myRegistration?.paymentStatus === 'PENDING' ? (
        <div className="rounded-2xl bg-[#f0a04b]/12 px-4 py-3">
          <p className="mb-3 text-sm text-[#9a6410]">{t('workflow.feeDue')}</p>
          <Button
            type="button"
            onClick={() =>
              void send(`/api/v1/conferences/${conferenceId}/payment`, 'POST', {})
            }
          >
            {t('workflow.pay')}
          </Button>
        </div>
      ) : null}
      {conference.canManage && conference.registrations.length > 0 ? (
        <section className="rounded-2xl border border-[#e4e7ee] bg-white p-5">
          <h2 className="text-lg font-extrabold">{t('workflow.registrations')}</h2>
          <ul className="mt-3 grid gap-2">
            {conference.registrations.map((item) => (
              <li
                key={item.userId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm"
              >
                <span>
                  <span className="font-extrabold">
                    {item.firstName} {item.lastName}
                  </span>
                  <span className="mt-1 block text-xs text-[#8b909a]">{item.email}</span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span>
                    {t(`workflow.registrationStatus.${item.status}`, {
                      defaultValue: item.status,
                    })}
                  </span>
                  <span>
                    {t(`workflow.paymentStatus.${item.paymentStatus}`, {
                      defaultValue: item.paymentStatus,
                    })}
                  </span>
                  {item.status === 'REQUESTED' && item.paymentStatus !== 'PENDING' ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        void send(
                          `/api/v1/conferences/${conferenceId}/registrations/${item.userId}/verify`,
                          'POST',
                          {},
                        )
                      }
                    >
                      {t('workflow.verifyRegistration')}
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {conference.canManage && conference.status === 'DRAFT' ? (
        <Button
          type="button"
          onClick={() => void publish.mutate()}
          disabled={publish.isPending}
        >
          {t('conferences.publish')}
        </Button>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border border-[#e4e7ee] bg-white shadow-none">
          <CardHeader>
            <CardTitle>{t('conferences.tracks')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {conference.tracks.length === 0 ? (
              <p className="text-[#8b909a]">{t('conferences.noTracks')}</p>
            ) : null}
            <ul className="space-y-2">
              {conference.tracks.map((track) => (
                <li
                  key={track.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f6f7fb] px-4 py-3"
                >
                  <span>
                    <span className="mr-2 rounded-full bg-white px-2 py-0.5 text-xs font-extrabold">
                      {track.code}
                    </span>
                    {track.name}
                  </span>
                  {conference.canManage ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void send(
                          `/api/v1/conferences/${conferenceId}/tracks/${track.id}`,
                          'DELETE',
                        )
                      }
                    >
                      {t('conferences.remove')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {conference.canManage ? (
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(`/api/v1/conferences/${conferenceId}/tracks`, 'POST', {
                    name: trackName,
                    code: trackCode,
                    description: '',
                  }).then(() => {
                    setTrackName('');
                    setTrackCode('');
                  });
                }}
              >
                <Input
                  value={trackName}
                  onChange={(event) => setTrackName(event.target.value)}
                  placeholder={t('conferences.trackName')}
                />
                <Input
                  value={trackCode}
                  onChange={(event) => setTrackCode(event.target.value)}
                  placeholder={t('conferences.trackCode')}
                />
                <Button type="submit">{t('conferences.addTrack')}</Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
        <Card className="rounded-2xl border border-[#e4e7ee] bg-white shadow-none">
          <CardHeader>
            <CardTitle>{t('conferences.deadlines')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {conference.deadlines.length === 0 ? (
              <p className="text-[#8b909a]">{t('conferences.noDeadlines')}</p>
            ) : null}
            <ul className="space-y-2">
              {conference.deadlines.map((deadline) => (
                <li
                  key={deadline.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-[#f6f7fb] px-4 py-3"
                >
                  <span className="font-extrabold">
                    {deadline.label.trim() ||
                      t(`conferences.kinds.${deadline.kind}`, {
                        defaultValue: deadline.kind,
                      })}
                  </span>
                  <span className="text-[#5c6370]">
                    {new Date(deadline.dueAt).toLocaleString(i18n.language, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </li>
              ))}
            </ul>
            {conference.canManage ? (
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const parsed = new Date(dueAt);
                  void send(`/api/v1/conferences/${conferenceId}/deadlines`, 'POST', {
                    kind: deadlineKind,
                    label: '',
                    dueAt: parsed.toISOString(),
                    trackId: null,
                  }).then(() => setDueAt(''));
                }}
              >
                <select
                  className="rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2 text-sm"
                  value={deadlineKind}
                  onChange={(event) => setDeadlineKind(event.target.value)}
                  aria-label={t('conferences.deadlines')}
                >
                  {[
                    'SUBMISSION',
                    'REVIEW',
                    'NOTIFICATION',
                    'CAMERA_READY',
                    'REGISTRATION',
                  ].map((kind) => (
                    <option key={kind} value={kind}>
                      {t(`conferences.kinds.${kind}`)}
                    </option>
                  ))}
                </select>
                <Input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(event) => setDueAt(event.target.value)}
                />
                <Button type="submit">{t('conferences.addDeadline')}</Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>
      {conference.canManage ? (
        <Card className="rounded-2xl border border-[#e4e7ee] bg-white shadow-none">
          <CardHeader>
            <CardTitle>{t('conferences.templates')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {conference.templates.length === 0 ? (
              <p>{t('conferences.noTemplates')}</p>
            ) : null}
            <ul>
              {conference.templates.map((template) => (
                <li key={template.id}>
                  {t(`conferences.kinds.${template.kind}`, {
                    defaultValue: template.kind,
                  })}{' '}
                  ({template.language}) : {template.subject}
                </li>
              ))}
            </ul>
            <form
              className="grid gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                void send(`/api/v1/conferences/${conferenceId}/templates`, 'POST', {
                  kind: 'NOTIFICATION',
                  language: 'en',
                  subject,
                  body,
                }).then(() => {
                  setSubject('');
                  setBody('');
                });
              }}
            >
              <Input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder={t('conferences.subject')}
              />
              <Input
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder={t('conferences.body')}
              />
              <div>
                <Button type="submit">{t('conferences.saveTemplate')}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}
      {conference.canManage ? (
        <Card className="rounded-2xl border border-[#e4e7ee] bg-white shadow-none">
          <CardHeader>
            <CardTitle>{t('conferences.invitations')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-[#5c6578]">{t('conferences.invitationHint')}</p>
            {conference.invitations && conference.invitations.length > 0 ? (
              <ul className="grid gap-2">
                {conference.invitations.map((invitation) => (
                  <li
                    key={invitation.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#f6f7fb] px-4 py-3"
                  >
                    <span className="font-extrabold">{invitation.email}</span>
                    <span className="rounded-full bg-[#f0a04b]/16 px-2.5 py-1 text-xs font-extrabold text-[#9a6410]">
                      {t(`conferences.roles.${invitation.role}`, {
                        defaultValue: invitation.role,
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[#8b909a]">{t('conferences.noInvitations')}</p>
            )}
          </CardContent>
        </Card>
      ) : null}
      {conference.canViewMembers ? (
        <Card className="rounded-2xl border border-[#e4e7ee] bg-white shadow-none">
          <CardHeader>
            <CardTitle>{t('conferences.members')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <ul>
              {conference.members.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-1"
                >
                  <span className="min-w-0 flex-1 break-words">
                    {member.firstName} {member.lastName} · {member.email} ·{' '}
                    {t(`conferences.roles.${member.role}`, { defaultValue: member.role })}{' '}
                    ·{' '}
                    {t(`conferences.membership.${member.status}`, {
                      defaultValue: member.status,
                    })}
                  </span>
                  {conference.canManage && member.role !== 'CHAIR' ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void send(
                          `/api/v1/conferences/${conferenceId}/members/${member.id}/remove`,
                          'POST',
                        )
                      }
                    >
                      {t('conferences.remove')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
            {conference.canManage ? (
              <form
                className="flex flex-wrap gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(`/api/v1/conferences/${conferenceId}/invitations`, 'POST', {
                    email: inviteEmail,
                    role: inviteRole,
                  }).then(() => setInviteEmail(''));
                }}
              >
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                  placeholder={t('auth.email')}
                />
                <select
                  className="rounded-md border border-border bg-card px-2 text-sm"
                  value={inviteRole}
                  onChange={(event) => setInviteRole(event.target.value)}
                >
                  <option value="AUTHOR">{t('conferences.roles.AUTHOR')}</option>
                  <option value="REVIEWER">{t('conferences.roles.REVIEWER')}</option>
                </select>
                <Button type="submit">{t('conferences.invite')}</Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
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
