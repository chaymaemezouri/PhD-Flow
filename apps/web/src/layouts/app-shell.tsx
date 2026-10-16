import {
  CalendarRange,
  ClipboardList,
  Home,
  KeyRound,
  Library,
  ListChecks,
  LogOut,
  Menu,
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
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { DeadlineBell } from '@/components/deadline-bell';
import { useCurrentUser, useLogout } from '@/features/auth/use-account';
import { homePathFor, isRoleHome } from '@/features/navigation/home-path';
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

function tabsFor(home: string): NavTab[] {
  const audience = home.endsWith('/system')
    ? 'system'
    : home.endsWith('/reviewer')
      ? 'reviewer'
      : home.endsWith('/author')
        ? 'author'
        : 'chair';

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

  const hidden = new Set(
    audience === 'reviewer'
      ? ['followUp', 'program']
      : audience === 'author'
        ? ['reviews']
        : [],
  );
  return catalog.filter((tab) => !hidden.has(tab.id));
}

function navClass(isActive: boolean, compact = false) {
  return cn(
    'flex items-center gap-3 rounded-2xl font-bold no-underline',
    compact
      ? 'w-full min-w-0 flex-col gap-0.5 overflow-hidden px-0.5 py-1.5 text-center text-[9px] leading-tight sm:gap-1 sm:px-1 sm:py-2 sm:text-[10px]'
      : 'min-h-8 px-2 py-1 text-[11px] lg:min-h-9 lg:px-2.5 lg:py-1.5 lg:text-xs',
    isActive
      ? 'bg-[#5d74ff]/15 text-[#3d4fd4]'
      : 'text-[#5c6578] hover:bg-[#eef2ff] hover:text-[#3d4fd4]',
  );
}

function MobileNavLink({ tab, onNavigate }: { tab: NavTab; onNavigate?: () => void }) {
  const { t } = useTranslation();
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.to}
      end={tab.end}
      onClick={onNavigate}
      className={({ isActive }) => navClass(isActive)}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{t(tab.label)}</span>
    </NavLink>
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
      return response.json() as Promise<{ role: string; membershipStatus: string }[]>;
    },
  });
  const roles =
    memberships.data
      ?.filter((item) => item.membershipStatus === 'ACTIVE')
      .map((item) => item.role) ?? [];
  const platformAdmin = account.data?.platformRole === 'SYSTEM_ADMIN';
  const manager = roles.some((role) => role === 'CHAIR' || role === 'ADMINISTRATOR');
  const unlocked = account.data?.unlockedConferenceId ?? null;
  const home = platformAdmin
    ? '/workspace/system'
    : manager && !unlocked
      ? '/workspace/conference-access'
      : memberships.isSuccess
        ? homePathFor(roles)
        : '/workspace/author';
  const tabs = tabsFor(home).map((tab) =>
    tab.id === 'conferences' && unlocked && !platformAdmin
      ? { ...tab, to: `/workspace/conferences/${unlocked}` }
      : tab,
  );
  const gate =
    account.isSuccess &&
    manager &&
    !platformAdmin &&
    !unlocked &&
    memberships.isSuccess &&
    location.pathname !== '/workspace/conference-access';
  const mobileBar = tabs.slice(0, 4);
  const mobileMore = tabs.slice(4);
  const displayName = account.data
    ? `${account.data.profile.firstName} ${account.data.profile.lastName}`
    : t('top.guest');
  const moreActive = mobileMore.some((tab) =>
    tab.end ? location.pathname === tab.to : location.pathname.startsWith(tab.to),
  );
  const onHome = isRoleHome(location.pathname);
  const platformSection = location.pathname.startsWith('/workspace/system/');

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

  if (gate) {
    return <Navigate to="/workspace/conference-access" replace />;
  }

  return (
    <div className="workspace-shell min-h-screen bg-[#f3f6fb] text-[#1c2744]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-4 focus:rounded-full focus:bg-white focus:px-3 focus:py-2"
      >
        {t('nav.skip')}
      </a>
      <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-[175px_minmax(0,1fr)]">
        <aside className="hidden h-screen flex-col border-r border-[#e6e8ec] bg-white p-2 lg:sticky lg:top-0 lg:flex">
          <p className="px-1 text-[11px] font-extrabold tracking-tight text-[#3d4fd4]">
            {t('brand.name')}
          </p>
          {platformAdmin ? (
            <p className="mt-1 px-2 text-xs font-bold uppercase tracking-wide text-[#8b909a]">
              {t('superadmin.sidebarLabel')}
            </p>
          ) : null}
          <nav
            className="sidebar-nav mt-14 flex flex-1 flex-col gap-0.5 overflow-y-auto"
            aria-label={t('nav.workspace')}
          >
            {tabs.map((tab, index) => {
              const Icon = tab.icon;
              const showDivider =
                platformAdmin && (tab.id === 'submissions' || tab.id === 'account');
              return (
                <div key={tab.to}>
                  {showDivider ? (
                    <div className="my-1.5 border-t border-[#eef1f8]" aria-hidden />
                  ) : null}
                  {platformAdmin && index === 0 ? (
                    <p className="mb-1 px-2.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#9aa3b5]">
                      {t('superadmin.navPlatform')}
                    </p>
                  ) : null}
                  {platformAdmin && tab.id === 'submissions' ? (
                    <p className="mb-1 px-2.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#9aa3b5]">
                      {t('superadmin.navContent')}
                    </p>
                  ) : null}
                  {platformAdmin && tab.id === 'account' ? (
                    <p className="mb-1 px-2.5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#9aa3b5]">
                      {t('superadmin.navAccount')}
                    </p>
                  ) : null}
                  <NavLink
                    to={tab.to}
                    end={tab.end}
                    className={({ isActive }) => navClass(isActive)}
                  >
                    <Icon className="size-4 shrink-0" />
                    {t(tab.label)}
                  </NavLink>
                </div>
              );
            })}
          </nav>
          <div className="mt-4 border-t border-[#eef1f8] pt-4">
            <p className="truncate px-2 text-sm font-extrabold">{displayName}</p>
            <button
              type="button"
              className="mt-2 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-[#5c6573] hover:bg-[#f4f5f7]"
              onClick={signOut}
            >
              <LogOut className="size-4" />
              {t('auth.logout')}
            </button>
          </div>
        </aside>

        <div className="min-w-0 w-full px-1 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-1 sm:px-2 sm:pt-2 lg:p-2.5 lg:pb-2.5">
          <header className="mb-1.5 flex items-center gap-1.5 sm:mb-2">
            <button
              type="button"
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#e4e7ee] bg-white text-[#1c2744] lg:hidden"
              aria-expanded={menuOpen}
              aria-label={menuOpen ? t('nav.close') : t('nav.menu')}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
            </button>
            <p className="min-w-0 flex-1 truncate text-base font-extrabold tracking-tight text-[#3d4fd4] lg:hidden">
              {t('brand.name')}
            </p>
            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
              <DeadlineBell />
              {onHome && !platformSection ? null : (
                <>
                  {account.data?.profile.photoPath ? (
                    <img
                      src={account.data.profile.photoPath}
                      alt=""
                      className="size-9 rounded-full object-cover"
                    />
                  ) : (
                    <span className="grid size-9 place-items-center rounded-full bg-white text-sm font-extrabold">
                      {displayName.slice(0, 1)}
                    </span>
                  )}
                  <span className="hidden min-w-0 max-w-[10rem] sm:block">
                    <span className="block truncate text-sm font-extrabold">
                      {displayName}
                    </span>
                    <span className="block truncate text-xs text-[#8b909a]">
                      {account.data?.email}
                    </span>
                  </span>
                </>
              )}
            </div>
          </header>
          <main id="main-content" className="min-w-0 overflow-x-clip">
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
              {platformAdmin ? (
                <div className="grid gap-4">
                  <div>
                    <p className="mb-2 px-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#9aa3b5]">
                      {t('superadmin.navPlatform')}
                    </p>
                    <div className="grid gap-1">
                      {tabs
                        .filter((tab) =>
                          [
                            'home',
                            'sysAdmins',
                            'sysConferences',
                            'sysUsers',
                            'sysSessions',
                            'sysAudit',
                          ].includes(tab.id),
                        )
                        .map((tab) => (
                          <MobileNavLink
                            key={tab.to}
                            tab={tab}
                            onNavigate={() => setMenuOpen(false)}
                          />
                        ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 px-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#9aa3b5]">
                      {t('superadmin.navContent')}
                    </p>
                    <div className="grid gap-1">
                      {tabs
                        .filter(
                          (tab) => tab.id === 'submissions' || tab.id === 'followUp',
                        )
                        .map((tab) => (
                          <MobileNavLink
                            key={tab.to}
                            tab={tab}
                            onNavigate={() => setMenuOpen(false)}
                          />
                        ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 px-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#9aa3b5]">
                      {t('superadmin.navAccount')}
                    </p>
                    <div className="grid gap-1">
                      {tabs
                        .filter((tab) => tab.id === 'account' || tab.id === 'preferences')
                        .map((tab) => (
                          <MobileNavLink
                            key={tab.to}
                            tab={tab}
                            onNavigate={() => setMenuOpen(false)}
                          />
                        ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-1">
                  {tabs.map((tab) => (
                    <MobileNavLink
                      key={tab.to}
                      tab={tab}
                      onNavigate={() => setMenuOpen(false)}
                    />
                  ))}
                </div>
              )}
              <button
                type="button"
                className="mt-3 flex min-h-11 w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-[#5c6573] hover:bg-[#f4f5f7]"
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
        className="fixed inset-x-0 bottom-0 z-50 border-t border-[#e6e8ec] bg-white/95 px-0.5 pt-0.5 backdrop-blur lg:hidden"
        style={{ paddingBottom: 'max(0.25rem, env(safe-area-inset-bottom))' }}
        aria-label={t('nav.workspace')}
      >
        <ul className="grid grid-cols-5 gap-0">
          {mobileBar.map((tab) => {
            const Icon = tab.icon;
            return (
              <li key={tab.to} className="min-w-0">
                <NavLink
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) => navClass(isActive, true)}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="max-w-full truncate text-[9px] leading-tight sm:text-[10px]">
                    {t(tab.label)}
                  </span>
                </NavLink>
              </li>
            );
          })}
          <li className="min-w-0">
            <button
              type="button"
              className={navClass(menuOpen || moreActive, true)}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? <X className="size-4" /> : <Menu className="size-4" />}
              <span className="text-[9px] leading-tight sm:text-[10px]">
                {menuOpen ? t('nav.close') : t('nav.more')}
              </span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
