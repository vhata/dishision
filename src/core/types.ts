export const SCORE_KEYS = [
  'comforting', 'fresh', 'rich', 'spicy', 'savory', 'brightAcidic', 'brothy', 'crispy',
  'proteinForward', 'carbHeavy', 'adventurous', 'handheld', 'portion',
] as const;
export type ScoreKey = (typeof SCORE_KEYS)[number];
/** Each 0..1. Missing means unknown. */
export type Scores = Partial<Record<ScoreKey, number>>;

export interface ItemTags {
  proteins: string[];
  carbs: string[];
  cuisine?: string;
  formats: string[];
  /** Set on fixtures and lexicon hits so tests can assert categories. */
  archetypeId?: string;
}

export interface MenuItem {
  id: string;
  placeId: string;
  name: string;
  description?: string;
  priceCents?: number;
  section?: string;
  scores: Scores;
  tags: ItemTags;
  /** True for archetype placeholders used when a restaurant has no readable menu. */
  menuless?: boolean;
}

export interface RestaurantSummary {
  placeId: string;
  name: string;
  cuisine?: string;
  lat?: number;
  lng?: number;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: number;
  websiteUri?: string;
  mapsUri?: string;
  openNow?: boolean;
  delivery?: boolean;
}
