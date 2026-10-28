import { useTranslation } from 'react-i18next';

type RoleTone = 'author' | 'reviewer' | 'chair' | 'admin' | 'committee' | 'session' | 'system';

const tones: Record<RoleTone, string> = {
  author: 'border-[#d7def8] bg-[#f4f6ff]',
  reviewer: 'border-[#d7e8f8] bg-[#f0f7ff]',
  chair: 'border-[#d7def8] bg-[#f4f6ff]',
  admin: 'border-[#cfe9da] bg-[#f2fbf6]',
  committee: 'border-[#f0d9b5] bg-[#fff8ee]',
  session: 'border-[#ddd6f3] bg-[#f7f4ff]',
  system: 'border-[#e4e7ee] bg-[#f8f9fc]',
};

const badgeTones: Record<RoleTone, string> = {
  author: 'bg-[#eef2ff] text-[#3d4fd4]',
  reviewer: 'bg-[#e8f1ff] text-[#2b6cb0]',
  chair: 'bg-[#eef2ff] text-[#3d4fd4]',
  admin: 'bg-[#e8f8ef] text-[#1f7a4d]',
  committee: 'bg-[#fff4e5] text-[#9a5b00]',
  session: 'bg-[#efeaff] text-[#5b4bb5]',
  system: 'bg-[#eef1f6] text-[#3d4659]',
};

export function RoleContextBanner({
  role,
  title,
  hint,
}: {
  role: RoleTone;
  title: string;
  hint?: string;
}) {
  const { t } = useTranslation();
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tones[role]}`} role="status">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-extrabold text-[#1c2744]">{t('home.youAreHere')}</p>
        <span
          className={`rounded-lg px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-[0.04em] ${badgeTones[role]}`}
        >
          {title}
        </span>
      </div>
      {hint ? (
        <p className="mt-1.5 text-sm font-semibold text-[#5c6578]">{hint}</p>
      ) : null}
    </div>
  );
}
