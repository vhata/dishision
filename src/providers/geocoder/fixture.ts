import type { Geocoder, GeoPoint } from '../types';

/** Any five-digit ZIP resolves to the Mission District so local runs need no API key. */
export class FixtureGeocoder implements Geocoder {
  async geocodeZip(zip: string): Promise<GeoPoint | null> {
    if (!/^\d{5}$/.test(zip)) return null;
    return { lat: 37.7599, lng: -122.4148, label: zip };
  }
}
