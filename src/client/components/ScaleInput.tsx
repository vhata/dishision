interface Props {
  stops: string[];
  value: number | undefined;
  onChange: (stop: number) => void;
  disabled?: boolean;
}

export function ScaleInput({ stops, value, onChange, disabled }: Props) {
  return (
    <div role="radiogroup" className="grid grid-cols-5 gap-1">
      {stops.map((label, i) => {
        const selected = value === i;
        return (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            disabled={disabled}
            onClick={() => onChange(i)}
            className={`flex flex-col items-center gap-2 rounded-lg border p-2 text-center text-xs ${
              selected ? 'border-amber-700 bg-amber-600 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-500'
            }`}
          >
            <span className={`h-3 w-3 rounded-full ${selected ? 'bg-white' : 'bg-stone-300'}`} />
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
