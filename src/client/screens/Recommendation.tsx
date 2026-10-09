import { useEffect, useState } from 'react';
import { FEEDBACK_LABELS, FEEDBACK_REASONS, type FeedbackReason } from '../../core/feedback';
import type { RecommendResponse } from '../../shared/api';
import { api, ApiRequestError, isDebug } from '../api';
import { DebugDrawer } from '../components/DebugDrawer';
import { RecommendationCard } from '../components/RecommendationCard';

interface Props {
  sessionId: string;
  force: boolean;
  onStartOver: () => void;
}

export function Recommendation({ sessionId, force, onStartOver }: Props) {
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | undefined>();

  const load = async (fn: () => Promise<RecommendResponse>) => {
    setBusy(true);
    setError(undefined);
    try {
      setResult(await fn());
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not make a dishision. Try again.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load(() => api.recommend(sessionId, force));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const feedback = (reason: FeedbackReason) => load(() => api.feedback(sessionId, reason));

  return (
    <div className="mt-10 space-y-6">
      {busy && !result ? <p className="text-center text-stone-500">Making a dishision…</p> : null}
      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {result?.primary ? <RecommendationCard rec={result.primary} /> : null}
      {result && !result.primary ? (
        <section className="rounded-2xl bg-white p-6 ring-1 ring-stone-200">
          <h2 className="text-xl font-semibold">No match.</h2>
          <p className="mt-2 text-stone-700">{result.message}</p>
        </section>
      ) : null}

      {result?.primary ? (
        <section>
          <p className="mb-2 text-sm text-stone-500">Not it? Tell me why and I will pick again.</p>
          <div className="flex flex-wrap gap-2">
            {FEEDBACK_REASONS.map((reason) => (
              <button key={reason} type="button" disabled={busy} onClick={() => feedback(reason)} className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-sm hover:border-stone-500 disabled:opacity-50">
                {FEEDBACK_LABELS[reason]}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {result?.runnerUp ? <RecommendationCard rec={result.runnerUp} secondary /> : null}

      <button type="button" className="text-sm text-stone-600 hover:underline" onClick={onStartOver}>
        Start over
      </button>

      {isDebug && result ? <DebugDrawer title="recommendation" data={{ debug: result.debug, primaryTrace: result.primary?.trace, runnerUpTrace: result.runnerUp?.trace }} /> : null}
    </div>
  );
}
