import { useState } from 'react';
import type { AnswerDto, QuestionDto } from '../../shared/api';
import { ChipGroup, type Intensity } from './ChipGroup';
import { ScaleInput } from './ScaleInput';

interface Props {
  question: QuestionDto;
  busy: boolean;
  onSubmit: (answer: AnswerDto) => Promise<void>;
  onSuggest: (text: string) => Promise<void>;
}

const YESNO = [
  { id: 'yes', label: 'Yes' },
  { id: 'no', label: 'No' },
  { id: 'either', label: "Don't mind" },
];

export function QuestionCard({ question, busy, onSubmit, onSuggest }: Props) {
  const [choices, setChoices] = useState<Map<string, Intensity>>(new Map());
  const [stop, setStop] = useState<number | undefined>(undefined);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherText, setOtherText] = useState('');
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestText, setSuggestText] = useState('');
  const [suggested, setSuggested] = useState(false);

  const other = otherText.trim() ? otherText.trim() : undefined;

  const buildAnswer = (): AnswerDto => {
    const nodeId = question.nodeId;
    switch (question.kind) {
      case 'single':
        return { kind: 'single', nodeId, optionId: [...choices.keys()][0], otherText: other };
      case 'multi':
        return { kind: 'multi', nodeId, selections: [...choices.entries()].map(([optionId, intensity]) => ({ optionId, intensity })), otherText: other };
      case 'scale':
        return { kind: 'scale', nodeId, stop: stop as 0 | 1 | 2 | 3 | 4 | undefined, otherText: other };
      case 'yesno':
        return { kind: 'yesno', nodeId, value: [...choices.keys()][0] as 'yes' | 'no' | 'either' | undefined, otherText: other };
    }
  };

  const skipAnswer = (): AnswerDto =>
    question.kind === 'multi' ? { kind: 'multi', nodeId: question.nodeId, selections: [] } : ({ kind: question.kind, nodeId: question.nodeId } as AnswerDto);

  const submitSuggestion = async () => {
    if (suggestText.trim().length < 2) return;
    await onSuggest(suggestText.trim());
    setSuggested(true);
    setSuggestOpen(false);
  };

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200">
      <h2 className="text-xl font-semibold">{question.prompt}</h2>
      {question.help ? <p className="mt-1 text-sm text-stone-500">{question.help}</p> : null}

      <div className="mt-5">
        {question.kind === 'scale' && question.stops ? (
          <ScaleInput stops={question.stops} value={stop} onChange={setStop} disabled={busy} />
        ) : question.kind === 'yesno' ? (
          <ChipGroup mode="single" options={YESNO} value={choices} onChange={setChoices} disabled={busy} />
        ) : (
          <ChipGroup mode={question.kind === 'multi' ? 'multi' : 'single'} options={question.options} value={choices} onChange={setChoices} disabled={busy} />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
        <button type="button" className="text-stone-600 underline-offset-2 hover:underline" onClick={() => setOtherOpen((v) => !v)}>
          Other
        </button>
        {question.allowMissingOption ? (
          suggested ? (
            <span className="text-stone-500">Thanks, noted for review.</span>
          ) : (
            <button type="button" className="text-stone-600 underline-offset-2 hover:underline" onClick={() => setSuggestOpen((v) => !v)}>
              Missing an option?
            </button>
          )
        ) : null}
      </div>

      {otherOpen ? (
        <textarea
          className="mt-3 w-full rounded-lg border border-stone-300 p-3 text-sm"
          rows={2}
          maxLength={500}
          placeholder="Say it your way. Example: had pho on Sunday, salmon sounds great."
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
        />
      ) : null}

      {suggestOpen ? (
        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-lg border border-stone-300 p-2 text-sm"
            maxLength={80}
            placeholder="An option we should have listed"
            value={suggestText}
            onChange={(e) => setSuggestText(e.target.value)}
          />
          <button type="button" className="rounded-lg bg-stone-800 px-3 text-sm text-white" onClick={submitSuggestion}>
            Send
          </button>
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <button type="button" className="text-sm text-stone-500 hover:underline" disabled={busy} onClick={() => onSubmit(skipAnswer())}>
          Skip
        </button>
        <button type="button" className="rounded-full bg-amber-600 px-5 py-2 font-medium text-white disabled:opacity-50" disabled={busy} onClick={() => onSubmit(buildAnswer())}>
          Continue
        </button>
      </div>
    </section>
  );
}
