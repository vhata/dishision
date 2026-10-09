import { useEffect, useState } from 'react';
import type { SessionDto } from '../shared/api';
import { api, ApiRequestError, isDebug } from './api';
import { DebugDrawer } from './components/DebugDrawer';
import { Conversation } from './screens/Conversation';
import { Landing } from './screens/Landing';
import { Recommendation } from './screens/Recommendation';

function sessionIdFromHash(): string | undefined {
  const m = window.location.hash.match(/^#s=([0-9a-f-]+)$/i);
  return m?.[1];
}

export function App() {
  const [session, setSession] = useState<SessionDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [forceDecide, setForceDecide] = useState(false);

  useEffect(() => {
    const id = sessionIdFromHash();
    if (!id) return;
    api.getSession(id).then(setSession).catch(() => window.history.replaceState(null, '', ' '));
  }, []);

  const update = (s: SessionDto) => {
    setSession(s);
    window.location.hash = `s=${s.id}`;
  };

  const start = async (body: { zip: string } | { lat: number; lng: number }) => {
    setBusy(true);
    setError(undefined);
    try {
      update(await api.createSession(body));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not start. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setSession(null);
    setForceDecide(false);
    window.history.replaceState(null, '', ' ');
  };

  return (
    <main className="mx-auto max-w-xl px-4 pb-16">
      {session ? (
        <header className="flex items-center justify-between pt-6 text-sm text-stone-500">
          <button type="button" className="font-semibold text-stone-800" onClick={reset}>
            Dishision
          </button>
          <span>{session.zipLabel}</span>
        </header>
      ) : null}

      {!session ? <Landing busy={busy} error={error} onStart={start} /> : null}
      {session?.status === 'asking' && !forceDecide ? <Conversation session={session} onUpdate={update} onDecide={() => setForceDecide(true)} /> : null}
      {session && (session.status !== 'asking' || forceDecide) ? (
        <Recommendation sessionId={session.id} force={forceDecide} onStartOver={reset} />
      ) : null}

      {isDebug && session?.debug ? <DebugDrawer title="session" data={session.debug} /> : null}
    </main>
  );
}
