import { useState } from 'react';

interface Props {
  busy: boolean;
  error?: string;
  onStart: (body: { zip: string } | { lat: number; lng: number }) => void;
}

export function Landing({ busy, error, onStart }: Props) {
  const [zip, setZip] = useState('');
  const [geoError, setGeoError] = useState<string | undefined>();
  const valid = /^\d{5}$/.test(zip);

  const useLocation = () => {
    if (!navigator.geolocation) return setGeoError('Location is not available in this browser.');
    navigator.geolocation.getCurrentPosition(
      (pos) => onStart({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setGeoError('Could not read your location. A ZIP code works too.'),
    );
  };

  return (
    <section className="mt-16 text-center">
      <h1 className="text-5xl font-semibold tracking-tight">Dishision</h1>
      <p className="mt-2 text-lg text-stone-600">Make a dishision.</p>
      <p className="mx-auto mt-6 max-w-md text-stone-700">
        You know you need dinner. You do not know what you want. A few quick questions about how dinner should feel, and you get one specific order.
      </p>
      <form
        className="mx-auto mt-8 flex max-w-sm gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onStart({ zip });
        }}
      >
        <input
          inputMode="numeric"
          placeholder="ZIP code"
          className="flex-1 rounded-full border border-stone-300 px-4 py-2"
          value={zip}
          onChange={(e) => setZip(e.target.value.replace(/\D/g, '').slice(0, 5))}
        />
        <button type="submit" disabled={!valid || busy} className="rounded-full bg-amber-600 px-5 py-2 font-medium text-white disabled:opacity-50">
          Start
        </button>
      </form>
      <button type="button" className="mt-3 text-sm text-stone-600 hover:underline" onClick={useLocation} disabled={busy}>
        Use my location instead
      </button>
      {geoError || error ? <p className="mt-4 text-sm text-red-700">{geoError ?? error}</p> : null}
    </section>
  );
}
