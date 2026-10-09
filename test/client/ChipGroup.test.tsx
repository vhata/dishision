import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChipGroup, cycleIntensity } from '../../src/client/components/ChipGroup';

afterEach(cleanup);

const options = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Beta' },
];

describe('cycleIntensity', () => {
  it('cycles none -> 0.5 -> 1 -> none', () => {
    expect(cycleIntensity(undefined)).toBe(0.5);
    expect(cycleIntensity(0.5)).toBe(1);
    expect(cycleIntensity(1)).toBeUndefined();
  });
});

describe('ChipGroup multi', () => {
  it('reports the cycled intensity for the tapped chip only', () => {
    const onChange = vi.fn();
    render(<ChipGroup mode="multi" options={options} value={new Map([['b', 0.5]])} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    expect(onChange).toHaveBeenCalledWith(new Map([['b', 0.5], ['a', 0.5]]));
    fireEvent.click(screen.getByRole('button', { name: /beta/i }));
    expect(onChange).toHaveBeenLastCalledWith(new Map([['b', 1]]));
  });

  it('exposes selection state with aria-pressed and a "really" marker at intensity 1', () => {
    render(<ChipGroup mode="multi" options={options} value={new Map([['a', 1]])} onChange={() => {}} />);
    const alpha = screen.getByRole('button', { name: /alpha/i });
    expect(alpha.getAttribute('aria-pressed')).toBe('true');
    expect(alpha.textContent).toMatch(/really/i);
    expect(screen.getByRole('button', { name: /beta/i }).getAttribute('aria-pressed')).toBe('false');
  });
});

describe('ChipGroup single', () => {
  it('replaces the selection and toggles off when tapped again', () => {
    const onChange = vi.fn();
    render(<ChipGroup mode="single" options={options} value={new Map([['a', 1]])} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /beta/i }));
    expect(onChange).toHaveBeenCalledWith(new Map([['b', 1]]));
    fireEvent.click(screen.getByRole('button', { name: /alpha/i }));
    expect(onChange).toHaveBeenLastCalledWith(new Map());
  });
});
