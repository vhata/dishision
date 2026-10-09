import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScaleInput } from '../../src/client/components/ScaleInput';

afterEach(cleanup);

describe('ScaleInput', () => {
  it('renders five stops and reports the index', () => {
    const onChange = vi.fn();
    render(<ScaleInput stops={['A', 'B', 'C', 'D', 'E']} value={undefined} onChange={onChange} />);
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    fireEvent.click(screen.getByRole('radio', { name: 'C' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('marks the selected stop', () => {
    render(<ScaleInput stops={['A', 'B', 'C', 'D', 'E']} value={4} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: 'E' }).getAttribute('aria-checked')).toBe('true');
  });
});
