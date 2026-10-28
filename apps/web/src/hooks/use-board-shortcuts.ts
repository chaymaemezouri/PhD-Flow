import { useEffect } from 'react';

/**
 * j/k or ArrowDown/ArrowUp cycle an index; Enter runs onEnter when set.
 * Ignored while typing in inputs/textareas/selects or when a dialog is open.
 */
export function useBoardShortcuts({
  enabled = true,
  count,
  index,
  onIndexChange,
  onEnter,
  onPrevGroup,
  onNextGroup,
}: {
  enabled?: boolean;
  count: number;
  index: number;
  onIndexChange: (next: number) => void;
  onEnter?: () => void;
  onPrevGroup?: () => void;
  onNextGroup?: () => void;
}) {
  useEffect(() => {
    if (!enabled || count <= 0) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"][data-state="open"]')) {
        return;
      }

      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        onIndexChange(Math.min(count - 1, index + 1));
        return;
      }
      if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        onIndexChange(Math.max(0, index - 1));
        return;
      }
      if (event.key === 'Enter' && onEnter) {
        event.preventDefault();
        onEnter();
        return;
      }
      if ((event.key === '[' || event.key === 'ArrowLeft') && onPrevGroup) {
        event.preventDefault();
        onPrevGroup();
        return;
      }
      if ((event.key === ']' || event.key === 'ArrowRight') && onNextGroup) {
        event.preventDefault();
        onNextGroup();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [count, enabled, index, onEnter, onIndexChange, onNextGroup, onPrevGroup]);
}
