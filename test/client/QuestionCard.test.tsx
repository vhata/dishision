import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuestionCard } from '../../src/client/components/QuestionCard';
import type { QuestionDto } from '../../src/shared/api';

afterEach(cleanup);

const question: QuestionDto = {
  nodeId: 'hunger',
  kind: 'single',
  prompt: 'How hungry?',
  options: [
    { id: 'light', label: 'Light' },
    { id: 'starving', label: 'Starving' },
  ],
  allowMissingOption: false,
  round: 1,
};

const skipAnswer = { kind: 'single', nodeId: 'hunger' };

function renderCard() {
  const onSubmit = vi.fn(async () => {});
  const onSuggest = async () => {};
  const { rerender } = render(<QuestionCard question={question} busy={false} onSubmit={onSubmit} onSuggest={onSuggest} />);
  const setBusy = (busy: boolean) => rerender(<QuestionCard question={question} busy={busy} onSubmit={onSubmit} onSuggest={onSuggest} />);
  return { onSubmit, setBusy };
}

function typeOther(text: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Other' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
}

describe('QuestionCard skip', () => {
  it('skips at once when nothing is typed in Other', () => {
    const { onSubmit } = renderCard();
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onSubmit).toHaveBeenCalledWith(skipAnswer);
    expect(screen.queryByRole('button', { name: 'Discard and skip' })).toBeNull();
  });

  it('skips at once when Other holds only whitespace', () => {
    const { onSubmit } = renderCard();
    typeOther('   ');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onSubmit).toHaveBeenCalledWith(skipAnswer);
  });

  it('asks before discarding typed Other text, and skips when confirmed', () => {
    const { onSubmit } = renderCard();
    typeOther('had pho on Sunday');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onSubmit).not.toHaveBeenCalled();

    const prompt = screen.getByRole('group', { name: /discard what you typed in other/i });
    expect(prompt).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep editing' }));

    fireEvent.click(screen.getByRole('button', { name: 'Discard and skip' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith(skipAnswer);
  });

  it('keeps the text and the card when the diner keeps editing', () => {
    const { onSubmit } = renderCard();
    typeOther('had pho on Sunday');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByRole('group', { name: /discard what you typed in other/i })).toBeNull();
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('had pho on Sunday');
    expect(document.activeElement).toBe(textarea);
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();
  });

  it('asks about text typed in a collapsed Other box and reopens it to keep editing', () => {
    const { onSubmit } = renderCard();
    typeOther('salmon sounds great');
    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    expect(screen.queryByRole('textbox')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('salmon sounds great');
  });

  it('disables both prompt buttons while an answer is in flight', () => {
    const { setBusy } = renderCard();
    typeOther('had pho on Sunday');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    setBusy(true);
    expect((screen.getByRole('button', { name: 'Discard and skip' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Keep editing' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('drops the prompt when the Other text is cleared, and does not bring it back on typing', () => {
    const { onSubmit } = renderCard();
    typeOther('had pho on Sunday');
    fireEvent.click(screen.getByRole('button', { name: 'Skip' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  ' } });

    expect(screen.queryByRole('group', { name: /discard what you typed in other/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Skip' })).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'salmon' } });
    expect(screen.queryByRole('group', { name: /discard what you typed in other/i })).toBeNull();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
