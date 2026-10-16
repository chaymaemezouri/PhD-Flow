import { beforeEach, describe, expect, it } from 'vitest';
import { PAPERS_LAYOUT_KEY, readPapersLayout, writePapersLayout } from './papers-layout';

describe('papers layout preference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to cards', () => {
    expect(readPapersLayout()).toBe('cards');
  });

  it('round-trips a list choice', () => {
    writePapersLayout('list');
    expect(localStorage.getItem(PAPERS_LAYOUT_KEY)).toBe('list');
    expect(readPapersLayout()).toBe('list');
  });

  it('ignores an unknown stored value', () => {
    localStorage.setItem(PAPERS_LAYOUT_KEY, 'masonry');
    expect(readPapersLayout()).toBe('cards');
  });
});
