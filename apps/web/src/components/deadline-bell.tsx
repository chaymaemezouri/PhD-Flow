import { useQuery } from '@tanstack/react-query';
import { Bell, CalendarClock, Inbox, Mail } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { pickConference } from '@/features/navigation/pick-conference';
import { cn } from '@/lib/utils';
import { apiErrorMessage, apiFetch } from '@/services/api';

const SEEN_KEY = 'sf.notifications.seenAt';
const URGENT_MS = 7 * 24 * 60 * 60 * 1000;

function readSeenAt() {
  const raw = localStorage.getItem(SEEN_KEY);
  const value = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(value) ? value : 0;
}

function writeSeenAt(iso: string) {
  localStorage.setItem(SEEN_KEY, iso);
}

function isUrgentDeadline(dueAt: string, now: number) {
  const due = Date.parse(dueAt);
  if (!Number.isFinite(due)) {
    return false;
  }
  return due <= now + URGENT_MS;
}

export function DeadlineBell() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [seenAt, setSeenAt] = useState(readSeenAt);

  const memberships = useQuery({
    queryKey: ['conferences'],
    queryFn: async () => {
      const response = await apiFetch('/api/v1/conferences');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<
        {
          id: string;
          name: string;
          role: string;
          membershipStatus: string;
          status: string;
          startsOn: string | null;
        }[]
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
      return response.json() as Promise<
        { id: string; subject: string; body: string; createdAt: string }[]
      >;
    },
    refetchInterval: 60_000,
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

  const now = Date.now();
  const inbox = messages.data ?? [];
  const deadlines = useMemo(() => {
    const rows = [...(detail.data?.deadlines ?? [])];
    rows.sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
    return rows;
  }, [detail.data?.deadlines]);

  const unreadMessages = inbox.filter(
    (item) => Date.parse(item.createdAt) > seenAt,
  );
  const urgentDeadlines = deadlines.filter((item) =>
    isUrgentDeadline(item.dueAt, now),
  );
  const badgeCount = unreadMessages.length + urgentDeadlines.length;
  const hasAlert = badgeCount > 0;

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  function closePanel() {
    const stamp = new Date().toISOString();
    writeSeenAt(stamp);
    setSeenAt(Date.parse(stamp));
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          'relative grid size-11 place-items-center rounded-2xl border transition lg:size-10 lg:rounded-xl',
          open
            ? 'border-[#3d4fd4]/35 bg-[#eef2ff] text-[#3d4fd4]'
            : 'border-[#e4e7ee] bg-white text-[#5c6578] hover:border-[#c5cad6] hover:bg-[#f7f8fb] hover:text-[#3d4fd4]',
        )}
        aria-label={t('top.notifications')}
        aria-expanded={open}
        onClick={() => (open ? closePanel() : setOpen(true))}
      >
        <Bell className={cn('size-[1.15rem]', hasAlert && 'text-[#3d4fd4]')} />
        {hasAlert ? (
          <span className="absolute -top-1 -right-1 grid min-w-[1.15rem] place-items-center rounded-full bg-[#e5484d] px-1 py-0.5 text-[10px] leading-none font-extrabold text-white shadow-[0_0_0_2px_#fff]">
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        ) : null}
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-20 cursor-default bg-[#1c2744]/10 backdrop-blur-[1px]"
            aria-label={t('nav.close')}
            onClick={closePanel}
          />
          <div className="fixed inset-x-3 top-16 z-30 overflow-hidden rounded-2xl border border-[#e4e7ee] bg-white shadow-[0_18px_48px_rgba(28,39,68,0.16)] sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem] sm:max-w-[calc(100vw-1.5rem)]">
            <div className="flex items-center justify-between border-b border-[#eef1f8] bg-gradient-to-r from-[#f7f8ff] to-white px-4 py-3">
              <div>
                <p className="text-sm font-extrabold text-[#1c2744]">
                  {t('top.notifications')}
                </p>
                <p className="mt-0.5 text-xs font-semibold text-[#8b909a]">
                  {hasAlert
                    ? t('top.notificationsUnread', { count: badgeCount })
                    : t('top.notificationsClear')}
                </p>
              </div>
              <span
                className={cn(
                  'grid size-9 place-items-center rounded-xl',
                  hasAlert ? 'bg-[#ffe8e8] text-[#e5484d]' : 'bg-[#eef2ff] text-[#3d4fd4]',
                )}
              >
                <Bell className="size-4" />
              </span>
            </div>

            <div className="max-h-[min(70vh,26rem)] overflow-y-auto">
              <section className="border-b border-[#eef1f8] px-3 py-3">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <Mail className="size-3.5 text-[#3d4fd4]" />
                  <p className="text-xs font-extrabold tracking-wide text-[#5c6578] uppercase">
                    {t('workflow.messages')}
                  </p>
                </div>
                {inbox.length > 0 ? (
                  <ul className="grid gap-1">
                    {inbox.slice(0, 8).map((item) => {
                      const unread = Date.parse(item.createdAt) > seenAt;
                      return (
                        <li
                          key={item.id}
                          className={cn(
                            'rounded-xl px-3 py-2.5',
                            unread ? 'bg-[#eef2ff]' : 'hover:bg-[#f7f8fb]',
                          )}
                        >
                          <div className="flex items-start gap-2">
                            {unread ? (
                              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#3d4fd4]" />
                            ) : (
                              <span className="mt-1.5 size-1.5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="block truncate text-sm font-bold text-[#1c2744]">
                                {item.subject || item.body.slice(0, 80)}
                              </span>
                              {item.subject && item.body ? (
                                <span className="mt-0.5 line-clamp-2 block text-xs text-[#5c6578]">
                                  {item.body}
                                </span>
                              ) : null}
                              <span className="mt-1 block text-[11px] font-semibold text-[#8b909a]">
                                {new Date(item.createdAt).toLocaleString(i18n.language, {
                                  dateStyle: 'medium',
                                  timeStyle: 'short',
                                })}
                              </span>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="flex items-start gap-3 rounded-xl bg-[#f7f8fb] px-3 py-3">
                    <Inbox className="mt-0.5 size-4 shrink-0 text-[#8b909a]" />
                    <p className="text-sm font-semibold text-[#8b909a]">
                      {t('workflow.noMessages')}
                    </p>
                  </div>
                )}
              </section>

              <section className="px-3 py-3">
                <div className="mb-2 flex items-center gap-2 px-1">
                  <CalendarClock className="size-3.5 text-[#3d4fd4]" />
                  <p className="text-xs font-extrabold tracking-wide text-[#5c6578] uppercase">
                    {t('conferences.deadlines')}
                  </p>
                </div>
                {!conference?.id ? (
                  <p className="px-1 py-2 text-sm font-semibold text-[#8b909a]">
                    {t('top.notificationsNoConference')}
                  </p>
                ) : deadlines.length === 0 ? (
                  <div className="flex items-start gap-3 rounded-xl bg-[#f7f8fb] px-3 py-3">
                    <CalendarClock className="mt-0.5 size-4 shrink-0 text-[#8b909a]" />
                    <p className="text-sm font-semibold text-[#8b909a]">
                      {detail.isPending
                        ? t('common.loading')
                        : t('conferences.noDeadlines')}
                    </p>
                  </div>
                ) : (
                  <ul className="grid gap-1">
                    {deadlines.map((deadline) => {
                      const due = Date.parse(deadline.dueAt);
                      const overdue = due < now;
                      const urgent = isUrgentDeadline(deadline.dueAt, now);
                      return (
                        <li key={deadline.id}>
                          <Link
                            to={`/workspace/conferences/${conference.id}`}
                            className={cn(
                              'block rounded-xl px-3 py-2.5 text-[#1c2744] no-underline transition hover:bg-[#f7f8fb]',
                              overdue && 'bg-[#fff1f0]',
                              !overdue && urgent && 'bg-[#fff7eb]',
                            )}
                            onClick={closePanel}
                          >
                            <span className="block text-sm font-bold">
                              {deadline.label.trim() ||
                                t(`conferences.kinds.${deadline.kind}`, {
                                  defaultValue: deadline.kind,
                                })}
                            </span>
                            <span
                              className={cn(
                                'mt-0.5 block text-xs font-semibold',
                                overdue
                                  ? 'text-[#e5484d]'
                                  : urgent
                                    ? 'text-[#9a5b00]'
                                    : 'text-[#5c6578]',
                              )}
                            >
                              {overdue
                                ? t('top.deadlineOverdue')
                                : urgent
                                  ? t('top.deadlineSoon')
                                  : null}
                              {overdue || urgent ? ' · ' : null}
                              {new Date(deadline.dueAt).toLocaleString(i18n.language, {
                                dateStyle: 'medium',
                                timeStyle: 'short',
                              })}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
