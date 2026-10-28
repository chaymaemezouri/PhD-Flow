import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router';
import { PaperFileThumb } from '@/components/paper-file-preview';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth/use-account';
import { useFeedback } from '@/features/feedback/feedback';
import { isSessionChair } from '@/features/navigation/home-path';
import type { AssignedPresentation } from '@/features/presentations/session-chair-queue';
import { apiErrorMessage, apiFetch } from '@/services/api';

export function SessionChairTalkPage() {
  const { t, i18n } = useTranslation();
  const { paperId = '' } = useParams();
  const account = useCurrentUser();
  const queryClient = useQueryClient();
  const feedback = useFeedback();
  const sessionChairSelf = isSessionChair(account.data?.profile?.academicTitle);

  const assigned = useQuery({
    queryKey: ['presentations-mine'],
    enabled: Boolean(account.data) && sessionChairSelf,
    queryFn: async () => {
      const response = await apiFetch('/api/v1/presentations/mine');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<AssignedPresentation[]>;
    },
  });

  const item = (assigned.data ?? []).find(
    (row) => row.paperId === paperId && row.role === 'CHAIR',
  );

  if (account.isPending || assigned.isPending) {
    return <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>;
  }

  if (!sessionChairSelf) {
    return <Navigate to={`/workspace/submissions/${paperId}`} replace />;
  }

  if (!item) {
    return (
      <div className="space-y-4">
        <Link
          to="/workspace/session-chair"
          className="inline-flex items-center gap-2 text-sm font-extrabold text-[#3d4fd4] no-underline"
        >
          <ArrowLeft className="size-4" />
          {t('sessionChair.backToQueue')}
        </Link>
        <p className="rounded-2xl bg-[#f6f7fb] px-4 py-3 text-sm text-[#5c6578]">
          {t('sessionChair.talkNotFound')}
        </p>
      </div>
    );
  }

  const statusLabel = item.presented
    ? t('dossier.presentationPresented')
    : item.absent
      ? t('sessionChair.absent')
      : item.schedule
        ? t('dossier.presentationScheduled')
        : t('dossier.waitingSchedule');

  const field =
    'mt-1 block w-full rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-sm';
  const talkLanguages = [
    { value: 'FR', label: t('sessionChair.langFR') },
    { value: 'AR', label: t('sessionChair.langAR') },
    { value: 'EN', label: t('sessionChair.langEN') },
  ] as const;

  async function saveLanguage(language: 'FR' | 'AR' | 'EN') {
    const response = await apiFetch(
      `/api/v1/papers/${item!.paperId}/presentation-language`,
      {
        method: 'POST',
        body: JSON.stringify({ language }),
      },
    );
    if (response.ok) {
      feedback.success(t('workflow.saved'));
      await queryClient.invalidateQueries({ queryKey: ['presentations-mine'] });
      await queryClient.invalidateQueries({ queryKey: ['paper'] });
    } else {
      feedback.error(await apiErrorMessage(response));
    }
  }

  async function assess(intent: 'presented' | 'absent' | 'save', form: FormData) {
    if (!item?.schedule) {
      return;
    }
    const scoreRaw = String(form.get('score') ?? '');
    const score = scoreRaw ? Number(scoreRaw) : undefined;
    const comment = String(form.get('comment') ?? '');
    const absent = intent === 'absent';
    const response = await apiFetch(
      `/api/v1/presentations/${item.schedule.presentationId}/assessment`,
      {
        method: 'POST',
        body: JSON.stringify({
          score: absent ? undefined : score,
          comment,
          presented: !absent,
          absent,
        }),
      },
    );
    if (response.ok) {
      feedback.success(t('workflow.saved'));
      await queryClient.invalidateQueries({ queryKey: ['presentations-mine'] });
      await queryClient.invalidateQueries({ queryKey: ['program'] });
      await queryClient.invalidateQueries({ queryKey: ['paper'] });
    } else {
      feedback.error(await apiErrorMessage(response));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to="/workspace/session-chair"
          className="inline-flex items-center gap-2 text-sm font-extrabold text-[#3d4fd4] no-underline"
        >
          <ArrowLeft className="size-4" />
          {t('sessionChair.backToQueue')}
        </Link>
        <p className="text-xs font-extrabold uppercase tracking-wide text-[#8b909a]">
          {item.publicId ?? '—'} · {statusLabel}
          {item.score !== null ? ` · ${item.score}/10` : ''}
        </p>
      </div>

      <header className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5">
        <h1 className="text-xl font-extrabold text-[#1c2744] sm:text-2xl">{item.title}</h1>
        <p className="mt-1 text-sm font-semibold text-[#5c6578]">{item.conferenceName}</p>
        <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-xs font-extrabold text-[#8b909a]">
              {t('sessionChair.talkLanguage')}
            </dt>
            <dd className="mt-1.5">
              <select
                className="w-full rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-3 py-2 text-sm font-semibold text-[#1c2744]"
                value={item.presentationLanguage ?? ''}
                onChange={(event) => {
                  const value = event.target.value as 'FR' | 'AR' | 'EN';
                  if (value) {
                    void saveLanguage(value);
                  }
                }}
              >
                <option value="">{t('sessionChair.talkLanguageUnset')}</option>
                {talkLanguages.map((lang) => (
                  <option key={lang.value} value={lang.value}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[#8b909a]">
                {t('sessionChair.talkLanguageHint')}
              </p>
            </dd>
          </div>
          {item.schedule ? (
            <>
              <div>
                <dt className="text-xs font-extrabold text-[#8b909a]">
                  {t('sessionChair.slotSession')}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-[#1c2744]">
                  {item.schedule.sessionTitle}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-extrabold text-[#8b909a]">
                  {t('sessionChair.slotRoom')}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-[#1c2744]">
                  {item.schedule.roomName}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-extrabold text-[#8b909a]">
                  {t('sessionChair.slotWhen')}
                </dt>
                <dd className="mt-1 text-sm font-semibold text-[#1c2744]">
                  {new Date(item.schedule.startsAt).toLocaleString(i18n.language)} –{' '}
                  {new Date(item.schedule.endsAt).toLocaleTimeString(i18n.language, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  <span className="mt-0.5 block text-xs font-bold text-[#8b909a]">
                    {item.schedule.modality === 'ONLINE'
                      ? t('dossier.modalityOnline')
                      : t('dossier.modalityInPerson')}
                  </span>
                </dd>
              </div>
            </>
          ) : (
            <div className="sm:col-span-1 lg:col-span-3">
              <p className="mt-1 text-sm text-[#8b909a]">
                {t('dossier.waitingScheduleHint')}
              </p>
            </div>
          )}
        </dl>
      </header>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <section className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5">
          <h2 className="text-base font-extrabold text-[#1c2744]">{t('dossier.slides')}</h2>
          <p className="mt-1 text-sm text-[#5c6578]">{t('sessionChair.slidesHint')}</p>
          <div className="mt-4">
            {item.slides ? (
              <PaperFileThumb paperId={item.paperId} file={item.slides} />
            ) : (
              <p className="rounded-xl border border-dashed border-[#d8dce6] bg-[#f6f7fb] px-4 py-6 text-sm text-[#8b909a]">
                {t('sessionChair.noSlides')}
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-[#e4e7ee] bg-white p-4 sm:p-5">
          {item.schedule ? (
            <>
              <h2 className="text-base font-extrabold text-[#1c2744]">
                {item.presented
                  ? t('sessionChair.editAssessment')
                  : t('dossier.chairFollowUp')}
              </h2>
              <p className="mt-1 text-sm text-[#5c6578]">
                {item.presented
                  ? t('sessionChair.editHint')
                  : item.absent
                    ? t('sessionChair.absentHint')
                    : t('dossier.chairFollowUpHint')}
              </p>
              <form
                className="mt-4 grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const form = event.currentTarget;
                  const submitter = (event.nativeEvent as SubmitEvent)
                    .submitter as HTMLButtonElement | null;
                  const chosen = (submitter?.dataset.intent ?? 'presented') as
                    | 'presented'
                    | 'absent'
                    | 'save';
                  void assess(
                    chosen === 'save' ? 'presented' : chosen,
                    new FormData(form),
                  );
                }}
              >
                <label className="text-sm font-bold text-[#5c6578]">
                  {t('workflow.presentationScore')}
                  <input
                    name="score"
                    type="number"
                    min={1}
                    max={10}
                    defaultValue={item.score ?? ''}
                    className="mt-1.5 block w-28 rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2.5 text-sm"
                  />
                </label>
                <label className="text-sm font-bold text-[#5c6578]">
                  {t('dossier.chairRemarks')}
                  <textarea
                    name="comment"
                    className={`${field} mt-1.5 min-h-32`}
                    placeholder={t('dossier.chairRemarksPlaceholder')}
                    defaultValue={item.comment ?? ''}
                    required
                  />
                </label>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="submit"
                    data-intent={item.presented ? 'save' : 'presented'}
                  >
                    {item.presented
                      ? t('sessionChair.saveAssessment')
                      : t('dossier.markPresented')}
                  </Button>
                  {!item.presented ? (
                    <Button type="submit" variant="secondary" data-intent="absent">
                      {t('sessionChair.markAbsent')}
                    </Button>
                  ) : null}
                </div>
              </form>
            </>
          ) : (
            <>
              <h2 className="text-base font-extrabold text-[#1c2744]">
                {t('dossier.chairFollowUp')}
              </h2>
              <p className="mt-2 text-sm text-[#8b909a]">
                {t('dossier.waitingScheduleHint')}
              </p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
