import { useState } from 'react';

export function DebugDrawer({ title, data }: { title: string; data: unknown }) {
  const [open, setOpen] = useState(true);
  return (
    <aside className="mt-8 rounded-xl border border-dashed border-stone-400 bg-stone-100 p-3 text-xs">
      <button type="button" className="font-mono font-semibold" onClick={() => setOpen((v) => !v)}>
        {open ? 'v' : '>'} {title}
      </button>
      {open ? <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap">{JSON.stringify(data, null, 2)}</pre> : null}
    </aside>
  );
}
