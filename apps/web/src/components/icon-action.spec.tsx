import { render, screen } from '@testing-library/react';
import { Pencil } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { IconAction } from '@/components/icon-action';

describe('IconAction', () => {
  it('exposes an accessible label on the button', () => {
    const onClick = vi.fn();
    render(<IconAction icon={Pencil} label="Modifier" onClick={onClick} />);
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeTruthy();
  });
});
