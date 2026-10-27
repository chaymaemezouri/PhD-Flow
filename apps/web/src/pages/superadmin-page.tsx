import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation } from 'react-router';
import { AssignmentField } from '@/components/assignment-picker';
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
import { apiErrorMessage, apiFetch } from '@/services/api';

interface AdminAccount {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  loginPassword: string | null;
  conferences: { id: string; name: string }[];
}

interface ConferenceRow {
  id: string;
  name: string;
  shortName: string;
  city: string | null;
  country: string | null;
  status: string;
  visibility: string;
  startsOn: string | null;
  endsOn: string | null;
  paperCount: number;
  memberCount: number;
  chair: { id: string; email: string; firstName: string; lastName: string } | null;
}

interface PlatformUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  academicTitle: string;
  emailVerified: boolean;
  disabled: boolean;
  kind: 'ADMIN' | 'REVIEWER' | 'RESEARCHER';
  memberships: {
    conferenceId: string;
    conferenceName: string;
    shortName: string;
    role: string;
  }[];
  createdAt: string;
}

interface AuditRow {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: unknown;
  createdAt: string;
  actor: { id: string; email: string; name: string } | null;
}

interface SessionRow {
  id: string;
  userId: string;
  email: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  unlockedConferenceId: string | null;
}

interface PlatformStatus {
  accounts: number;
  conferences: number;
  papers: number;
  reviews: number;
  admins: number;
  published: number;
  drafts: number;
  archived: number;
  verified: number;
  submitted: number;
  activeSessions: number;
}

type Section = 'overview' | 'admins' | 'conferences' | 'users' | 'audit' | 'sessions';

const SECTIONS = new Set<Section>([
  'overview',
  'admins',
  'conferences',
  'users',
  'audit',
  'sessions',
]);

const field =
  'mt-1.5 block w-full rounded-xl border border-[#c5cad6] bg-white px-3.5 py-2.5 text-sm font-semibold text-[#1c2744] shadow-[inset_0_1px_2px_rgba(28,39,68,0.04)] outline-none placeholder:font-medium placeholder:text-[#8b909a] focus:border-[#3d4fd4] focus:ring-2 focus:ring-[#3d4fd4]/20';

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(','));
  const blob = new Blob([`\uFEFF${lines.join('\n')}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function pdfSafe(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function downloadPdf(
  filename: string,
  title: string,
  headers: string[],
  rows: string[][],
) {
  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 40;
  const lineHeight = 12;
  const top = pageHeight - margin;
  const textLines = [
    title,
    '',
    headers.join(' | '),
    '-'.repeat(90),
    ...rows.map((row) => row.map((cell) => String(cell)).join(' | ')),
  ];

  const linesPerPage = Math.floor((pageHeight - margin * 2 - 24) / lineHeight);
  const pages: string[][] = [];
  for (let i = 0; i < textLines.length; i += linesPerPage) {
    pages.push(textLines.slice(i, i + linesPerPage));
  }
  if (pages.length === 0) {
    pages.push([title]);
  }

  const fontObjectNumber = 3 + pages.length * 2;
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${3 + index * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
  ];

  pages.forEach((pageLines, pageIndex) => {
    const contentLines = ['BT', '/F1 10 Tf'];
    pageLines.forEach((line, lineIndex) => {
      const y = top - lineIndex * lineHeight;
      contentLines.push(`1 0 0 1 ${margin} ${y} Tm (${pdfSafe(line.slice(0, 110))}) Tj`);
    });
    contentLines.push(
      `/F1 8 Tf`,
      `1 0 0 1 ${margin} ${margin - 10} Tm (${pdfSafe(`Page ${pageIndex + 1} / ${pages.length}`)}) Tj`,
      'ET',
    );
    const content = contentLines.join('\n');
    const pageObject = 3 + pageIndex * 2;
    const contentObject = pageObject + 1;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentObject} 0 R /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> >>`,
    );
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const encoder = new TextEncoder();
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(encoder.encode(pdf).length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefStart = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefStart}\n%%EOF`;

  const blob = new Blob([pdf], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function PasswordLine({
  label,
  value,
  missing,
}: {
  label: string;
  value: string | null;
  missing: string;
}) {
  return (
    <p className="mt-2 text-sm">
      <span className="font-bold text-[#5c6578]">{label}</span>
      <span className="mt-1.5 block rounded-xl border border-[#c5cad6] bg-white px-3.5 py-2.5 font-extrabold tracking-wide text-[#3d4fd4] shadow-[inset_0_1px_2px_rgba(28,39,68,0.04)]">
        {value || missing}
      </span>
    </p>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string | number;
  hint: string;
  tone: 'blue' | 'green' | 'amber' | 'slate';
}) {
  const wash = {
    blue: 'bg-[#5d74ff]/10 text-[#3d4fd4]',
    green: 'bg-[#2fbf71]/12 text-[#1c9a57]',
    amber: 'bg-[#f0a04b]/14 text-[#9a6410]',
    slate: 'bg-[#eef0f5] text-[#5c6578]',
  }[tone];
  return (
    <div className={`rounded-[24px] px-4 py-4 ${wash}`}>
      <p className="text-xs font-bold uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-extrabold sm:mt-2 sm:text-3xl">{value}</p>
      <p className="mt-1 text-xs font-bold opacity-70">{hint}</p>
    </div>
  );
}

export function SuperadminPage() {
  const { t } = useTranslation();
  const account = useCurrentUser();
  const queryClient = useQueryClient();
  const location = useLocation();
  const sectionParam =
    location.pathname.replace(/^\/workspace\/system\/?/, '').split('/')[0] || '';
  const section: Section = SECTIONS.has(sectionParam as Section)
    ? (sectionParam as Section)
    : 'overview';
  const sectionValid = sectionParam === '' || SECTIONS.has(sectionParam as Section);
  const feedback = useFeedback();
  const [search, setSearch] = useState('');
  const [conferenceFilter, setConferenceFilter] = useState('ALL');
  const [conferenceOpen, setConferenceOpen] = useState(false);
  const [createAdminOpen, setCreateAdminOpen] = useState(false);
  const [createConferenceOpen, setCreateConferenceOpen] = useState(false);
  const [newChairOnCreate, setNewChairOnCreate] = useState(false);
  const [chairUserId, setChairUserId] = useState('');
  const [managingAdminId, setManagingAdminId] = useState<string | null>(null);
  const [managingConferenceId, setManagingConferenceId] = useState<string | null>(null);
  const [assignChairId, setAssignChairId] = useState('');
  const needle = search.trim().toLowerCase();
  const enabled = account.data?.platformRole === 'SYSTEM_ADMIN';

  useEffect(() => {
    setSearch('');
    setConferenceFilter('ALL');
    setConferenceOpen(false);
    setCreateAdminOpen(false);
    setCreateConferenceOpen(false);
    setNewChairOnCreate(false);
    setChairUserId('');
    setManagingAdminId(null);
    setManagingConferenceId(null);
  }, [section]);

  const admins = useQuery({
    queryKey: ['system-admins'],
    enabled,
    queryFn: async () => {
      const response = await apiFetch('/api/v1/system/admins');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<AdminAccount[]>;
    },
  });
  const conferences = useQuery({
    queryKey: ['system-conferences'],
    enabled,
    queryFn: async () => {
      const response = await apiFetch('/api/v1/system/conferences');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<ConferenceRow[]>;
    },
  });
  const users = useQuery({
    queryKey: ['system-users'],
    enabled,
    queryFn: async () => {
      const response = await apiFetch('/api/v1/system/users');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<PlatformUser[]>;
    },
  });
  const status = useQuery({
    queryKey: ['system-status'],
    enabled,
    queryFn: async () => {
      const response = await apiFetch('/api/v1/system/status');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<PlatformStatus>;
    },
  });
  const audit = useQuery({
    queryKey: ['system-audit'],
    enabled: enabled && (section === 'audit' || section === 'overview'),
    queryFn: async () => {
      const response = await apiFetch('/api/v1/system/audit');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<AuditRow[]>;
    },
  });
  const sessions = useQuery({
    queryKey: ['system-sessions'],
    enabled: enabled && (section === 'sessions' || section === 'overview'),
    queryFn: async () => {
      const response = await apiFetch('/api/v1/system/sessions');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<SessionRow[]>;
    },
  });

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['system-admins'] }),
      queryClient.invalidateQueries({ queryKey: ['system-conferences'] }),
      queryClient.invalidateQueries({ queryKey: ['system-users'] }),
      queryClient.invalidateQueries({ queryKey: ['system-status'] }),
      queryClient.invalidateQueries({ queryKey: ['system-audit'] }),
      queryClient.invalidateQueries({ queryKey: ['system-sessions'] }),
      queryClient.invalidateQueries({ queryKey: ['conferences'] }),
    ]);
  }

  async function postAction(
    path: string,
    okMessage: string,
    method: 'POST' | 'DELETE' = 'POST',
  ) {
    const response = await apiFetch(path, { method });
    if (!response.ok) {
      feedback.error(await apiErrorMessage(response));
      return;
    }
    feedback.success(okMessage);
    await refreshAll();
  }

  const createAdmin = useMutation({
    mutationFn: async (body: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
    }) => {
      const response = await apiFetch('/api/v1/system/admins', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<AdminAccount>;
    },
    onSuccess: async (created) => {
      setCreateAdminOpen(false);
      feedback.success(t('superadmin.adminCreated', { email: created.email }));
      await refreshAll();
    },
    onError: (error: Error) => feedback.error(error.message),
  });

  const createdChairEmail = useRef<string | null>(null);
  const createConference = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const response = await apiFetch('/api/v1/conferences', {
        method: 'POST',
        body: JSON.stringify({
          name: body.name,
          shortName: body.shortName,
          city: body.city,
          country: body.country,
          description: body.description,
          startsOn: body.startsOn || null,
          endsOn: body.endsOn || null,
          chairUserId: body.chairUserId,
        }),
      });
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
    },
    onSuccess: async () => {
      setCreateConferenceOpen(false);
      setNewChairOnCreate(false);
      const email = createdChairEmail.current;
      createdChairEmail.current = null;
      feedback.success(
        email
          ? t('superadmin.conferenceCreatedWithAdmin', { email })
          : t('superadmin.conferenceCreated'),
      );
      await refreshAll();
    },
    onError: (error: Error) => {
      createdChairEmail.current = null;
      feedback.error(error.message);
      void refreshAll();
    },
  });

  const filteredAdmins = useMemo(
    () =>
      admins.data?.filter((item) => {
        if (!needle) {
          return true;
        }
        return `${item.firstName} ${item.lastName} ${item.email}`
          .toLowerCase()
          .includes(needle);
      }) ?? [],
    [admins.data, needle],
  );

  const filteredConferences = useMemo(
    () =>
      conferences.data?.filter((item) => {
        if (conferenceFilter !== 'ALL' && item.id !== conferenceFilter) {
          return false;
        }
        if (!needle) {
          return true;
        }
        return `${item.name} ${item.shortName} ${item.city ?? ''} ${item.chair?.email ?? ''}`
          .toLowerCase()
          .includes(needle);
      }) ?? [],
    [conferences.data, needle, conferenceFilter],
  );

  const conferenceCounts = useMemo(() => {
    const all = conferences.data ?? [];
    return {
      total: all.length,
      published: all.filter((item) => item.status === 'PUBLISHED').length,
      draft: all.filter((item) => item.status === 'DRAFT').length,
      archived: all.filter((item) => item.status === 'ARCHIVED').length,
    };
  }, [conferences.data]);

  const filteredUsers = useMemo(
    () =>
      users.data?.filter((item) => {
        if (!needle) {
          return true;
        }
        return `${item.firstName} ${item.lastName} ${item.email} ${item.kind}`
          .toLowerCase()
          .includes(needle);
      }) ?? [],
    [users.data, needle],
  );

  const filteredAudit = useMemo(
    () =>
      audit.data?.filter((item) => {
        if (!needle) {
          return true;
        }
        return `${item.action} ${item.resourceType} ${item.actor?.email ?? ''} ${item.actor?.name ?? ''}`
          .toLowerCase()
          .includes(needle);
      }) ?? [],
    [audit.data, needle],
  );

  const filteredSessions = useMemo(
    () =>
      sessions.data?.filter((item) => {
        if (!needle) {
          return true;
        }
        return `${item.name} ${item.email}`.toLowerCase().includes(needle);
      }) ?? [],
    [sessions.data, needle],
  );

  if (account.isPending) {
    return <p className="text-sm text-[#8b909a]">{t('common.loading')}</p>;
  }
  if (account.data?.platformRole !== 'SYSTEM_ADMIN') {
    return <Navigate to="/workspace" replace />;
  }
  if (!sectionValid) {
    return <Navigate to="/workspace/system" replace />;
  }

  const managingAdmin = admins.data?.find((item) => item.id === managingAdminId) ?? null;
  const managingConference =
    conferences.data?.find((item) => item.id === managingConferenceId) ?? null;

  const titles: Record<Section, string> = {
    overview: t('superadmin.title'),
    admins: t('superadmin.tabAdmins'),
    conferences: t('superadmin.tabConferences'),
    users: t('superadmin.tabUsers'),
    audit: t('superadmin.tabAudit'),
    sessions: t('superadmin.tabSessions'),
  };
  const intros: Record<Section, string> = {
    overview: t('superadmin.intro'),
    admins: t('superadmin.sectionIntroAdmins'),
    conferences: t('superadmin.sectionIntroConferences'),
    users: t('superadmin.sectionIntroUsers'),
    audit: t('superadmin.sectionIntroAudit'),
    sessions: t('superadmin.sectionIntroSessions'),
  };

  return (
    <div className="space-y-6">
      <header className="border-b border-[#e6e8ec] pb-4 sm:pb-5">
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#3d4fd4]">
          {t('superadmin.sidebarLabel')}
        </p>
        <h1 className="mt-2 text-xl font-extrabold text-[#1c2744] sm:text-2xl lg:text-3xl">
          {titles[section]}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#5c6578]">
          {intros[section]}
        </p>
      </header>

      {section !== 'overview' && section !== 'conferences' ? (
        <label className="block w-full max-w-xl rounded-2xl border border-[#c5cad6] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(28,39,68,0.04)]">
          <span className="text-xs font-extrabold uppercase tracking-wide text-[#5c6578]">
            {t('superadmin.search')}
          </span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('superadmin.searchHint')}
            className="mt-1.5 block w-full border-0 bg-transparent px-0 py-1.5 text-base font-semibold text-[#1c2744] outline-none placeholder:font-medium placeholder:text-[#8b909a] sm:text-sm"
          />
        </label>
      ) : null}

      {section === 'overview' ? (
        <section className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric
              tone="blue"
              label={t('superadmin.metricAccounts')}
              value={status.data?.accounts ?? '—'}
              hint={t('superadmin.metricVerified', { count: status.data?.verified ?? 0 })}
            />
            <Metric
              tone="green"
              label={t('superadmin.metricConferences')}
              value={status.data?.conferences ?? '—'}
              hint={t('superadmin.metricPublished', {
                count: status.data?.published ?? 0,
              })}
            />
            <Metric
              tone="amber"
              label={t('superadmin.metricPapers')}
              value={status.data?.papers ?? '—'}
              hint={t('superadmin.metricSubmitted', {
                count: status.data?.submitted ?? 0,
              })}
            />
            <Metric
              tone="slate"
              label={t('superadmin.metricReviews')}
              value={status.data?.reviews ?? '—'}
              hint={t('superadmin.metricAdmins', { count: status.data?.admins ?? 0 })}
            />
            <Metric
              tone="blue"
              label={t('superadmin.metricSessions')}
              value={status.data?.activeSessions ?? '—'}
              hint={t('superadmin.metricSessionsHint')}
            />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
            <div className="rounded-[28px] border border-[#e4e7ee] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-extrabold text-[#1c2744]">
                  {t('superadmin.recentConferences')}
                </h2>
                <Link
                  to="/workspace/system/conferences"
                  className="text-sm font-extrabold text-[#3d4fd4] no-underline"
                >
                  {t('superadmin.openConferences')}
                </Link>
              </div>
              <ul className="mt-4 grid gap-2">
                {(conferences.data ?? []).slice(0, 6).map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#f6f7fb] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-extrabold text-[#1c2744]">{item.name}</p>
                      <p className="text-xs text-[#8b909a]">
                        {item.shortName}
                        {item.chair
                          ? ` · ${item.chair.firstName} ${item.chair.lastName}`
                          : ''}
                      </p>
                    </div>
                    <span className="text-xs font-extrabold text-[#5c6578]">
                      {t(`conferences.states.${item.status}`, {
                        defaultValue: item.status,
                      })}
                    </span>
                  </li>
                ))}
                {(conferences.data?.length ?? 0) === 0 ? (
                  <p className="text-sm text-[#5c6578]">
                    {t('superadmin.noConferences')}
                  </p>
                ) : null}
              </ul>
            </div>

            <div className="space-y-5">
              <div className="rounded-[28px] border border-[#e4e7ee] bg-white p-5">
                <h2 className="text-lg font-extrabold text-[#1c2744]">
                  {t('superadmin.quickLinks')}
                </h2>
                <ul className="mt-3 grid gap-1">
                  {(
                    [
                      [
                        'admins',
                        t('superadmin.tabAdmins'),
                        t('superadmin.overviewAdmins'),
                      ],
                      [
                        'conferences',
                        t('superadmin.tabConferences'),
                        t('superadmin.overviewConferences'),
                      ],
                      ['users', t('superadmin.tabUsers'), t('superadmin.overviewUsers')],
                      [
                        'sessions',
                        t('superadmin.tabSessions'),
                        t('superadmin.overviewSessions'),
                      ],
                      ['audit', t('superadmin.tabAudit'), t('superadmin.overviewAudit')],
                    ] as const
                  ).map(([path, title, body]) => (
                    <li key={path}>
                      <Link
                        to={`/workspace/system/${path}`}
                        className="block rounded-2xl px-3 py-3 no-underline transition hover:bg-[#f6f7fb]"
                      >
                        <span className="block text-sm font-extrabold text-[#1c2744]">
                          {title}
                        </span>
                        <span className="mt-0.5 block text-xs text-[#8b909a]">
                          {body}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-[28px] border border-[#e4e7ee] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-extrabold text-[#1c2744]">
                    {t('superadmin.recentAudit')}
                  </h2>
                  <Link
                    to="/workspace/system/audit"
                    className="text-sm font-extrabold text-[#3d4fd4] no-underline"
                  >
                    {t('superadmin.openAudit')}
                  </Link>
                </div>
                <ul className="mt-4 grid gap-2">
                  {(audit.data ?? []).slice(0, 5).map((row) => (
                    <li key={row.id} className="rounded-2xl bg-[#f6f7fb] px-3 py-2.5">
                      <p className="text-sm font-extrabold text-[#1c2744]">
                        {row.action}
                      </p>
                      <p className="mt-0.5 text-xs text-[#8b909a]">
                        {row.actor?.email ?? '—'} ·{' '}
                        {new Date(row.createdAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                  {(audit.data?.length ?? 0) === 0 ? (
                    <p className="text-sm text-[#5c6578]">{t('superadmin.noAudit')}</p>
                  ) : null}
                </ul>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {section === 'admins' ? (
        <section className="rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-[#1c2744]">
                {t('superadmin.admins')}
              </h2>
              <p className="mt-1 text-xs font-bold text-[#8b909a]">
                {filteredAdmins.length} / {admins.data?.length ?? 0}
              </p>
            </div>
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => setCreateAdminOpen(true)}
            >
              {t('superadmin.createAdmin')}
            </Button>
          </div>

          <Dialog open={createAdminOpen} onOpenChange={setCreateAdminOpen}>
            <DialogContent>
              <DialogTitle className="pr-8 text-xl font-extrabold text-[#1c2744]">
                {t('superadmin.createAdmin')}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-[#5c6578]">
                {t('superadmin.loginPasswordHint')}
              </DialogDescription>
              <form
                className="mt-5 grid gap-3 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void createAdmin.mutateAsync({
                    firstName: String(data.get('firstName') ?? ''),
                    lastName: String(data.get('lastName') ?? ''),
                    email: String(data.get('email') ?? ''),
                    password: String(data.get('password') ?? ''),
                  });
                }}
              >
                <label className="text-sm font-bold">
                  {t('auth.firstName')}
                  <input name="firstName" required className={field} />
                </label>
                <label className="text-sm font-bold">
                  {t('auth.lastName')}
                  <input name="lastName" required className={field} />
                </label>
                <label className="text-sm font-bold sm:col-span-2">
                  {t('auth.email')}
                  <input
                    name="email"
                    type="email"
                    required
                    autoComplete="off"
                    className={field}
                  />
                </label>
                <label className="text-sm font-bold sm:col-span-2">
                  {t('superadmin.loginPassword')}
                  <input
                    name="password"
                    type="text"
                    required
                    minLength={12}
                    autoComplete="off"
                    className={field}
                  />
                </label>
                <div className="sm:col-span-2">
                  <Button type="submit" disabled={createAdmin.isPending}>
                    {t('superadmin.createAdmin')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <div>
            {filteredAdmins.length === 0 ? (
              <p className="mt-4 text-sm text-[#5c6578]">{t('superadmin.noAdmins')}</p>
            ) : (
              <>
                <ul className="mt-4 grid gap-3 md:hidden">
                  {filteredAdmins.map((admin) => (
                    <li
                      key={admin.id}
                      className="rounded-2xl border border-[#d8dce6] bg-[#f6f7fb] px-4 py-3"
                    >
                      <p className="text-sm font-extrabold text-[#1c2744]">
                        {admin.firstName} {admin.lastName}
                      </p>
                      <p className="mt-0.5 break-all text-sm font-semibold text-[#5c6578]">
                        {admin.email}
                      </p>
                      <p className="mt-1 text-xs font-bold text-[#8b909a]">
                        {admin.conferences.length > 0
                          ? t('superadmin.adminConferenceCount', {
                              count: admin.conferences.length,
                            })
                          : t('superadmin.noConferenceYet')}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full border-[#c5cad6]"
                        onClick={() => setManagingAdminId(admin.id)}
                      >
                        {t('superadmin.manageAdmin')}
                      </Button>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[28rem] border-separate border-spacing-y-2 text-left">
                    <thead>
                      <tr className="text-xs font-extrabold uppercase tracking-wide text-[#8b909a]">
                        <th className="px-3 pb-1 font-extrabold">
                          {t('superadmin.colAdmin')}
                        </th>
                        <th className="px-3 pb-1 font-extrabold">{t('auth.email')}</th>
                        <th className="px-3 pb-1 text-right font-extrabold">
                          {t('superadmin.colActions')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAdmins.map((admin) => (
                        <tr key={admin.id} className="bg-[#f6f7fb]">
                          <td className="rounded-l-2xl px-3 py-3 align-middle">
                            <p className="text-sm font-extrabold text-[#1c2744]">
                              {admin.firstName} {admin.lastName}
                            </p>
                            <p className="mt-0.5 text-xs font-bold text-[#8b909a]">
                              {admin.conferences.length > 0
                                ? t('superadmin.adminConferenceCount', {
                                    count: admin.conferences.length,
                                  })
                                : t('superadmin.noConferenceYet')}
                            </p>
                          </td>
                          <td className="px-3 py-3 align-middle text-sm font-semibold text-[#5c6578]">
                            {admin.email}
                          </td>
                          <td className="rounded-r-2xl px-3 py-3 text-right align-middle">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-[#c5cad6]"
                              onClick={() => setManagingAdminId(admin.id)}
                            >
                              {t('superadmin.manageAdmin')}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {managingAdmin ? (
            <Dialog
              open
              onOpenChange={(open) => {
                if (!open) {
                  setManagingAdminId(null);
                }
              }}
            >
              <DialogContent>
                <DialogTitle className="pr-8 text-xl font-extrabold text-[#1c2744]">
                  {t('superadmin.manageAdminTitle')}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-[#5c6578]">
                  {managingAdmin.firstName} {managingAdmin.lastName} ·{' '}
                  {t('superadmin.manageAdminIntro')}
                </DialogDescription>

                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl border border-[#d8dce6] bg-[#f6f7fb] px-4 py-3">
                    <p className="text-sm font-extrabold text-[#1c2744]">
                      {managingAdmin.firstName} {managingAdmin.lastName}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-[#5c6578]">
                      {managingAdmin.email}
                    </p>
                    <p className="mt-2 text-xs font-bold text-[#5c6578]">
                      {managingAdmin.conferences.length > 0
                        ? managingAdmin.conferences.map((item) => item.name).join(' · ')
                        : t('superadmin.noConferenceYet')}
                    </p>
                  </div>

                  <PasswordLine
                    label={t('superadmin.loginPassword')}
                    value={managingAdmin.loginPassword}
                    missing={t('superadmin.passwordMissing')}
                  />

                  <form
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      const form = event.currentTarget;
                      void apiFetch(
                        `/api/v1/system/admins/${managingAdmin.id}/password`,
                        {
                          method: 'POST',
                          body: JSON.stringify({
                            password: String(data.get('password') ?? ''),
                          }),
                        },
                      ).then(async (response) => {
                        if (!response.ok) {
                          feedback.error(await apiErrorMessage(response));
                          return;
                        }
                        form.reset();
                        feedback.success(
                          t('superadmin.passwordReset', { email: managingAdmin.email }),
                        );
                        setManagingAdminId(null);
                        await refreshAll();
                      });
                    }}
                  >
                    <label className="block text-sm font-bold text-[#5c6578]">
                      {t('superadmin.resetPassword')}
                      <input
                        name="password"
                        type="text"
                        required
                        minLength={12}
                        autoComplete="off"
                        className={field}
                      />
                    </label>
                    <Button type="submit" className="w-full sm:w-auto">
                      {t('superadmin.savePassword')}
                    </Button>
                  </form>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
        </section>
      ) : null}

      {section === 'conferences' ? (
        <section className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="relative min-w-0 flex-1">
              <p className="text-sm font-bold text-[#1c2744]">{t('nav.conferences')}</p>
              <button
                type="button"
                aria-expanded={conferenceOpen}
                onClick={() => setConferenceOpen((open) => !open)}
                className="mt-1.5 flex min-h-10 w-full items-center justify-between gap-2 rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-left text-sm font-semibold text-[#1c2744]"
              >
                <span className="truncate">
                  {conferenceFilter === 'ALL'
                    ? t('superadmin.allConferences')
                    : conferences.data?.find((item) => item.id === conferenceFilter)
                        ?.name ?? t('superadmin.allConferences')}
                </span>
                <ChevronDown className="size-4 shrink-0 text-[#8b909a]" />
              </button>
              {conferenceOpen ? (
                <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-[#e4e7ee] bg-white py-1 shadow-[0_12px_32px_rgba(28,39,68,0.12)]">
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        setConferenceFilter('ALL');
                        setConferenceOpen(false);
                      }}
                      className={`flex w-full px-3 py-2 text-left text-sm ${
                        conferenceFilter === 'ALL'
                          ? 'bg-[#f6f7fb] font-extrabold text-[#1c2744]'
                          : 'font-semibold text-[#1c2744] hover:bg-[#f6f7fb]'
                      }`}
                    >
                      {t('superadmin.allConferences')}
                    </button>
                  </li>
                  {(conferences.data ?? []).map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setConferenceFilter(item.id);
                          setConferenceOpen(false);
                        }}
                        className={`flex w-full px-3 py-2 text-left text-sm ${
                          item.id === conferenceFilter
                            ? 'bg-[#f6f7fb] font-extrabold text-[#1c2744]'
                            : 'font-semibold text-[#1c2744] hover:bg-[#f6f7fb]'
                        }`}
                      >
                        {item.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <label className="min-w-0 flex-1 text-sm font-bold text-[#1c2744]">
              {t('top.search')}
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('superadmin.searchHint')}
                className="mt-1.5 block min-h-10 w-full rounded-2xl border border-[#e4e7ee] bg-white px-3 py-2 text-sm font-semibold text-[#1c2744] outline-none placeholder:font-medium placeholder:text-[#8b909a]"
              />
            </label>
          </div>

          <section className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <Metric
              tone="blue"
              label={t('superadmin.allConferences')}
              value={conferences.isPending ? '—' : conferenceCounts.total}
              hint={t('superadmin.metricConferences')}
            />
            <Metric
              tone="green"
              label={t('conferences.states.PUBLISHED')}
              value={conferences.isPending ? '—' : conferenceCounts.published}
              hint={t('superadmin.metricPublished', {
                count: conferenceCounts.published,
              })}
            />
            <Metric
              tone="amber"
              label={t('conferences.states.DRAFT')}
              value={conferences.isPending ? '—' : conferenceCounts.draft}
              hint={t('superadmin.statusDraftHint')}
            />
            <Metric
              tone="slate"
              label={t('conferences.states.ARCHIVED')}
              value={conferences.isPending ? '—' : conferenceCounts.archived}
              hint={t('superadmin.statusArchivedHint')}
            />
          </section>

          <div className="rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-[#1c2744]">
                {t('superadmin.allConferences')}
              </h2>
              <p className="mt-1 text-xs font-bold text-[#8b909a]">
                {filteredConferences.length} / {conferences.data?.length ?? 0}
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => {
                  const headers = [
                    'id',
                    'name',
                    'shortName',
                    'status',
                    'city',
                    'country',
                    'papers',
                    'members',
                    'chair',
                  ];
                  const rows = (conferences.data ?? []).map((item) => [
                    item.id,
                    item.name,
                    item.shortName,
                    item.status,
                    item.city ?? '',
                    item.country ?? '',
                    String(item.paperCount),
                    String(item.memberCount),
                    item.chair?.email ?? '',
                  ]);
                  downloadCsv('conferences.csv', headers, rows);
                  feedback.success(t('superadmin.exported'));
                }}
              >
                {t('superadmin.exportCsv')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => {
                  const headers = [
                    'id',
                    'name',
                    'shortName',
                    'status',
                    'city',
                    'country',
                    'papers',
                    'members',
                    'chair',
                  ];
                  const rows = (conferences.data ?? []).map((item) => [
                    item.id,
                    item.name,
                    item.shortName,
                    item.status,
                    item.city ?? '',
                    item.country ?? '',
                    String(item.paperCount),
                    String(item.memberCount),
                    item.chair?.email ?? '',
                  ]);
                  downloadPdf(
                    'conferences.pdf',
                    'PapersManagement — Conferences',
                    headers,
                    rows,
                  );
                  feedback.success(t('superadmin.exportedPdf'));
                }}
              >
                {t('superadmin.exportPdf')}
              </Button>
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={() => {
                  setNewChairOnCreate(false);
                  setChairUserId('');
                  setCreateConferenceOpen(true);
                }}
              >
                {t('superadmin.createConference')}
              </Button>
            </div>
          </div>

          <Dialog
            open={createConferenceOpen}
            onOpenChange={(open) => {
              setCreateConferenceOpen(open);
              if (!open) {
                setNewChairOnCreate(false);
                setChairUserId('');
              }
            }}
          >
            <DialogContent className="sm:w-[min(100%-1.5rem,40rem)]">
              <DialogTitle className="pr-8 text-xl font-extrabold text-[#1c2744]">
                {t('superadmin.createConference')}
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-[#5c6578]">
                {t('superadmin.createConferenceIntro')}
              </DialogDescription>
              <form
                className="mt-5 grid gap-3 sm:grid-cols-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const body = Object.fromEntries(
                    [...data.entries()].map(([key, value]) => [key, String(value)]),
                  );
                  void (async () => {
                    if (!newChairOnCreate) {
                      body.chairUserId = chairUserId;
                    }
                    if (newChairOnCreate) {
                      const response = await apiFetch('/api/v1/system/admins', {
                        method: 'POST',
                        body: JSON.stringify({
                          firstName: body.adminFirstName ?? '',
                          lastName: body.adminLastName ?? '',
                          email: body.adminEmail ?? '',
                          password: body.adminPassword ?? '',
                        }),
                      });
                      if (!response.ok) {
                        feedback.error(await apiErrorMessage(response));
                        return;
                      }
                      const created = (await response.json()) as AdminAccount;
                      body.chairUserId = created.id;
                      createdChairEmail.current = created.email;
                    }
                    await createConference.mutateAsync(body);
                  })();
                }}
              >
                <label className="text-sm font-bold sm:col-span-2">
                  {t('conferences.name')}
                  <input name="name" required minLength={3} className={field} />
                </label>
                <label className="text-sm font-bold">
                  {t('conferences.shortName')}
                  <input
                    name="shortName"
                    required
                    minLength={2}
                    maxLength={40}
                    className={field}
                  />
                </label>
                <div className="grid gap-2 sm:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-bold">{t('superadmin.chair')}</span>
                    <button
                      type="button"
                      className="text-xs font-extrabold text-[#3d4fd4]"
                      onClick={() => setNewChairOnCreate((value) => !value)}
                    >
                      {newChairOnCreate
                        ? t('superadmin.chooseExistingAdmin')
                        : t('superadmin.createAdminHere')}
                    </button>
                  </div>
                  {newChairOnCreate ? (
                    <div className="grid gap-3 rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] p-3 sm:grid-cols-2">
                      <label className="text-sm font-bold">
                        {t('auth.firstName')}
                        <input name="adminFirstName" required className={field} />
                      </label>
                      <label className="text-sm font-bold">
                        {t('auth.lastName')}
                        <input name="adminLastName" required className={field} />
                      </label>
                      <label className="text-sm font-bold sm:col-span-2">
                        {t('auth.email')}
                        <input
                          name="adminEmail"
                          type="email"
                          required
                          autoComplete="off"
                          className={field}
                        />
                      </label>
                      <label className="text-sm font-bold sm:col-span-2">
                        {t('superadmin.loginPassword')}
                        <input
                          name="adminPassword"
                          type="text"
                          required
                          minLength={12}
                          autoComplete="off"
                          className={field}
                        />
                      </label>
                    </div>
                  ) : (
                    <AssignmentField
                      label=""
                      title={t('superadmin.chooseAdmin')}
                      hint={t('superadmin.chair')}
                      placeholder={t('superadmin.chooseAdmin')}
                      value={chairUserId}
                      onChange={setChairUserId}
                      options={(admins.data ?? []).map((admin) => ({
                        id: admin.id,
                        title: `${admin.firstName} ${admin.lastName}`.trim(),
                        subtitle: admin.email,
                        group:
                          admin.conferences.length > 0 ? 'busy' : 'available',
                      }))}
                      filters={[
                        { id: 'all', label: t('picker.all') },
                        { id: 'busy', label: t('picker.busy') },
                        { id: 'available', label: t('picker.available') },
                      ]}
                    />
                  )}
                </div>
                <label className="text-sm font-bold">
                  {t('auth.city')}
                  <input name="city" className={field} />
                </label>
                <label className="text-sm font-bold">
                  {t('auth.country')}
                  <input name="country" className={field} />
                </label>
                <label className="text-sm font-bold">
                  {t('workflow.starts')}
                  <Input name="startsOn" type="date" className="mt-1.5" />
                </label>
                <label className="text-sm font-bold">
                  {t('workflow.ends')}
                  <Input name="endsOn" type="date" className="mt-1.5" />
                </label>
                <label className="text-sm font-bold sm:col-span-2">
                  {t('conferences.description')}
                  <textarea name="description" className={`${field} min-h-20`} />
                </label>
                <div className="sm:col-span-2">
                  <Button
                    type="submit"
                    disabled={
                      createConference.isPending ||
                      (!newChairOnCreate && !chairUserId)
                    }
                  >
                    {t('superadmin.createConference')}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {filteredConferences.length === 0 ? (
            <p className="mt-4 text-sm text-[#5c6578]">{t('superadmin.noConferences')}</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {filteredConferences.map((item) => (
                <li
                  key={item.id}
                  className={`grid gap-3 rounded-2xl px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center ${
                    item.status === 'PUBLISHED'
                      ? 'bg-[#2fbf71]/14'
                      : item.status === 'DRAFT'
                        ? 'bg-[#f0a04b]/16'
                        : 'bg-[#eef0f5]'
                  }`}
                >
                  <div className="min-w-0">
                    <Link
                      to={`/workspace/conferences/${item.id}`}
                      className="text-sm font-extrabold text-[#1c2744] no-underline"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-[#8b909a]">
                      {item.shortName}
                      {item.city ? ` · ${item.city}` : ''}
                      {item.country ? `, ${item.country}` : ''}
                    </p>
                    <p
                      className={`mt-2 text-xs font-extrabold ${
                        item.status === 'PUBLISHED'
                          ? 'text-[#1c9a57]'
                          : item.status === 'DRAFT'
                            ? 'text-[#9a6410]'
                            : 'text-[#5c6578]'
                      }`}
                    >
                      {item.chair
                        ? `${item.chair.firstName} ${item.chair.lastName}`
                        : t('superadmin.chairMissing')}
                      {' · '}
                      {t(`conferences.states.${item.status}`, {
                        defaultValue: item.status,
                      })}
                    </p>
                    <p className="mt-1 text-xs font-bold text-[#8b909a]">
                      {t('superadmin.paperMembers', {
                        papers: item.paperCount,
                        members: item.memberCount,
                      })}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-[#c5cad6]"
                    onClick={() => {
                      setManagingConferenceId(item.id);
                      setAssignChairId(item.chair?.id ?? '');
                    }}
                  >
                    {t('superadmin.manageConference')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          </div>

          {managingConference ? (
            <Dialog
              open
              onOpenChange={(open) => {
                if (!open) {
                  setManagingConferenceId(null);
                }
              }}
            >
              <DialogContent className="sm:w-[min(100%-1.5rem,40rem)]">
                <DialogTitle className="pr-8 text-xl font-extrabold text-[#1c2744]">
                  {t('superadmin.manageConferenceTitle')}
                </DialogTitle>
                <DialogDescription className="mt-1 text-sm text-[#5c6578]">
                  {t('superadmin.manageConferenceIntro')}
                </DialogDescription>

                <div className="mt-5 space-y-4">
                  <div className="rounded-2xl border border-[#e4e7ee] bg-[#f6f7fb] px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-base font-extrabold text-[#1c2744]">
                          {managingConference.name}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-[#5c6578]">
                          {[
                            managingConference.shortName,
                            [managingConference.city, managingConference.country]
                              .filter(Boolean)
                              .join(', '),
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        <p className="mt-2 text-xs font-bold text-[#8b909a]">
                          {t('superadmin.paperMembers', {
                            papers: managingConference.paperCount,
                            members: managingConference.memberCount,
                          })}
                        </p>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-[#3d4fd4] ring-1 ring-[#d8dce6]">
                        {t(`conferences.states.${managingConference.status}`, {
                          defaultValue: managingConference.status,
                        })}
                      </span>
                    </div>
                    <Button asChild className="mt-4 w-full sm:w-auto">
                      <Link to={`/workspace/conferences/${managingConference.id}`}>
                        {t('superadmin.openConference')}
                      </Link>
                    </Button>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-[#e4e7ee] bg-white p-4">
                    <div>
                      <p className="text-sm font-extrabold text-[#1c2744]">
                        {t('superadmin.sectionAdmin')}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[#8b909a]">
                        {t('superadmin.sectionAdminHint')}
                      </p>
                    </div>
                    <AssignmentField
                      label={t('superadmin.chair')}
                      title={t('superadmin.chooseAdmin')}
                      placeholder={t('superadmin.chooseAdmin')}
                      value={assignChairId}
                      onChange={(id) => {
                        setAssignChairId(id);
                        if (!id || id === managingConference.chair?.id) {
                          return;
                        }
                        void apiFetch(
                          `/api/v1/system/conferences/${managingConference.id}/chair`,
                          {
                            method: 'POST',
                            body: JSON.stringify({ chairUserId: id }),
                          },
                        ).then(async (response) => {
                          if (!response.ok) {
                            feedback.error(await apiErrorMessage(response));
                            return;
                          }
                          feedback.success(
                            t('superadmin.chairUpdated', {
                              name: managingConference.name,
                            }),
                          );
                          await refreshAll();
                        });
                      }}
                      options={(admins.data ?? []).map((admin) => ({
                        id: admin.id,
                        title: `${admin.firstName} ${admin.lastName}`.trim(),
                        subtitle: admin.email,
                        group: admin.conferences.length > 0 ? 'busy' : 'available',
                      }))}
                      filters={[
                        { id: 'all', label: t('picker.all') },
                        { id: 'busy', label: t('picker.busy') },
                        { id: 'available', label: t('picker.available') },
                      ]}
                    />
                    {managingConference.chair ? (
                      <p className="text-xs font-extrabold text-[#1c9a57]">
                        {t('superadmin.chairCurrent', {
                          name: `${managingConference.chair.firstName} ${managingConference.chair.lastName}`.trim(),
                        })}
                      </p>
                    ) : (
                      <p className="text-xs font-semibold text-[#8b909a]">
                        {t('superadmin.chairMissing')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-3 rounded-2xl border border-[#e4e7ee] bg-white p-4">
                    <div>
                      <p className="text-sm font-extrabold text-[#1c2744]">
                        {t('superadmin.sectionStatus')}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-[#8b909a]">
                        {t('superadmin.sectionStatusHint')}
                      </p>
                    </div>
                    <div className="grid gap-2">
                      {(
                        [
                          ['DRAFT', 'statusDraftHint'],
                          ['PUBLISHED', 'statusPublishedHint'],
                          ['ARCHIVED', 'statusArchivedHint'],
                        ] as const
                      ).map(([statusValue, hintKey]) => {
                        const active = managingConference.status === statusValue;
                        return (
                          <button
                            key={statusValue}
                            type="button"
                            onClick={() => {
                              if (active) {
                                return;
                              }
                              void apiFetch(
                                `/api/v1/system/conferences/${managingConference.id}/status`,
                                {
                                  method: 'POST',
                                  body: JSON.stringify({ status: statusValue }),
                                },
                              ).then(async (response) => {
                                if (!response.ok) {
                                  feedback.error(await apiErrorMessage(response));
                                  return;
                                }
                                feedback.success(
                                  t('superadmin.statusUpdated', {
                                    name: managingConference.name,
                                    status: t(`conferences.states.${statusValue}`, {
                                      defaultValue: statusValue,
                                    }),
                                  }),
                                );
                                void refreshAll();
                              });
                            }}
                            className={`rounded-2xl border px-4 py-3 text-left ${
                              active
                                ? 'border-[#5d74ff] bg-[#eef2ff]'
                                : 'border-[#e4e7ee] bg-white hover:bg-[#f8f9fc]'
                            }`}
                          >
                            <span className="block text-sm font-extrabold text-[#1c2744]">
                              {t(`conferences.states.${statusValue}`, {
                                defaultValue: statusValue,
                              })}
                            </span>
                            <span className="mt-0.5 block text-xs font-semibold text-[#8b909a]">
                              {t(`superadmin.${hintKey}`)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 border-t border-[#eef1f8] pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        void postAction(
                          `/api/v1/system/conferences/${managingConference.id}/clone`,
                          t('superadmin.cloned', { name: managingConference.name }),
                        )
                      }
                    >
                      {t('superadmin.cloneConference')}
                    </Button>
                    {managingConference.status === 'DRAFT' &&
                    managingConference.paperCount === 0 ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="border-[#e35d5d] text-[#c54545] hover:bg-[#fdecec]"
                        onClick={() =>
                          void postAction(
                            `/api/v1/system/conferences/${managingConference.id}`,
                            t('superadmin.deletedConference'),
                            'DELETE',
                          ).then(() => setManagingConferenceId(null))
                        }
                      >
                        {t('superadmin.deleteDraft')}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
        </section>
      ) : null}

      {section === 'users' ? (
        <section className="rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-[#1c2744]">
                {t('superadmin.users')}
              </h2>
              <p className="mt-1 text-sm text-[#5c6578]">{t('superadmin.usersIntro')}</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
              <p className="text-xs font-bold text-[#8b909a]">
                {filteredUsers.length} / {users.data?.length ?? 0}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => {
                  const headers = [
                    'id',
                    'email',
                    'firstName',
                    'lastName',
                    'kind',
                    'emailVerified',
                    'disabled',
                    'createdAt',
                  ];
                  const rows = (users.data ?? []).map((item) => [
                    item.id,
                    item.email,
                    item.firstName,
                    item.lastName,
                    item.kind,
                    item.emailVerified ? 'yes' : 'no',
                    item.disabled ? 'yes' : 'no',
                    item.createdAt,
                  ]);
                  downloadCsv('accounts.csv', headers, rows);
                  feedback.success(t('superadmin.exported'));
                }}
              >
                {t('superadmin.exportCsv')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => {
                  const headers = [
                    'id',
                    'email',
                    'firstName',
                    'lastName',
                    'kind',
                    'emailVerified',
                    'disabled',
                    'createdAt',
                  ];
                  const rows = (users.data ?? []).map((item) => [
                    item.id,
                    item.email,
                    item.firstName,
                    item.lastName,
                    item.kind,
                    item.emailVerified ? 'yes' : 'no',
                    item.disabled ? 'yes' : 'no',
                    item.createdAt,
                  ]);
                  downloadPdf(
                    'accounts.pdf',
                    'PapersManagement — Accounts',
                    headers,
                    rows,
                  );
                  feedback.success(t('superadmin.exportedPdf'));
                }}
              >
                {t('superadmin.exportPdf')}
              </Button>
            </div>
          </div>
          {users.isPending ? (
            <p className="mt-4 text-sm text-[#8b909a]">{t('common.loading')}</p>
          ) : null}
          {filteredUsers.length === 0 && !users.isPending ? (
            <p className="mt-4 text-sm text-[#5c6578]">{t('superadmin.noUsers')}</p>
          ) : null}
          <ul className="mt-4 grid gap-2">
            {filteredUsers.map((user) => (
              <li
                key={user.id}
                className="flex flex-col gap-3 rounded-[24px] bg-[#f6f7fb] px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-[#1c2744]">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="break-all text-xs text-[#8b909a]">{user.email}</p>
                  <p className="mt-1 text-xs text-[#5c6578]">
                    {user.memberships.length > 0
                      ? user.memberships
                          .slice(0, 3)
                          .map((item) => `${item.shortName} (${item.role})`)
                          .join(' · ')
                      : t('superadmin.noMembership')}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-[#3d4fd4]">
                    {t(`superadmin.kinds.${user.kind}`)}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-[#5c6578]">
                    {user.emailVerified
                      ? t('superadmin.emailVerified')
                      : t('superadmin.emailPending')}
                  </span>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-extrabold text-[#5c6578]">
                    {user.disabled
                      ? t('superadmin.accountDisabled')
                      : t('superadmin.accountActive')}
                  </span>
                  {!user.emailVerified ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        void postAction(
                          `/api/v1/system/users/${user.id}/verify-email`,
                          t('superadmin.emailForced', { email: user.email }),
                        )
                      }
                    >
                      {t('superadmin.verifyEmail')}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void postAction(
                        `/api/v1/system/users/${user.id}/${user.disabled ? 'enable' : 'disable'}`,
                        user.disabled
                          ? t('superadmin.userEnabled', { email: user.email })
                          : t('superadmin.userDisabled', { email: user.email }),
                      )
                    }
                  >
                    {user.disabled
                      ? t('superadmin.enableUser')
                      : t('superadmin.disableUser')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void postAction(
                        `/api/v1/system/users/${user.id}/sessions/revoke`,
                        t('superadmin.sessionsRevoked', { email: user.email }),
                      )
                    }
                  >
                    {t('superadmin.revokeSessions')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void postAction(
                        `/api/v1/system/users/${user.id}`,
                        t('superadmin.userDeleted'),
                        'DELETE',
                      )
                    }
                  >
                    {t('superadmin.deleteUser')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {section === 'audit' ? (
        <section className="rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-[#1c2744]">
                {t('superadmin.audit')}
              </h2>
              <p className="mt-1 text-sm text-[#5c6578]">{t('superadmin.auditIntro')}</p>
            </div>
            <p className="text-xs font-bold text-[#8b909a]">
              {filteredAudit.length} / {audit.data?.length ?? 0}
            </p>
          </div>
          {audit.isPending ? (
            <p className="mt-4 text-sm text-[#8b909a]">{t('common.loading')}</p>
          ) : null}
          {filteredAudit.length === 0 && !audit.isPending ? (
            <p className="mt-4 text-sm text-[#5c6578]">{t('superadmin.noAudit')}</p>
          ) : null}
          <ul className="mt-4 grid gap-2">
            {filteredAudit.map((row) => (
              <li key={row.id} className="rounded-[24px] bg-[#f6f7fb] px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-extrabold text-[#1c2744]">{row.action}</p>
                    <p className="mt-1 text-xs text-[#5c6578]">
                      {t('superadmin.auditActor')}:{' '}
                      {row.actor
                        ? `${row.actor.name || row.actor.email} · ${row.actor.email}`
                        : '—'}
                    </p>
                    <p className="mt-1 text-xs text-[#8b909a]">
                      {t('superadmin.auditResource')}: {row.resourceType}
                      {row.resourceId ? ` · ${row.resourceId.slice(0, 8)}…` : ''}
                    </p>
                  </div>
                  <time
                    className="text-xs font-bold text-[#8b909a]"
                    dateTime={row.createdAt}
                  >
                    {new Date(row.createdAt).toLocaleString()}
                  </time>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {section === 'sessions' ? (
        <section className="rounded-[28px] border border-[#e4e7ee] bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-extrabold text-[#1c2744]">
                {t('superadmin.sessions')}
              </h2>
              <p className="mt-1 text-sm text-[#5c6578]">
                {t('superadmin.sessionsIntro')}
              </p>
            </div>
            <p className="text-xs font-bold text-[#8b909a]">
              {filteredSessions.length} / {sessions.data?.length ?? 0}
            </p>
          </div>
          {sessions.isPending ? (
            <p className="mt-4 text-sm text-[#8b909a]">{t('common.loading')}</p>
          ) : null}
          {filteredSessions.length === 0 && !sessions.isPending ? (
            <p className="mt-4 text-sm text-[#5c6578]">{t('superadmin.noSessions')}</p>
          ) : null}
          <ul className="mt-4 grid gap-2">
            {filteredSessions.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] bg-[#f6f7fb] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-extrabold text-[#1c2744]">
                    {row.name || row.email}
                  </p>
                  <p className="text-xs text-[#8b909a]">{row.email}</p>
                  <p className="mt-1 text-xs text-[#5c6578]">
                    {t('superadmin.expiresAt')}:{' '}
                    {new Date(row.expiresAt).toLocaleString()}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void postAction(
                      `/api/v1/system/sessions/${row.id}/revoke`,
                      t('superadmin.sessionRevoked'),
                    )
                  }
                >
                  {t('superadmin.revokeSession')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
