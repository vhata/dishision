export type Intensity = 0.5 | 1;

export function cycleIntensity(current: Intensity | undefined): Intensity | undefined {
  if (current === undefined) return 0.5;
  if (current === 0.5) return 1;
  return undefined;
}

interface Props {
  options: { id: string; label: string }[];
  mode: 'single' | 'multi';
  value: Map<string, Intensity>;
  onChange: (next: Map<string, Intensity>) => void;
  disabled?: boolean;
}

const base = 'rounded-full border px-4 py-2 text-sm transition select-none';
const styles: Record<'none' | '0.5' | '1', string> = {
  none: 'border-stone-300 bg-white text-stone-800 hover:border-stone-500',
  '0.5': 'border-amber-400 bg-amber-100 text-amber-900',
  '1': 'border-amber-700 bg-amber-600 text-white font-medium',
};

export function ChipGroup({ options, mode, value, onChange, disabled }: Props) {
  const tap = (id: string) => {
    const next = new Map(value);
    if (mode === 'single') {
      const wasSelected = next.has(id);
      next.clear();
      if (!wasSelected) next.set(id, 1);
    } else {
      const cycled = cycleIntensity(next.get(id));
      if (cycled === undefined) next.delete(id);
      else next.set(id, cycled);
    }
    onChange(next);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const intensity = value.get(o.id);
        const key = intensity === undefined ? 'none' : (String(intensity) as '0.5' | '1');
        return (
          <button
            key={o.id}
            type="button"
            disabled={disabled}
            aria-pressed={intensity !== undefined}
            onClick={() => tap(o.id)}
            className={`${base} ${styles[key]}`}
          >
            {o.label}
            {mode === 'multi' && intensity === 1 ? <span className="ml-1 text-xs uppercase tracking-wide">really</span> : null}
          </button>
        );
      })}
    </div>
  );
}
