import {
  CalendarRange,
  ClipboardList,
  Home,
  KeyRound,
  Library,
  ListChecks,
  LogOut,
  Menu,
  Mic2,
  NotebookPen,
  ScrollText,
  Settings2,
  Shield,
  Users,
  UserRound,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { DeadlineBell } from '@/components/deadline-bell';
import { Button } from '@/components/ui/button';
import { useCurrentUser, useLogout } from '@/features/auth/use-account';
import { canStartSubmission } from '@/features/navigation/can-submit';
import { homePathFor, isCreatedAdmin, isSessionChair } from '@/features/navigation/home-path';
import { apiErrorMessage, apiFetch } from '@/services/api';
import { cn } from '@/lib/utils';

type NavTab = {
  id: string;
  to: string;
  label: string;
  icon: typeof Home;
  end: boolean;
};

const shared = {
  account: {
    id: 'account',
    to: '/workspace/account',
    label: 'auth.profileTitle',
    icon: UserRound,
    end: false,
  },
  preferences: {
    id: 'preferences',
    to: '/workspace/preferences',
    label: 'nav.preferences',
    icon: Settings2,
    end: false,
  },
} as const;

type NavAudience = 'system' | 'sessionChair' | 'reviewer' | 'author' | 'chair';

function audienceFor(home: string): NavAudience {
  if (home.endsWith('/system')) {
    return 'system';
  }
  if (home.endsWith('/session-chair')) {
    return 'sessionChair';
  }
  if (home.endsWith('/reviewer')) {
    return 'reviewer';
  }
  if (home.endsWith('/author')) {
    return 'author';
  }
  return 'chair';
}

function tabsFor(home: string, audience: NavAudience): NavTab[] {
  if (audience === 'system') {
    return [
      { id: 'home', to: home, label: 'superadmin.tabOverview', icon: Home, end: true },
      {
        id: 'sysAdmins',
        to: '/workspace/system/admins',
        label: 'superadmin.tabAdmins',
        icon: Shield,
        end: false,
      },
      {
        id: 'sysConferences',
        to: '/workspace/system/conferences',
        label: 'superadmin.tabConferences',
        icon: Library,
        end: false,
      },
      {
        id: 'sysSessionChairs',
        to: '/workspace/session-chair',
        label: 'nav.sessionChair',
        icon: Mic2,
        end: false,
      },
      {
        id: 'sysReviewers',
        to: '/workspace/reviewers',
        label: 'nav.reviewers',
        icon: Users,
        end: false,
      },
      {
        id: 'sysUsers',
        to: '/workspace/system/users',
        label: 'superadmin.tabUsers',
        icon: Users,
        end: false,
      },
      {
        id: 'sysSessions',
        to: '/workspace/system/sessions',
        label: 'superadmin.tabSessions',
        icon: KeyRound,
        end: false,
      },
      {
        id: 'sysAudit',
        to: '/workspace/system/audit',
        label: 'superadmin.tabAudit',
        icon: ScrollText,
        end: false,
      },
      {
        id: 'submissions',
        to: '/workspace/submissions',
        label: 'nav.submissions',
        icon: NotebookPen,
        end: false,
      },
      {
        id: 'followUp',
        to: '/workspace/follow-up',
        label: 'nav.followUp',
        icon: ListChecks,
        end: false,
      },
      shared.account,
      shared.preferences,
    ];
  }

  if (audience === 'sessionChair') {
    return [
      { id: 'home', to: home, label: 'nav.home', icon: Home, end: true },
      {
        id: 'conferences',
        to: '/workspace/conferences',
        label: 'nav.conferences',
        icon: Library,
        end: false,
      },
      {
        id: 'program',
        to: '/workspace/program',
        label: 'nav.program',
        icon: CalendarRange,
        end: false,
      },
      shared.account,
      shared.preferences,
    ];
  }

  if (audience === 'reviewer') {
    return [
      { id: 'home', to: home, label: 'nav.home', icon: Home, end: true },
      {
        id: 'conferences',
        to: '/workspace/conferences',
        label: 'nav.conferences',
        icon: Library,
        end: false,
      },
      {
        id: 'program',
        to: '/workspace/program',
        label: 'nav.program',
        icon: CalendarRange,
        end: false,
      },
      shared.account,
      shared.preferences,
    ];
  }

  if (audience === 'chair') {
    return [
      { id: 'home', to: home, label: 'nav.home', icon: Home, end: true },
      {
        id: 'conferences',
        to: '/workspace/conferences',
        label: 'nav.conferences',
        icon: Library,
        end: false,
      },
      {
        id: 'reviews',
        to: '/workspace/reviews',
        label: 'nav.reviews',
        icon: ClipboardList,
        end: false,
      },
      {
        id: 'program',
        to: '/workspace/program',
        label: 'nav.program',
        icon: CalendarRange,
        end: false,
      },
      {
        id: 'followUp',
        to: '/workspace/follow-up',
        label: 'nav.followUp',
        icon: ListChecks,
        end: false,
      },
      {
        id: 'reviewers',
        to: '/workspace/reviewers',
        label: 'nav.reviewers',
        icon: Users,
        end: false,
      },
      {
        id: 'sessionChair',
        to: '/workspace/session-chair',
        label: 'nav.sessionChair',
        icon: Mic2,
        end: false,
      },
      shared.account,
      shared.preferences,
    ];
  }

  const catalog: NavTab[] = [
    { id: 'home', to: home, label: 'nav.home', icon: Home, end: true },
    {
      id: 'conferences',
      to: '/workspace/conferences',
      label: 'nav.conferences',
      icon: Library,
      end: false,
    },
    {
      id: 'submissions',
      to: '/workspace/submissions',
      label: 'nav.submissions',
      icon: NotebookPen,
      end: false,
    },
    {
      id: 'reviews',
      to: '/workspace/reviews',
      label: 'nav.reviews',
      icon: ClipboardList,
      end: false,
    },
    {
      id: 'followUp',
      to: '/workspace/follow-up',
      label: 'nav.followUp',
      icon: ListChecks,
      end: false,
    },
    {
      id: 'program',
      to: '/workspace/program',
      label: 'nav.program',
      icon: CalendarRange,
      end: false,
    },
    shared.account,
    shared.preferences,
  ];

  const hidden = new Set(['reviews']);
  return catalog.filter((tab) => !hidden.has(tab.id));
}

const mainIds = new Set(['home', 'conferences']);
const workIds = new Set(['submissions', 'reviews', 'followUp', 'program']);
const teamIds = new Set(['reviewers', 'sessionChair']);
const accountIds = new Set(['account', 'preferences']);

function groupTabs(tabs: NavTab[]) {
  const main: NavTab[] = [];
  const work: NavTab[] = [];
  const team: NavTab[] = [];
  const account: NavTab[] = [];
  for (const tab of tabs) {
    if (mainIds.has(tab.id)) {
      main.push(tab);
    } else if (workIds.has(tab.id)) {
      work.push(tab);
    } else if (teamIds.has(tab.id)) {
      team.push(tab);
    } else if (accountIds.has(tab.id)) {
      account.push(tab);
    } else {
      work.push(tab);
    }
  }
  return { main, work, team, account };
}

function mobilePrimary(tabs: NavTab[], audience: NavAudience): NavTab[] {
  const ids =
    audience === 'chair'
      ? ['home', 'reviews', 'program', 'followUp']
      : audience === 'reviewer'
        ? ['home', 'conferences', 'program', 'account']
        : audience === 'sessionChair'
          ? ['home', 'conferences', 'program', 'account']
          : audience === 'system'
            ? ['home', 'sysConferences', 'sysUsers', 'submissions']
            : ['home', 'conferences', 'submissions', 'followUp'];
  return ids
    .map((id) => tabs.find((tab) => tab.id === id))
    .filter((tab): tab is NavTab => Boolean(tab))
    .slice(0, 4);
}

function navClass(isActive: boolean, compact = false) {
  return cn(
    'flex items-center no-underline transition-colors',
    compact
      ? 'w-full min-w-0 flex-col gap-1 overflow-hidden rounded-xl px-1 py-2 text-center text-[10px] font-bold leading-tight sm:text-[11px]'
      : 'min-h-9 gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold',
    isActive
      ? 'bg-[#eef2ff] text-[#3d4fd4]'
      : 'text-[#5c6578] hover:bg-[#f4f6fb] hover:text-[#1c2744]',
  );
}

function SidebarLink({
  tab,
  onNavigate,
  compact = false,
}: {
  tab: NavTab;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.to}
      end={tab.end}
      onClick={onNavigate}
      className={({ isActive }) => navClass(isActive, compact)}
    >
      <Icon className={compact ? 'size-5 shrink-0' : 'size-3.5 shrink-0'} strokeWidth={2} />
      <span className={cn('truncate', compact ? 'max-w-full' : '')}>{t(tab.label)}</span>
    </NavLink>
  );
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.12em] text-[#9aa3b5]">
      {children}
    </p>
  );
}

function NavSection({
  label,
  tabs,
  onNavigate,
}: {
  label: string;
  tabs: NavTab[];
  onNavigate?: () => void;
}) {
  if (tabs.length === 0) {
    return null;
  }
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="grid gap-0.5">
        {tabs.map((tab) => (
          <SidebarLink key={tab.to} tab={tab} onNavigate={onNavigate} />
        ))}
      </div>
    </div>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const account = useCurrentUser();
  const logout = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);
  const memberships = useQuery({
    queryKey: ['conferences'],
    queryFn: async () => {
      const response = await apiFetch('/api/v1/conferences');
      if (!response.ok) {
        throw new Error(await apiErrorMessage(response));
      }
      return response.json() as Promise<
        { id: string; name: string; role: string; membershipStatus: string }[]
      >;
    },
  });
  const roles =
    memberships.data
      ?.filter((item) => item.membershipStatus === 'ACTIVE')
      .map((item) => item.role) ?? [];
  const activeConference = memberships.data?.find(
    (item) => item.membershipStatus === 'ACTIVE',
  );
  const platformAdmin = account.data?.platformRole === 'SYSTEM_ADMIN';
  const createdAdmin = isCreatedAdmin(account.data?.profile?.academicTitle);
  const sessionChair = isSessionChair(account.data?.profile?.academicTitle);
  const home = platformAdmin
    ? '/workspace/system'
    : memberships.isSuccess
      ? homePathFor(roles, { createdAdmin, sessionChair })
      : createdAdmin
        ? '/workspace/administrator'
        : sessionChair
          ? '/workspace/session-chair'
          : location.pathname.startsWith('/workspace/administrator')
            ? '/workspace/administrator'
            : location.pathname.startsWith('/workspace/committee')
              ? '/workspace/committee'
              : location.pathname.startsWith('/workspace/reviewer')
                ? '/workspace/reviewer'
                : '/workspace/author';
  const audience = audienceFor(home);
  const tabs = tabsFor(home, audience);
  const sections = groupTabs(tabs);
  const mobileBar = mobilePrimary(tabs, audience);
  const mobileMore = tabs.filter((tab) => !mobileBar.some((item) => item.id === tab.id));
  const profile = account.data?.profile;
  const displayName = account.data
    ? `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim()
    : t('top.guest');
  const moreActive = mobileMore.some((tab) =>
    tab.end ? location.pathname === tab.to : location.pathname.startsWith(tab.to),
  );
  const roleLabel = platformAdmin
    ? t('superadmin.sidebarLabel')
    : sessionChair
      ? t('sessionChair.role')
      : createdAdmin
        ? t('conferences.roles.CHAIR')
        : activeConference
          ? t(`conferences.roles.${activeConference.role}`, {
              defaultValue: activeConference.role,
            })
          : null;
  const roleLine = roleLabel ?? t('home.noConference');
  const showNewSubmission = canStartSubmission(
    Boolean(platformAdmin),
    memberships.data,
    account.data?.profile?.academicTitle,
  );
  const showTopName =
    location.pathname === home || location.pathname.startsWith('/workspace/account');

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  function signOut() {
    void logout.mutateAsync().then(() => navigate('/login'));
  }

  return (
    <div className="workspace-shell min-h-screen bg-[#f3f6fb] text-[#1c2744]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-4 focus:rounded-full focus:bg-white focus:px-3 focus:py-2"
      >
        {t('nav.skip')}
      </a>
      <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-[176px_minmax(0,1fr)]">
        <aside className="hidden h-screen flex-col border-r border-[#e6e8ec] px-2 py-3 lg:sticky lg:top-0 lg:flex">
          <div className="px-2 pb-4 pt-2">
            <p className="truncate text-[12px] font-extrabold tracking-tight text-[#3d4fd4]">
              {t('brand.name')}
            </p>
            <p className="mt-0.5 truncate text-[10px] font-semibold text-[#8b909a]">
              {roleLine}
            </p>
          </div>

          <nav
            className="sidebar-nav mt-6 flex flex-1 flex-col gap-3 overflow-y-auto border-t border-[#eef1f8] pt-4"
            aria-label={t('nav.workspace')}
          >
            {platformAdmin ? (
              <>
                <NavSection
                  label={t('superadmin.navPlatform')}
                  tabs={tabs.filter((tab) =>
                    [
                      'home',
                      'sysAdmins',
                      'sysConferences',
                      'sysSessionChairs',
                      'sysUsers',
                      'sysSessions',
                      'sysAudit',
                    ].includes(tab.id),
                  )}
                />
                <NavSection
                  label={t('superadmin.navContent')}
                  tabs={tabs.filter(
                    (tab) => tab.id === 'submissions' || tab.id === 'followUp',
                  )}
                />
                <NavSection
                  label={t('superadmin.navAccount')}
                  tabs={tabs.filter(
                    (tab) => tab.id === 'account' || tab.id === 'preferences',
                  )}
                />
              </>
            ) : (
              <>
                <div className="grid gap-0.5">
                  {sections.main.map((tab) => (
                    <SidebarLink key={tab.to} tab={tab} />
                  ))}
                </div>
                <NavSection label={t('nav.sectionWork')} tabs={sections.work} />
                <NavSection label={t('nav.sectionTeam')} tabs={sections.team} />
                <NavSection label={t('nav.sectionAccount')} tabs={sections.account} />
              </>
            )}
          </nav>

          <div className="mt-auto border-t border-[#eef1f8] pt-3">
            <p className="truncate px-2 text-[11px] font-extrabold text-[#1c2744]">
              {displayName}
            </p>
            <button
              type="button"
              className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[12px] font-semibold text-[#5c6578] hover:bg-[#f4f6fb] hover:text-[#c54545]"
              onClick={signOut}
            >
              <LogOut className="size-3.5" />
              {t('auth.logout')}
            </button>
          </div>
        </aside>

        <div className="min-w-0 w-full px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-4 sm:pt-4 lg:px-3 lg:pb-3 lg:pt-3">
          <header className="mb-3 flex flex-wrap items-center gap-3 px-1 py-1 sm:px-0 lg:mb-3 lg:gap-4">
            <button
              type="button"
              className="grid size-10 shrink-0 place-items-center rounded-xl text-[#1c2744] lg:hidden"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? t('nav.close') : t('nav.menu')}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            </button>

            {showTopName ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-[#1c2744] sm:text-[15px]">
                  {displayName}
                </p>
              </div>
            ) : (
              <div className="min-w-0 flex-1" />
            )}

            <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:ml-auto sm:w-auto">
              <DeadlineBell />
              <Link
                to="/workspace/account"
                className="rounded-full bg-[#f4f7ff] px-3 py-2 text-xs font-bold text-[#3d4fd4] no-underline sm:text-sm"
              >
                {t('auth.profileTitle')}
              </Link>
              {showNewSubmission ? (
                <Button asChild size="sm" className="sm:h-10 sm:px-4 sm:text-sm">
                  <Link to="/workspace/submissions/new">{t('papers.new')}</Link>
                </Button>
              ) : null}
              {profile?.photoPath ? (
                <img
                  src={profile.photoPath}
                  alt=""
                  className="size-10 shrink-0 rounded-full object-cover lg:size-11"
                />
              ) : (
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#eef2ff] text-sm font-extrabold text-[#3d4fd4] lg:size-11">
                  {displayName.slice(0, 1)}
                </span>
              )}
            </div>
          </header>
          <main
            id="main-content"
            className="min-w-0 overflow-x-clip px-3 sm:px-4 lg:px-4"
          >
            <Outlet />
          </main>
        </div>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#243044]/40"
            aria-label={t('nav.close')}
            onClick={() => setMenuOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.workspace')}
            className="absolute inset-x-0 bottom-0 flex max-h-[min(85vh,40rem)] flex-col rounded-t-[28px] border border-[#e6e8ec] bg-white shadow-[0_-12px_40px_rgba(28,36,48,0.16)]"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center justify-between gap-3 border-b border-[#eef1f8] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-extrabold text-[#1c2744]">
                  {displayName}
                </p>
                <p className="truncate text-xs text-[#8b909a]">{account.data?.email}</p>
              </div>
              <button
                type="button"
                className="grid size-10 place-items-center rounded-full text-[#5c6578] hover:bg-[#f4f5f7]"
                aria-label={t('nav.close')}
                onClick={() => setMenuOpen(false)}
              >
                <X className="size-5" />
              </button>
            </div>
            <nav className="overflow-y-auto px-3 py-3" aria-label={t('nav.workspace')}>
              <div className="grid gap-3">
                {platformAdmin ? (
                  <>
                    <NavSection
                      label={t('superadmin.navPlatform')}
                      onNavigate={() => setMenuOpen(false)}
                      tabs={tabs.filter((tab) =>
                        [
                          'home',
                          'sysAdmins',
                          'sysConferences',
                          'sysUsers',
                          'sysSessions',
                          'sysAudit',
                        ].includes(tab.id),
                      )}
                    />
                    <NavSection
                      label={t('superadmin.navContent')}
                      onNavigate={() => setMenuOpen(false)}
                      tabs={tabs.filter(
                        (tab) => tab.id === 'submissions' || tab.id === 'followUp',
                      )}
                    />
                    <NavSection
                      label={t('superadmin.navAccount')}
                      onNavigate={() => setMenuOpen(false)}
                      tabs={tabs.filter(
                        (tab) => tab.id === 'account' || tab.id === 'preferences',
                      )}
                    />
                  </>
                ) : (
                  <>
                    <div className="grid gap-0.5">
                      {sections.main.map((tab) => (
                        <SidebarLink
                          key={tab.to}
                          tab={tab}
                          onNavigate={() => setMenuOpen(false)}
                        />
                      ))}
                    </div>
                    <NavSection
                      label={t('nav.sectionWork')}
                      tabs={sections.work}
                      onNavigate={() => setMenuOpen(false)}
                    />
                    <NavSection
                      label={t('nav.sectionTeam')}
                      tabs={sections.team}
                      onNavigate={() => setMenuOpen(false)}
                    />
                    <NavSection
                      label={t('nav.sectionAccount')}
                      tabs={sections.account}
                      onNavigate={() => setMenuOpen(false)}
                    />
                  </>
                )}
              </div>
              <button
                type="button"
                className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-2.5 text-sm font-semibold text-[#5c6573] hover:bg-[#f4f5f7] hover:text-[#c54545]"
                onClick={signOut}
              >
                <LogOut className="size-4" />
                {t('auth.logout')}
              </button>
            </nav>
          </div>
        </div>
      ) : null}

      <nav
        className="fixed inset-x-0 bottom-0 z-50 px-1 pt-1 lg:hidden"
        style={{ paddingBottom: 'max(0.35rem, env(safe-area-inset-bottom))' }}
        aria-label={t('nav.workspace')}
      >
        <ul className="grid grid-cols-5 gap-0.5">
          {mobileBar.map((tab) => (
            <li key={tab.to} className="min-w-0">
              <SidebarLink tab={tab} compact />
            </li>
          ))}
          <li className="min-w-0">
            <button
              type="button"
              className={navClass(menuOpen || moreActive, true)}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
              <span>{menuOpen ? t('nav.close') : t('nav.more')}</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
