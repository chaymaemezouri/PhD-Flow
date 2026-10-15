import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { pickConference } from '@/features/navigation/pick-conference';
import { apiErrorMessage, apiFetch } from '@/services/api';

export function DeadlineBell() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const memberships = useQuery({
    queryKey: ['conferences'],
    queryFn: async () => {
      const response = await apiFetch('/api/v1/conferences');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<
        { id: string; name: string; role: string; membershipStatus: string; status: string; startsOn: string | null }[]
      >;
    },
  });
  const conference = pickConference(memberships.data, null);
  const messages = useQuery({
    queryKey: ['messages'],
    queryFn: async () => {
      const response = await apiFetch('/api/v1/auth/messages');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<{ id: string; subject: string; body: string; createdAt: string }[]>;
    },
  });
  const detail = useQuery({
    queryKey: ['conference', conference?.id],
    queryFn: async () => {
      const response = await apiFetch(`/api/v1/conferences/${conference!.id}`);
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<{
        deadlines: { id: string; kind: string; label: string; dueAt: string }[];
      }>;
    },
    enabled: Boolean(conference?.id),
  });
  const deadlines = detail.data?.deadlines ?? [];

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="relative">
      <button
        type="button"
        className="relative grid size-9 place-items-center rounded-full bg-white text-[#3d4fd4]"
        aria-label={t('top.notifications')}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Bell className="size-4" />
        {(deadlines.length > 0 || (messages.data?.length ?? 0) > 0) ? (
          <span className="absolute -top-1 -right-1 grid min-w-4 place-items-center rounded-full bg-[#5d74ff] px-1 text-[10px] font-bold text-white">
            {deadlines.length + (messages.data?.length ?? 0)}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-20 cursor-default"
            aria-label={t('nav.close')}
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-1.5rem)] rounded-2xl border border-[#e4e7ee] bg-white p-3 shadow-[0_12px_32px_rgba(28,36,48,0.12)]">
            <p className="px-2 text-sm font-extrabold">{t('workflow.messages')}</p>
            {messages.data && messages.data.length > 0 ? (
              <ul className="mt-1 max-h-48 overflow-y-auto">
                {messages.data.map((item) => (
                  <li key={item.id} className="rounded-xl px-2 py-2">
                    <span className="block text-sm font-bold">{item.subject || item.body.slice(0, 80)}</span>
                    <span className="mt-1 block text-xs text-[#5c6578]">
                      {new Date(item.createdAt).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-2 py-2 text-sm text-[#8b909a]">{t('workflow.noMessages')}</p>
            )}
            <p className="mt-3 px-2 text-sm font-extrabold">{t('conferences.deadlines')}</p>
            {deadlines.length === 0 ? (
              <p className="px-2 py-3 text-sm text-[#8b909a]">
                {detail.isPending ? t('common.loading') : t('conferences.noDeadlines')}
              </p>
            ) : (
              <ul className="mt-1">
                {deadlines.map((deadline) => (
                  <li key={deadline.id}>
                    <Link
                      to={`/workspace/conferences/${conference!.id}`}
                      className="block rounded-xl px-2 py-2 text-[#1c2744] no-underline hover:bg-[#f7f8fb]"
                      onClick={() => setOpen(false)}
                    >
                      <span className="block text-sm font-bold">
                        {deadline.label.trim() ||
                          t(`conferences.kinds.${deadline.kind}`, { defaultValue: deadline.kind })}
                      </span>
                      <span className="block text-xs text-[#5c6578]">
                        {new Date(deadline.dueAt).toLocaleString(i18n.language, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
