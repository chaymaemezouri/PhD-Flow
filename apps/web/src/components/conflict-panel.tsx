import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useFeedback } from '@/features/feedback/feedback';
import { apiErrorMessage, apiFetch } from '@/services/api';

type ConflictRow = {
  id: string;
  userId: string;
  paperId: string | null;
  authorEmail: string | null;
  reason: string;
};

type PersonOption = { userId: string; firstName: string; lastName: string; email?: string };
type PaperOption = { id: string; title: string; publicId: string | null };

export function ConflictPanel({ conferenceId }: { conferenceId: string }) {
  const { t } = useTranslation();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState('');
  const [paperId, setPaperId] = useState('');
  const [authorEmail, setAuthorEmail] = useState('');
  const [reason, setReason] = useState('');

  const conflicts = useQuery({
    queryKey: ['conflicts', conferenceId],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${conferenceId}/conflicts`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<ConflictRow[]>;
    },
  });
  const reviewers = useQuery({
    queryKey: ['reviewers', conferenceId],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${conferenceId}/reviewers`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<PersonOption[]>;
    },
  });
  const papers = useQuery({
    queryKey: ['conference-papers', conferenceId],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${conferenceId}/papers`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<PaperOption[]>;
    },
  });

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!userId || (!paperId && !authorEmail.trim())) {
      feedback.error(t('common.error'));
      return;
    }
    const response = await apiFetch(`/api/v1/conferences/${conferenceId}/conflicts`, {
      method: 'POST',
      body: JSON.stringify({
        userId,
        paperId: paperId || null,
        authorEmail: authorEmail.trim() || null,
        reason: reason.trim(),
      }),
    });
    if (!response.ok) {
      feedback.error(await apiErrorMessage(response));
      return;
    }
    feedback.success(t('conflicts.done'));
    setPaperId('');
    setAuthorEmail('');
    setReason('');
    await queryClient.invalidateQueries({ queryKey: ['conflicts', conferenceId] });
  }

  const people = reviewers.data ?? [];
  const nameOf = (id: string) => {
    const person = people.find((item) => item.userId === id);
    return person
      ? `${person.firstName} ${person.lastName}`
      : id.slice(0, 8);
  };

  return (
    <section className="rounded-[28px] border border-[#e4e7ee] bg-gradient-to-b from-white to-[#fffaf5] p-4 sm:p-5">
      <h2 className="text-lg font-extrabold text-[#1c2744]">{t('conflicts.title')}</h2>
      <p className="mt-1 text-sm text-[#5c6578]">{t('conflicts.hint')}</p>
      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={(event) => void onSubmit(event)}>
        <label className="text-sm font-bold text-[#1c2744]">
          {t('conflicts.reviewer')}
          <select
            required
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            className="mt-1.5 block min-h-10 w-full rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-sm font-semibold"
          >
            <option value="">—</option>
            {people.map((item) => (
              <option key={item.userId} value={item.userId}>
                {item.firstName} {item.lastName}
                {item.email ? ` · ${item.email}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold text-[#1c2744]">
          {t('conflicts.paper')}
          <select
            value={paperId}
            onChange={(event) => setPaperId(event.target.value)}
            className="mt-1.5 block min-h-10 w-full rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-sm font-semibold"
          >
            <option value="">—</option>
            {(papers.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.publicId ? `${item.publicId} · ` : ''}
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold text-[#1c2744]">
          {t('conflicts.authorEmail')}
          <Input
            type="email"
            value={authorEmail}
            onChange={(event) => setAuthorEmail(event.target.value)}
            className="mt-1.5"
          />
        </label>
        <label className="text-sm font-bold text-[#1c2744]">
          {t('conflicts.reason')}
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1.5"
          />
        </label>
        <div className="sm:col-span-2">
          <Button type="submit">{t('conflicts.add')}</Button>
        </div>
      </form>
      {conflicts.isPending ? (
        <p className="mt-4 text-sm text-[#8b909a]">{t('common.loading')}</p>
      ) : (conflicts.data?.length ?? 0) === 0 ? (
        <p className="mt-4 text-sm text-[#8b909a]">{t('conflicts.empty')}</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {conflicts.data!.map((row) => (
            <li
              key={row.id}
              className="rounded-2xl bg-white px-4 py-3 text-sm ring-1 ring-[#eef1f8]"
            >
              <p className="font-extrabold text-[#1c2744]">{nameOf(row.userId)}</p>
              <p className="mt-1 text-xs font-semibold text-[#5c6578]">
                {[
                  row.authorEmail,
                  row.paperId
                    ? papers.data?.find((item) => item.id === row.paperId)?.title
                    : null,
                  row.reason || null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
