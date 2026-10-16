export type PapersLayout = 'cards' | 'list';

export const PAPERS_LAYOUT_KEY = 'scholarflow.papersLayout';

export function readPapersLayout(): PapersLayout {
  try {
    const raw = localStorage.getItem(PAPERS_LAYOUT_KEY);
    return raw === 'list' || raw === 'cards' ? raw : 'cards';
  } catch {
    return 'cards';
  }
}

export function writePapersLayout(layout: PapersLayout): void {
  localStorage.setItem(PAPERS_LAYOUT_KEY, layout);
}
