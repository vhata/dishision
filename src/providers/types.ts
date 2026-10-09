import type { z } from 'zod';
import type { KnowledgeBase } from '../core/kb/schema';
import type { DinnerPreferences } from '../core/preferences';
import type { MenuItem, RestaurantSummary } from '../core/types';

export type LlmTier = 'small' | 'large';

export interface JsonRequest<T> {
  tier: LlmTier;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  /** Stable key for caching; include a prompt version. */
  cacheKey: string;
  maxTokens?: number;
}

export interface Llm {
  /** Returns null when the model fails, times out, or returns output that does not validate. */
  completeJson<T>(req: JsonRequest<T>): Promise<T | null>;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  label: string;
}

export interface Geocoder {
  geocodeZip(zip: string): Promise<GeoPoint | null>;
}

export interface CandidateQuery {
  prefs: DinnerPreferences;
  lat: number;
  lng: number;
  kb: KnowledgeBase;
}

export interface RestaurantCandidates {
  restaurant: RestaurantSummary;
  items: MenuItem[];
}

export interface CandidateSource {
  candidates(query: CandidateQuery): Promise<RestaurantCandidates[]>;
}
