import {
  CalendarRange,
  Home,
  Library,
  ListChecks,
  LogOut,
  Menu,
  NotebookPen,
  Settings2,
  Shield,
  UserRound,
  X,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { DeadlineBell } from '@/components/deadline-bell';
import { useCurrentUser, useLogout } from '@/features/auth/use-account';
import { homePathFor, isRoleHome } from '@/features/navigation/home-path';
import { apiErrorMessage, apiFetch } from '@/services/api';
import { cn } from '@/lib/utils';

const catalog = [
  { id: 'home', label: 'nav.home', icon: Home, end: true },
  { id: 'conferences', to: '/workspace/conferences', label: 'nav.conferences', icon: Library, end: false },
  { id: 'submissions', to: '/workspace/submissions', label: 'nav.submissions', icon: NotebookPen, end: false },
  { id: 'reviews', to: '/workspace/reviews', label: 'nav.reviews', icon: Shield, end: false },
  { id: 'followUp', to: '/workspace/follow-up', label: 'nav.followUp', icon: ListChecks, end: false },
  { id: 'program', to: '/workspace/program', label: 'nav.program', icon: CalendarRange, end: false },
  { id: 'account', to: '/workspace/account', label: 'auth.profileTitle', icon: UserRound, end: false },
  { id: 'preferences', to: '/workspace/preferences', label: 'nav.preferences', icon: Settings2, end: false },
] as const;

function tabsFor(home: string) {
  const audience = home.endsWith('/reviewer')
    ? 'reviewer'
    : home.endsWith('/author')
      ? 'author'
      : 'chair';
  const hidden = new Set(
    audience === 'reviewer'
      ? ['submissions', 'followUp', 'program']
      : audience === 'author'
        ? ['reviews']
        : ['submissions'],
  );
  return catalog
    .filter((tab) => !hidden.has(tab.id))
    .map((tab) => (tab.id === 'home' ? { ...tab, to: home } : tab));
}

function navClass(isActive: boolean, compact = false) {
  return cn(
    'flex items-center gap-3 rounded-2xl font-bold no-underline',
    compact
      ? 'w-full min-w-0 flex-col gap-1 overflow-hidden px-1 py-1 text-center text-[11px] leading-tight'
      : 'px-3 py-2.5 text-sm',
    isActive ? 'bg-[#5d74ff]/15 text-[#3d4fd4]' : 'text-[#5c6578] hover:bg-[#eef2ff] hover:text-[#3d4fd4]',
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
    memberships.data?.filter((item) => item.membershipStatus === 'ACTIVE').map((item) => item.role) ??
    [];
  const home = memberships.isSuccess ? homePathFor(roles) : '/workspace/author';
  const tabs = tabsFor(home);
  const mobileBar = tabs.slice(0, 4);
  const mobileMore = tabs.slice(4);
  const displayName = account.data
    ? `${account.data.profile.firstName} ${account.data.profile.lastName}`
    : t('top.guest');
  const moreActive = mobileMore.some((tab) => location.pathname.startsWith(tab.to));
  const onHome = isRoleHome(location.pathname);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  function signOut() {
    void logout.mutateAsync().then(() => navigate('/login'));
  }

  return (
    <div className="min-h-screen bg-[#f3f6fb] text-[#1c2744]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-4 focus:rounded-full focus:bg-white focus:px-3 focus:py-2"
      >
        {t('nav.skip')}
      </a>
      <div className="grid min-h-screen w-full grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden h-screen flex-col border-r border-[#e6e8ec] bg-white p-5 lg:sticky lg:top-0 lg:flex">
          <p className="px-2 text-lg font-extrabold tracking-tight text-[#3d4fd4]">{t('brand.name')}</p>
          <nav className="mt-12 flex flex-1 flex-col gap-1" aria-label={t('nav.workspace')}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) => navClass(isActive)}
                >
                  <Icon className="size-4" />
                  {t(tab.label)}
                </NavLink>
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
        <div className="min-w-0 w-full p-3 pb-24 sm:p-4 lg:p-6">
          <header className="mb-4 flex items-center justify-between gap-3">
            <p className="text-lg font-extrabold tracking-tight text-[#3d4fd4] lg:hidden">{t('brand.name')}</p>
            <div className="ml-auto flex items-center gap-3">
              <DeadlineBell />
              {onHome ? null : (
                <>
                  {account.data?.profile.photoPath ? (
                    <img src={account.data.profile.photoPath} alt="" className="size-9 rounded-full object-cover" />
                  ) : (
                    <span className="grid size-9 place-items-center rounded-full bg-white text-sm font-extrabold">
                      {displayName.slice(0, 1)}
                    </span>
                  )}
                  <span className="hidden min-w-0 sm:block">
                    <span className="block truncate text-sm font-extrabold">{displayName}</span>
                    <span className="block truncate text-xs text-[#8b909a]">{account.data?.email}</span>
                  </span>
                </>
              )}
            </div>
          </header>
          <main id="main-content" className="min-w-0">
            <Outlet />
          </main>
        </div>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#243044]/30"
            aria-label={t('nav.close')}
            onClick={() => setMenuOpen(false)}
          />
          <div
            role="dialog"
            aria-label={t('nav.workspace')}
            className="absolute inset-x-3 bottom-24 rounded-2xl border border-[#e6e8ec] bg-white p-3 shadow-[0_12px_32px_rgba(28,36,48,0.12)]"
          >
            <nav className="grid gap-1" aria-label={t('nav.workspace')}>
              {mobileMore.map((tab) => {
                const Icon = tab.icon;
                return (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    className={({ isActive }) => navClass(isActive)}
                  >
                    <Icon className="size-4" />
                    {t(tab.label)}
                  </NavLink>
                );
              })}
            </nav>
            <button
              type="button"
              className="mt-1 flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-[#5c6573] hover:bg-[#f4f5f7]"
              onClick={signOut}
            >
              <LogOut className="size-4" />
              {t('auth.logout')}
            </button>
          </div>
        </div>
      ) : null}

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-[#e6e8ec] bg-white px-2 pt-2 lg:hidden"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        aria-label={t('nav.workspace')}
      >
        <ul className="grid grid-cols-5">
          {mobileBar.map((tab) => {
            const Icon = tab.icon;
            return (
              <li key={tab.to}>
                <NavLink
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) => navClass(isActive, true)}
                >
                  <Icon className="size-5 shrink-0" />
                  <span className="max-w-full truncate">{t(tab.label)}</span>
                </NavLink>
              </li>
            );
          })}
          <li>
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
