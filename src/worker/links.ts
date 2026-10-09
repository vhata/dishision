import type { RestaurantSummary } from '../core/types';
import type { OrderLinks } from '../shared/api';

export function orderLinks(r: RestaurantSummary): OrderLinks {
  const q = encodeURIComponent(r.name);
  return {
    website: r.websiteUri,
    maps: r.mapsUri,
    doordash: `https://www.doordash.com/search/store/${q}/`,
    ubereats: `https://www.ubereats.com/search?q=${q}`,
  };
}
