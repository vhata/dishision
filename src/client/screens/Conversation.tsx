import { useState } from 'react';
import type { AnswerDto, SessionDto } from '../../shared/api';
import { api, ApiRequestError } from '../api';
import { QuestionCard } from '../components/QuestionCard';

interface Props {
  session: SessionDto;
  onUpdate: (session: SessionDto) => void;
  onDecide: () => void;
}

export function Conversation({ session, onUpdate, onDecide }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const question = session.question;
  if (!question) return null;

  const submit = async (answer: AnswerDto) => {
    setBusy(true);
    setError(undefined);
    try {
      onUpdate(await api.answer(session.id, answer));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const suggest = async (text: string) => {
    try {
      await api.suggest(session.id, question.nodeId, text);
    } catch {
      /* a failed suggestion must never block the conversation */
    }
  };

  return (
    <div className="mt-10">
      <p className="mb-3 text-sm uppercase tracking-wide text-stone-500">{question.round === 1 ? 'Getting a feel for it' : 'Narrowing it down'}</p>
      <QuestionCard key={question.nodeId} question={question} busy={busy} onSubmit={submit} onSuggest={suggest} />
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      {question.round === 2 ? (
        <button type="button" className="mt-3 text-sm text-stone-500 hover:underline" onClick={onDecide}>
          Just decide
        </button>
      ) : null}
    </div>
  );
}
