export type PapersLayout = 'cards' | 'list';

export const PAPERS_LAYOUT_KEY = 'scholarflow.papersLayout';
export const SUBMISSIONS_LAYOUT_KEY = 'scholarflow.submissionsLayout';

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

export function readSubmissionsLayout(): PapersLayout {
  try {
    const raw = localStorage.getItem(SUBMISSIONS_LAYOUT_KEY);
    return raw === 'cards' || raw === 'list' ? raw : 'list';
  } catch {
    return 'list';
  }
}

export function writeSubmissionsLayout(layout: PapersLayout): void {
  localStorage.setItem(SUBMISSIONS_LAYOUT_KEY, layout);
}
