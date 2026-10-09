import type { RecommendationDto } from '../../shared/api';

const price = (cents?: number) => (cents === undefined ? '' : `$${(cents / 100).toFixed(2)}`);

export function RecommendationCard({ rec, secondary = false }: { rec: RecommendationDto; secondary?: boolean }) {
  const total = rec.items.reduce((n, i) => n + (i.priceCents ?? 0), 0);
  return (
    <article className={secondary ? 'rounded-xl bg-stone-100 p-4 ring-1 ring-stone-200' : 'rounded-2xl bg-white p-6 shadow-sm ring-1 ring-stone-200'}>
      <p className="text-xs uppercase tracking-wide text-stone-500">{secondary ? 'Runner-up' : 'Tonight'}</p>
      <h2 className={secondary ? 'mt-1 text-lg font-semibold' : 'mt-1 text-2xl font-semibold'}>{rec.items.map((i) => i.name).join(' + ')}</h2>
      <p className="text-stone-600">
        {rec.restaurant.name}
        {rec.restaurant.rating !== undefined ? ` · ${rec.restaurant.rating.toFixed(1)} stars` : ''}
        {rec.restaurant.openNow === false ? ' · closed now' : ''}
      </p>
      {rec.menuless ? <p className="mt-2 inline-block rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Menu not read yet</p> : null}

      <ul className="mt-4 space-y-2">
        {rec.items.map((i) => (
          <li key={i.id} className="flex items-baseline justify-between gap-4">
            <div>
              <p className="font-medium">{i.name}</p>
              {i.description ? <p className="text-sm text-stone-600">{i.description}</p> : null}
            </div>
            <span className="shrink-0 text-sm text-stone-700">{price(i.priceCents)}</span>
          </li>
        ))}
      </ul>
      {rec.items.length > 1 && total > 0 ? <p className="mt-2 text-right text-sm text-stone-500">Together {price(total)}</p> : null}

      <p className={`mt-4 ${secondary ? 'text-sm text-stone-700' : 'text-stone-800'}`}>{rec.explanation}</p>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {rec.links.website ? <a className="rounded-full bg-stone-800 px-4 py-1.5 text-white" href={rec.links.website} target="_blank" rel="noreferrer">View restaurant</a> : null}
        {rec.links.maps ? <a className="rounded-full border border-stone-300 px-4 py-1.5" href={rec.links.maps} target="_blank" rel="noreferrer">Google Maps</a> : null}
        <a className="rounded-full border border-stone-300 px-4 py-1.5" href={rec.links.doordash} target="_blank" rel="noreferrer">Find on DoorDash</a>
        <a className="rounded-full border border-stone-300 px-4 py-1.5" href={rec.links.ubereats} target="_blank" rel="noreferrer">Find on Uber Eats</a>
      </div>
    </article>
  );
}
