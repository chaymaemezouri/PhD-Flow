import {
  PaperWorkCard,
  PaperWorkListRow,
  type WorkPaper,
} from '@/components/paper-work-card';
import type { PapersLayout } from '@/features/papers/papers-layout';
import { useTranslation } from 'react-i18next';

export function PapersLayoutView({
  layout,
  papers,
}: {
  layout: PapersLayout;
  papers: WorkPaper[];
}) {
  const { t } = useTranslation();

  if (papers.length === 0) {
    return null;
  }

  if (layout === 'cards') {
    return (
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {papers.map((paper) => (
          <li key={paper.id} className="min-w-0">
            <PaperWorkCard paper={paper} />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <>
      <ul className="grid gap-3 md:hidden">
        {papers.map((paper) => (
          <li key={paper.id} className="min-w-0">
            <PaperWorkCard paper={paper} />
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[36rem] border-separate border-spacing-y-2 text-left">
          <thead>
            <tr className="text-xs font-extrabold uppercase tracking-wide text-[#8b909a]">
              <th className="px-3 pb-1 font-extrabold">{t('papers.colId')}</th>
              <th className="px-3 pb-1 font-extrabold">{t('papers.colTitle')}</th>
              <th className="hidden px-3 pb-1 font-extrabold lg:table-cell">
                {t('papers.colStage')}
              </th>
              <th className="hidden px-3 pb-1 font-extrabold xl:table-cell">
                {t('papers.colProgress')}
              </th>
              <th className="px-3 pb-1 font-extrabold">{t('papers.colStatus')}</th>
              <th className="px-3 pb-1 text-right font-extrabold">
                {t('papers.colOpen')}
              </th>
            </tr>
          </thead>
          <tbody>
            {papers.map((paper) => (
              <PaperWorkListRow key={paper.id} paper={paper} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
