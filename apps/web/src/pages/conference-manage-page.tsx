import type { PublicConference } from '@scholarflow/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Plus } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import {
  ConferenceFicheParts,
  ConferenceWorkNav,
} from '@/components/conference-work-nav';
import { CreateTeamMemberDialog } from '@/components/create-team-member-dialog';
import { FieldSelect } from '@/components/field-select';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCurrentUser } from '@/features/auth/use-account';
import { useFeedback } from '@/features/feedback/feedback';
import { formatMoney } from '@/lib/money';
import { apiErrorMessage, apiFetch } from '@/services/api';

interface ConferenceDetail extends PublicConference {
  status: string;
  visibility: string;
  paymentsEnabled: boolean;
  registrationFee: number | null;
  registrationCurrency: string;
  accessLocked: boolean;
  canManage: boolean;
  canViewMembers: boolean;
  myMembership: { id: string; role: string; status: string } | null;
  templates: {
    id: string;
    kind: string;
    language: string;
    subject: string;
    body: string;
    file?: { name: string; contentType: string } | null;
  }[];
  members: {
    id: string;
    email: string;
    role: string;
    status: string;
    firstName: string;
    lastName: string;
    academicTitle?: string | null;
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
  const account = useCurrentUser();
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const [teamRole, setTeamRole] = useState('');
  const [teamRoleOpen, setTeamRoleOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [createTeamOpen, setCreateTeamOpen] = useState(false);
  const [addTrackOpen, setAddTrackOpen] = useState(false);
  const [addDeadlineOpen, setAddDeadlineOpen] = useState(false);
  const [addTemplateOpen, setAddTemplateOpen] = useState(false);
  const [editingAll, setEditingAll] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [pendingTracks, setPendingTracks] = useState<
    { id: string; name: string; code: string }[]
  >([]);
  const [removedTrackIds, setRemovedTrackIds] = useState<string[]>([]);
  const [pendingDeadlines, setPendingDeadlines] = useState<
    { id: string; kind: string; dueAt: string; label: string }[]
  >([]);
  const [pendingTemplates, setPendingTemplates] = useState<
    { id: string; kind: string; language: string; subject: string; file: File }[]
  >([]);
  const recordFormRef = useRef<HTMLFormElement>(null);
  const query = useQuery({
    queryKey: ['conference', conferenceId],
    queryFn: () => loadConference(conferenceId),
  });
  const conference = query.data;

  async function send(path: string, method: string, payload?: unknown) {
    const response = await apiFetch(path, {
      method,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    if (!response.ok) {
      feedback.error(await apiErrorMessage(response));
      return false;
    }
    await queryClient.invalidateQueries({ queryKey: ['conference', conferenceId] });
    await queryClient.invalidateQueries({ queryKey: ['conferences'] });
    await queryClient.invalidateQueries({ queryKey: ['session-chairs'] });
    return true;
  }

  async function persist(
    path: string,
    method: string,
    payload?: unknown,
    body?: FormData,
  ) {
    const response = await apiFetch(path, {
      method,
      body: body ?? (payload === undefined ? undefined : JSON.stringify(payload)),
    });
    if (!response.ok) {
      feedback.error(await apiErrorMessage(response));
      return false;
    }
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
  const visibleTracks = [
    ...conference.tracks.filter((item) => !removedTrackIds.includes(item.id)),
    ...pendingTracks,
  ];
  const visibleDeadlines = [...conference.deadlines, ...pendingDeadlines];
  const visibleTemplates = [
    ...conference.templates,
    ...pendingTemplates.map((item) => ({
      id: item.id,
      kind: item.kind,
      language: item.language,
      subject: item.subject,
      body: '',
      file: { name: item.file.name, contentType: item.file.type },
      pending: true as const,
    })),
  ];

  function clearDrafts() {
    setPendingTracks([]);
    setRemovedTrackIds([]);
    setPendingDeadlines([]);
    setPendingTemplates([]);
  }

  async function saveAll() {
    const form = recordFormRef.current;
    if (!form) {
      return;
    }
    if (!form.reportValidity()) {
      return;
    }
    setSavingAll(true);
    try {
      const data = new FormData(form);
      const recordOk = await persist(`/api/v1/conferences/${conferenceId}`, 'PATCH', {
        name: String(data.get('name')),
        shortName: String(data.get('shortName')),
        description: String(data.get('description') ?? ''),
        website: String(data.get('website') ?? ''),
        city: String(data.get('city')),
        country: String(data.get('country')),
        startsOn: String(data.get('startsOn') || '') || null,
        endsOn: String(data.get('endsOn') || '') || null,
        paymentsEnabled: data.get('paymentsEnabled') === 'on',
        registrationFee: Number(data.get('registrationFee') || 0),
        registrationCurrency: 'EUR',
      });
      if (!recordOk) {
        return;
      }
      for (const track of pendingTracks) {
        const ok = await persist(`/api/v1/conferences/${conferenceId}/tracks`, 'POST', {
          name: track.name,
          code: track.code,
          description: '',
        });
        if (!ok) {
          return;
        }
      }
      for (const trackId of removedTrackIds) {
        const ok = await persist(
          `/api/v1/conferences/${conferenceId}/tracks/${trackId}`,
          'DELETE',
        );
        if (!ok) {
          return;
        }
      }
      for (const deadline of pendingDeadlines) {
        const ok = await persist(`/api/v1/conferences/${conferenceId}/deadlines`, 'POST', {
          kind: deadline.kind,
          label: '',
          dueAt: deadline.dueAt,
          trackId: null,
        });
        if (!ok) {
          return;
        }
      }
      for (const template of pendingTemplates) {
        const body = new FormData();
        body.set('kind', template.kind);
        body.set('language', template.language);
        body.set('subject', template.subject);
        body.set('file', template.file);
        const ok = await persist(
          `/api/v1/conferences/${conferenceId}/templates/file`,
          'POST',
          undefined,
          body,
        );
        if (!ok) {
          return;
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['conference', conferenceId] });
      await queryClient.invalidateQueries({ queryKey: ['conferences'] });
      clearDrafts();
      setEditingAll(false);
      feedback.success(t('workflow.saved'));
    } finally {
      setSavingAll(false);
    }
  }
  const canCreateAdmin =
    account.data?.platformRole === 'SYSTEM_ADMIN' ||
    conference.myMembership?.role === 'CHAIR';
  const createRole =
    teamRole === 'ADMIN'
      ? 'ADMINISTRATOR'
      : teamRole === 'COMMITTEE' || teamRole === 'REVIEWER'
        ? teamRole
        : null;
  const inviteRole =
    teamRole === 'COMMITTEE' || teamRole === 'REVIEWER' ? teamRole : null;

  return (
    <div className="space-y-6 pb-24">
      <header className="border-b border-[#e6e8ec] pb-4 sm:pb-5">
        <Link
          to="/workspace/conferences"
          className="text-sm font-bold text-[#8b909a] no-underline"
        >
          {t('conferences.back')}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl lg:text-3xl">
              {conference.name}
            </h1>
            {where ? <p className="mt-1 text-sm text-[#5c6578]">{where}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full bg-[#5d74ff]/12 px-3 py-1 text-xs font-bold text-[#3d4fd4]">
                {conference.shortName}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  conference.status === 'PUBLISHED'
                    ? 'bg-[#2fbf71]/14 text-[#1c9a57]'
                    : conference.status === 'DRAFT'
                      ? 'bg-[#f0a04b]/16 text-[#9a6410]'
                      : 'bg-[#eef0f5] text-[#5c6578]'
                }`}
              >
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
          </div>
          {conference.canManage && conference.status === 'DRAFT' ? (
            <Button
              type="button"
              onClick={() => void publish.mutate()}
              disabled={publish.isPending}
            >
              {t('conferences.publish')}
            </Button>
          ) : null}
        </div>
      </header>

      {conference.canManage ? (
        <div className="space-y-3">
          <ConferenceWorkNav
            conferenceId={conference.id}
            role={conference.myMembership?.role}
            slug={conference.slug}
            showPublic={
              conference.status === 'PUBLISHED' && conference.visibility === 'PUBLIC'
            }
            current="record"
          />
          <ConferenceFicheParts />
        </div>
      ) : conference.status === 'PUBLISHED' && conference.visibility === 'PUBLIC' ? (
        <Link
          to={`/directory/${conference.slug}`}
          className="inline-flex min-h-10 w-fit items-center rounded-full border border-[#c5cad6] bg-white px-4 text-sm font-extrabold text-[#3d4fd4] no-underline"
        >
          {t('conferences.viewPublic')}
        </Link>
      ) : null}

      {!conference.canManage &&
      conference.status === 'PUBLISHED' &&
      !conference.myRegistration ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-[#5d74ff]/12 px-4 py-3">
          <p className="text-sm font-bold text-[#3d4fd4]">
            {conference.paymentsEnabled ? t('workflow.feeDue') : t('workflow.register')}
          </p>
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
      {!conference.canManage && conference.myRegistration?.paymentStatus === 'PENDING' ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-[#f0a04b]/16 px-4 py-3">
          <p className="text-sm font-bold text-[#9a6410]">{t('workflow.feeDue')}</p>
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

      {conference.canManage ? (
        <section
          id="identity"
          className="scroll-mt-28 rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5"
        >
          <h2 className="text-lg font-extrabold text-[#1c2744]">
            {t('conferences.partIdentity')}
          </h2>
          {editingAll ? (
          <form
            ref={recordFormRef}
            key={`${conference.name}-${conference.shortName}-${conference.website}-${conference.city}-${conference.startsOn}-${conference.endsOn}-${conference.paymentsEnabled}-${conference.registrationFee}`}
            className="mt-4 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void saveAll();
            }}
          >
            <label className="grid gap-1.5 text-sm font-bold text-[#1c2744]">
              {t('conferences.name')}
              <Input name="name" required minLength={3} defaultValue={conference.name} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-bold text-[#1c2744]">
                {t('conferences.shortName')}
                <Input
                  name="shortName"
                  required
                  minLength={2}
                  maxLength={40}
                  defaultValue={conference.shortName}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-bold text-[#1c2744]">
                {t('conferences.site')}
                <Input
                  name="website"
                  type="url"
                  defaultValue={conference.website ?? ''}
                  placeholder="https://"
                />
              </label>
            </div>
            <label className="grid gap-1.5 text-sm font-bold text-[#1c2744]">
              {t('conferences.description')}
              <textarea
                name="description"
                maxLength={4000}
                defaultValue={conference.description}
                className="min-h-28 max-h-40 w-full resize-y overflow-y-auto rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-sm"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm font-bold text-[#1c2744]">
                {t('auth.city')}
                <Input name="city" defaultValue={conference.city ?? ''} />
              </label>
              <label className="grid gap-1.5 text-sm font-bold text-[#1c2744]">
                {t('auth.country')}
                <Input name="country" defaultValue={conference.country ?? ''} />
              </label>
              <label className="grid gap-1.5 text-sm font-bold text-[#1c2744]">
                {t('workflow.starts')}
                <Input
                  name="startsOn"
                  type="date"
                  defaultValue={conference.startsOn ?? ''}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-bold text-[#1c2744]">
                {t('workflow.ends')}
                <Input name="endsOn" type="date" defaultValue={conference.endsOn ?? ''} />
              </label>
            </div>
            <div className="flex flex-wrap items-end justify-between gap-4 border-t border-[#eef1f8] pt-4">
              <label className="grid max-w-xl gap-1 text-sm font-bold text-[#1c2744]">
                <span className="flex items-center gap-2">
                  <input
                    name="paymentsEnabled"
                    type="checkbox"
                    defaultChecked={conference.paymentsEnabled}
                    className="size-4 accent-[#5d74ff]"
                  />
                  {t('conferences.payments')}
                </span>
                <span className="pl-6 text-xs font-semibold text-[#5c6578]">
                  {t('conferences.paymentsHint')}
                </span>
              </label>
              <label className="grid min-w-[10rem] gap-1.5 text-sm font-bold text-[#1c2744]">
                {t('conferences.registrationFee')}
                <Input
                  name="registrationFee"
                  type="number"
                  min="0"
                  step="0.01"
                  defaultValue={conference.registrationFee ?? 250}
                />
              </label>
            </div>
          </form>
          ) : (
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <RecordValue label={t('conferences.name')} value={conference.name} wide />
              <RecordValue label={t('conferences.shortName')} value={conference.shortName} />
              <RecordValue
                label={t('conferences.site')}
                value={conference.website}
              />
              <RecordValue
                label={t('conferences.description')}
                value={conference.description}
                wide
              />
              <RecordValue label={t('auth.city')} value={conference.city} />
              <RecordValue label={t('auth.country')} value={conference.country} />
              <RecordValue
                label={t('workflow.starts')}
                value={
                  conference.startsOn
                    ? formatDay(conference.startsOn, i18n.language)
                    : null
                }
              />
              <RecordValue
                label={t('workflow.ends')}
                value={
                  conference.endsOn ? formatDay(conference.endsOn, i18n.language) : null
                }
              />
              <RecordValue
                label={t('conferences.payments')}
                value={
                  conference.paymentsEnabled
                    ? t('conferences.paymentsOn')
                    : t('conferences.paymentsOff')
                }
              />
              {conference.paymentsEnabled ? (
                <RecordValue
                  label={t('conferences.registrationFee')}
                  value={formatMoney(
                    conference.registrationFee,
                    conference.registrationCurrency,
                    i18n.language,
                  )}
                />
              ) : null}
            </dl>
          )}
        </section>
      ) : null}

      <section id="setup" className="scroll-mt-28 space-y-3">
        <h2 className="text-lg font-extrabold text-[#1c2744]">
          {t('conferences.sectionSetup')}
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-[#1c2744]">
                {t('conferences.tracks')}
              </h3>
              {conference.canManage && editingAll ? (
                <Button type="button" size="sm" onClick={() => setAddTrackOpen(true)}>
                  <Plus className="size-4" />
                  {t('conferences.addTrack')}
                </Button>
              ) : null}
            </div>
            {visibleTracks.length === 0 ? (
              <p className="mt-3 text-sm text-[#8b909a]">{t('conferences.noTracks')}</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {visibleTracks.map((track) => (
                  <li
                    key={track.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm"
                  >
                    <span>
                      <span className="mr-2 rounded-full bg-white px-2 py-0.5 text-xs font-extrabold">
                        {track.code}
                      </span>
                      {track.name}
                    </span>
                    {conference.canManage && editingAll ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (pendingTracks.some((item) => item.id === track.id)) {
                            setPendingTracks((current) =>
                              current.filter((item) => item.id !== track.id),
                            );
                            return;
                          }
                          setRemovedTrackIds((current) => [...current, track.id]);
                        }}
                      >
                        {t('conferences.remove')}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            <Dialog open={addTrackOpen} onOpenChange={setAddTrackOpen}>
              <DialogContent className="sm:w-[min(100%-1.5rem,32rem)]">
                <DialogTitle className="pr-10 text-lg font-extrabold text-[#1c2744]">
                  {t('conferences.addTrack')}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-[#5c6578]">
                  {t('conferences.tracks')}
                </DialogDescription>
                <form
                  className="mt-4 grid gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    setPendingTracks((current) => [
                      ...current,
                      {
                        id: `pending-track-${Date.now()}`,
                        name: String(data.get('name') ?? ''),
                        code: String(data.get('code') ?? ''),
                      },
                    ]);
                    setAddTrackOpen(false);
                  }}
                >
                  <label className="grid gap-1.5 text-sm font-bold text-[#1c2744]">
                    {t('conferences.trackName')}
                    <Input name="name" required />
                  </label>
                  <label className="grid gap-1.5 text-sm font-bold text-[#1c2744]">
                    {t('conferences.trackCode')}
                    <Input name="code" required />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit">{t('conferences.addTrack')}</Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAddTrackOpen(false)}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <div className="rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-extrabold text-[#1c2744]">
                {t('conferences.deadlines')}
              </h3>
              {conference.canManage && editingAll ? (
                <Button type="button" size="sm" onClick={() => setAddDeadlineOpen(true)}>
                  <Plus className="size-4" />
                  {t('conferences.addDeadline')}
                </Button>
              ) : null}
            </div>
            {visibleDeadlines.length === 0 ? (
              <p className="mt-3 text-sm text-[#8b909a]">{t('conferences.noDeadlines')}</p>
            ) : (
              <ul className="mt-3 grid gap-2">
                {visibleDeadlines.map((deadline) => (
                  <li
                    key={deadline.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm"
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
            )}
            <Dialog open={addDeadlineOpen} onOpenChange={setAddDeadlineOpen}>
              <DialogContent className="sm:w-[min(100%-1.5rem,32rem)]">
                <DialogTitle className="pr-10 text-lg font-extrabold text-[#1c2744]">
                  {t('conferences.addDeadline')}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-[#5c6578]">
                  {t('conferences.deadlines')}
                </DialogDescription>
                <form
                  className="mt-4 grid gap-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const parsed = new Date(String(data.get('dueAt') ?? ''));
                    setPendingDeadlines((current) => [
                      ...current,
                      {
                        id: `pending-deadline-${Date.now()}`,
                        kind: String(data.get('kind') ?? 'SUBMISSION'),
                        dueAt: parsed.toISOString(),
                        label: '',
                      },
                    ]);
                    setAddDeadlineOpen(false);
                  }}
                >
                  <label className="grid gap-1.5 text-sm font-bold text-[#1c2744]">
                    {t('conferences.deadlines')}
                    <FieldSelect
                      name="kind"
                      defaultValue="SUBMISSION"
                      className="min-h-10 w-full rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-sm font-semibold text-[#1c2744]"
                      options={[
                        'SUBMISSION',
                        'REVIEW',
                        'NOTIFICATION',
                        'CAMERA_READY',
                        'REGISTRATION',
                      ].map((kind) => ({
                        value: kind,
                        label: t(`conferences.kinds.${kind}`),
                      }))}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm font-bold text-[#1c2744]">
                    {t('workflow.starts')}
                    <Input name="dueAt" type="datetime-local" required />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit">{t('conferences.addDeadline')}</Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setAddDeadlineOpen(false)}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </section>

      {conference.canManage ? (
        <section
          id="registrations"
          className="scroll-mt-28 rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5"
        >
          <h2 className="text-lg font-extrabold text-[#1c2744]">
            {t('workflow.registrations')}
          </h2>
          <p className="mt-1 text-sm text-[#5c6578]">{t('workflow.registrationsHint')}</p>
          {conference.registrations.length === 0 ? (
            <p className="mt-3 text-sm text-[#8b909a]">{t('workflow.noRegistrations')}</p>
          ) : (
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
          )}
        </section>
      ) : null}

      {conference.canManage || conference.canViewMembers ? (
        <section id="people" className="scroll-mt-28 space-y-3">
          <h2 className="text-lg font-extrabold text-[#1c2744]">
            {t('conferences.sectionPeople')}
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {conference.canViewMembers ? (
              <div className="rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5">
                <h3 className="text-base font-extrabold text-[#1c2744]">
                  {t('conferences.members')}
                </h3>
                <ul className="mt-3 grid gap-2">
                  {conference.members
                    .filter((member) => member.role !== 'AUTHOR')
                    .map((member) => (
                    <li
                      key={member.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="block font-extrabold text-[#1c2744]">
                          {member.firstName} {member.lastName}
                        </span>
                        <span className="mt-0.5 block text-xs text-[#8b909a]">
                          {member.email}
                          {' · '}
                          {t(
                            member.academicTitle === 'Session chair'
                              ? 'conferences.roles.SESSION_CHAIR'
                              : `conferences.roles.${member.role}`,
                            { defaultValue: member.role },
                          )}
                          {' · '}
                          {t(`conferences.membership.${member.status}`, {
                            defaultValue: member.status,
                          })}
                        </span>
                      </span>
                      {conference.canManage && editingAll && member.role !== 'CHAIR' ? (
                        <Button
                          type="button"
                          size="sm"
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
                {conference.canManage && editingAll ? (
                  <>
                    <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end">
                      <div className="relative min-w-0">
                        <p className="text-sm font-bold text-[#1c2744]">
                          {t('conferences.chooseRole')}
                        </p>
                        <button
                          type="button"
                          aria-expanded={teamRoleOpen}
                          onClick={() => setTeamRoleOpen((open) => !open)}
                          className="mt-1.5 flex min-h-10 w-full items-center justify-between gap-2 rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-left text-sm font-semibold text-[#1c2744]"
                        >
                          <span
                            className={
                              teamRole ? 'truncate' : 'truncate text-[#8b909a]'
                            }
                          >
                            {teamRole === 'ADMIN'
                              ? t('conferences.roles.ADMINISTRATOR')
                              : teamRole === 'COMMITTEE'
                                ? t('conferences.roles.COMMITTEE')
                                : teamRole === 'REVIEWER'
                                  ? t('conferences.roles.REVIEWER')
                                  : t('conferences.chooseRole')}
                          </span>
                          <ChevronDown className="size-4 shrink-0 text-[#8b909a]" />
                        </button>
                        {teamRoleOpen ? (
                          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-[#e4e7ee] bg-white py-1 shadow-[0_12px_32px_rgba(28,39,68,0.12)]">
                            {(
                              [
                                ['ADMIN', 'conferences.roles.ADMINISTRATOR'],
                                ['COMMITTEE', 'conferences.roles.COMMITTEE'],
                                ['REVIEWER', 'conferences.roles.REVIEWER'],
                              ] as const
                            ).map(([id, label]) => (
                              <li key={id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setTeamRole(id);
                                    setInviteEmail('');
                                    setTeamRoleOpen(false);
                                  }}
                                  className={`flex w-full px-3 py-2 text-left text-sm ${
                                    id === teamRole
                                      ? 'bg-[#f6f7fb] font-extrabold text-[#1c2744]'
                                      : 'font-semibold text-[#1c2744] hover:bg-[#f6f7fb]'
                                  }`}
                                >
                                  {t(label)}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      {inviteRole ? (
                        <label className="min-w-0 text-sm font-bold text-[#1c2744]">
                          {t('conferences.inviteEmail')}
                          <Input
                            type="email"
                            value={inviteEmail}
                            onChange={(event) => setInviteEmail(event.target.value)}
                            className="mt-1.5"
                          />
                        </label>
                      ) : (
                        <p className="self-center text-xs font-semibold text-[#8b909a]">
                          {t('conferences.inviteHint')}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        {inviteRole ? (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={!inviteEmail.trim()}
                            onClick={() => {
                              void send(
                                `/api/v1/conferences/${conferenceId}/invitations`,
                                'POST',
                                { email: inviteEmail.trim(), role: inviteRole },
                              ).then((ok) => {
                                if (ok) {
                                  setInviteEmail('');
                                  feedback.success(t('workflow.saved'));
                                }
                              });
                            }}
                          >
                            {t('conferences.invite')}
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          disabled={
                            !createRole ||
                            (createRole === 'ADMINISTRATOR' && !canCreateAdmin)
                          }
                          onClick={() => setCreateTeamOpen(true)}
                        >
                          <Plus className="size-4" />
                          {t('conferences.createTeam')}
                        </Button>
                      </div>
                    </div>
                    {createRole ? (
                      <CreateTeamMemberDialog
                        open={createTeamOpen}
                        onOpenChange={setCreateTeamOpen}
                        conferenceId={conferenceId}
                        role={createRole}
                      />
                    ) : null}
                    <p className="mt-2 text-xs font-semibold text-[#8b909a]">
                      {t('conferences.inviteHint')}
                    </p>
                  </>
                ) : null}
              </div>
            ) : null}

            {conference.canManage ? (
              <div className="rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5">
                <h3 className="text-base font-extrabold text-[#1c2744]">
                  {t('conferences.invitations')}
                </h3>
                <p className="mt-1 text-sm text-[#5c6578]">
                  {t('conferences.invitationHint')}
                </p>
                {conference.invitations && conference.invitations.length > 0 ? (
                  <ul className="mt-3 grid gap-2">
                    {conference.invitations.map((invitation) => (
                      <li
                        key={invitation.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#f0a04b]/16 px-4 py-3 text-sm"
                      >
                        <span className="font-extrabold">{invitation.email}</span>
                        <span className="text-xs font-extrabold text-[#9a6410]">
                          {t(`conferences.roles.${invitation.role}`, {
                            defaultValue: invitation.role,
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-[#8b909a]">
                    {t('conferences.noInvitations')}
                  </p>
                )}
              </div>
            ) : null}
          </div>

        </section>
      ) : null}

      {conference.canManage ? (
        <section
          id="templates"
          className="scroll-mt-28 rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold text-[#1c2744]">
              {t('conferences.templates')}
            </h2>
            {editingAll ? (
              <Button type="button" size="sm" onClick={() => setAddTemplateOpen(true)}>
                <Plus className="size-4" />
                {t('conferences.saveTemplate')}
              </Button>
            ) : null}
          </div>
          {visibleTemplates.length === 0 ? (
            <p className="mt-2 text-sm text-[#8b909a]">{t('conferences.noTemplates')}</p>
          ) : (
            <ul className="mt-3 grid gap-2">
              {visibleTemplates.map((template) => (
                <li
                  key={template.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <span className="font-extrabold">
                      {t(`conferences.kinds.${template.kind}`, {
                        defaultValue: template.kind,
                      })}
                    </span>
                    <span className="text-[#8b909a]"> ({template.language})</span>
                    <p className="mt-1 text-[#5c6578]">{template.subject}</p>
                    {template.file ? (
                      <p className="mt-1 text-xs font-bold text-[#3d4fd4]">
                        {template.file.name}
                      </p>
                    ) : null}
                  </div>
                  {template.file && !template.id.startsWith('pending-') ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void apiFetch(
                          `/api/v1/conferences/${conferenceId}/templates/${template.id}/file`,
                        ).then(async (response) => {
                          if (!response.ok) {
                            feedback.error(await apiErrorMessage(response));
                            return;
                          }
                          const blob = await response.blob();
                          const url = URL.createObjectURL(blob);
                          const link = document.createElement('a');
                          link.href = url;
                          link.download = template.file?.name ?? 'template';
                          link.click();
                          URL.revokeObjectURL(url);
                        });
                      }}
                    >
                      {t('conferences.templateDownload')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <Dialog open={addTemplateOpen} onOpenChange={setAddTemplateOpen}>
            <DialogContent className="sm:w-[min(100%-1.5rem,32rem)]">
              <DialogTitle className="pr-10 text-lg font-extrabold text-[#1c2744]">
                {t('conferences.saveTemplate')}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-[#5c6578]">
                {t('conferences.templateFileHint')}
              </DialogDescription>
              <form
                className="mt-4 grid gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const file = data.get('file');
                  if (!(file instanceof File) || file.size === 0) {
                    return;
                  }
                  setPendingTemplates((current) => [
                    ...current,
                    {
                      id: `pending-template-${Date.now()}`,
                      kind: String(data.get('kind') ?? 'NOTIFICATION'),
                      language: String(data.get('language') ?? 'en'),
                      subject: String(data.get('subject') ?? file.name),
                      file,
                    },
                  ]);
                  setAddTemplateOpen(false);
                }}
              >
                <label className="grid gap-1.5 text-sm font-bold text-[#1c2744]">
                  {t('conferences.templates')}
                  <FieldSelect
                    name="kind"
                    defaultValue="NOTIFICATION"
                    className="min-h-10 w-full rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-sm font-semibold text-[#1c2744]"
                    options={['NOTIFICATION', 'INVITATION', 'DECISION_LETTER', 'COPYRIGHT'].map(
                      (kind) => ({
                        value: kind,
                        label: t(`conferences.kinds.${kind}`),
                      }),
                    )}
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-bold text-[#1c2744]">
                  {t('conferences.subject')}
                  <Input name="subject" />
                </label>
                <label className="grid gap-1.5 text-sm font-bold text-[#1c2744]">
                  {t('conferences.templateFile')}
                  <Input
                    name="file"
                    type="file"
                    required
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  />
                </label>
                <input type="hidden" name="language" value={i18n.language.startsWith('fr') ? 'fr' : 'en'} />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">{t('conferences.saveTemplate')}</Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setAddTemplateOpen(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </section>
      ) : null}

      {conference.canManage ? (
        <div className="sticky bottom-3 z-30 flex flex-wrap items-center justify-end gap-2 rounded-[24px] border border-[#e4e7ee] bg-white/95 px-4 py-3 shadow-[0_8px_24px_rgba(28,39,68,0.12)]">
          {editingAll ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={savingAll}
                onClick={() => {
                  clearDrafts();
                  setEditingAll(false);
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button type="button" disabled={savingAll} onClick={() => void saveAll()}>
                {t('common.saveAll')}
              </Button>
            </>
          ) : (
            <Button type="button" onClick={() => setEditingAll(true)}>
              {t('common.modify')}
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function RecordValue({
  label,
  value,
  wide,
}: {
  label: string;
  value?: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-xs font-extrabold uppercase tracking-wide text-[#8b909a]">
        {label}
      </dt>
      <dd className="mt-1 whitespace-pre-wrap break-words text-sm font-semibold text-[#1c2744]">
        {value?.trim() ? value : '—'}
      </dd>
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
