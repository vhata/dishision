export const QUALITY_KEYS = ['comforting', 'fresh', 'rich', 'spicy', 'savory', 'brightAcidic', 'brothy', 'crispy'] as const;
export type QualityKey = (typeof QUALITY_KEYS)[number];
export const PROTEIN_KEYS = ['beef', 'chicken', 'pork', 'seafood', 'vegetarian'] as const;
export type ProteinKey = (typeof PROTEIN_KEYS)[number];
export const SEAFOOD_KEYS = ['fish', 'shellfish', 'salmon'] as const;
export type SeafoodKey = (typeof SEAFOOD_KEYS)[number];
export const BEEF_KEYS = ['thinSliced', 'steak', 'braised', 'ground'] as const;
export type BeefKey = (typeof BEEF_KEYS)[number];
export const CARB_KEYS = ['rice', 'noodles', 'bread', 'tortillas', 'starchAsMain'] as const;
export type CarbKey = (typeof CARB_KEYS)[number];

export type Hunger = 'light' | 'normal' | 'very_hungry';
export type Leftovers = 'want' | 'avoid' | 'indifferent';

export interface DinnerPreferences {
  hunger?: Hunger;
  /** Each -1 (avoid) .. 1 (want). */
  desiredQualities: Partial<Record<QualityKey, number>>;
  /** -1 light .. 1 heavy. Below -0.5 means "not heavy". */
  heaviness?: number;
  /** 1 when the user picked "no idea" on the feel question. */
  noIdea?: number;
  proteins: Partial<Record<ProteinKey, number>>;
  seafood: Partial<Record<SeafoodKey, number>>;
  beef: Partial<Record<BeefKey, number>>;
  carbs: Partial<Record<CarbKey, number>>;
  cuisines: Record<string, number>;
  /** Gut reactions to archetypes from the archetype check question. */
  archetypes: Record<string, number>;
  /** -1 familiar .. 1 adventurous. */
  novelty?: number;
  /** -1 utensils .. 1 hands. */
  handheld?: number;
  leftovers?: Leftovers;
  budget: { max?: number; flexible?: number };
  recentMeals: string[];
  futureMeals: string[];
  exclusions: string[];
  notes: string[];
}

export function emptyPreferences(): DinnerPreferences {
  return {
    desiredQualities: {},
    proteins: {},
    seafood: {},
    beef: {},
    carbs: {},
    cuisines: {},
    archetypes: {},
    budget: {},
    recentMeals: [],
    futureMeals: [],
    exclusions: [],
    notes: [],
  };
}

export type EffectOp = 'set' | 'add' | 'push' | 'max' | 'min';
export interface Effect {
  path: string;
  op?: EffectOp;
  value: number | string;
}

const RECORD_FIELDS = new Set(['desiredQualities', 'proteins', 'seafood', 'beef', 'carbs', 'cuisines', 'archetypes', 'budget']);
const LIST_FIELDS = new Set(['recentMeals', 'futureMeals', 'exclusions', 'notes']);
const SCALAR_FIELDS = new Set(['hunger', 'heaviness', 'noIdea', 'novelty', 'handheld', 'leftovers']);

export function clamp1(n: number): number {
  return Math.max(-1, Math.min(1, n));
}

export function getPath(prefs: DinnerPreferences, path: string): unknown {
  const [head, key, extra] = path.split('.');
  if (!head || extra !== undefined) return undefined;
  const top = (prefs as unknown as Record<string, unknown>)[head];
  if (key === undefined) return top;
  if (top && typeof top === 'object') return (top as Record<string, unknown>)[key];
  return undefined;
}

export function applyEffects(prefs: DinnerPreferences, effects: readonly Effect[], intensity = 1): DinnerPreferences {
  const next = structuredClone(prefs);
  for (const effect of effects) applyOne(next, effect, intensity);
  return next;
}

function applyOne(p: DinnerPreferences, e: Effect, intensity: number): void {
  const [head, key, extra] = e.path.split('.');
  if (!head || extra !== undefined) throw new Error(`bad effect path: ${e.path}`);
  const record = p as unknown as Record<string, unknown>;

  if (LIST_FIELDS.has(head)) {
    if (key !== undefined) throw new Error(`bad effect path: ${e.path}`);
    if ((e.op ?? 'push') !== 'push' || typeof e.value !== 'string') throw new Error(`list field ${head} only supports push of a string`);
    const list = record[head] as string[];
    const v = e.value.trim().toLowerCase();
    if (v && !list.includes(v)) list.push(v);
    return;
  }

  let target: Record<string, unknown>;
  let k: string;
  if (RECORD_FIELDS.has(head)) {
    if (!key) throw new Error(`effect path ${e.path} needs a key`);
    target = record[head] as Record<string, unknown>;
    k = key;
  } else if (SCALAR_FIELDS.has(head)) {
    if (key !== undefined) throw new Error(`bad effect path: ${e.path}`);
    target = record;
    k = head;
  } else {
    throw new Error(`unknown preference field: ${head}`);
  }

  if (typeof e.value === 'string') {
    target[k] = e.value;
    return;
  }
  const scaled = e.value * intensity;
  const current = typeof target[k] === 'number' ? (target[k] as number) : undefined;
  const bound = (n: number) => (head === 'budget' ? n : clamp1(n));
  switch (e.op ?? 'set') {
    case 'set':
      target[k] = bound(scaled);
      break;
    case 'add':
      target[k] = bound((current ?? 0) + scaled);
      break;
    case 'max':
      target[k] = bound(current === undefined ? scaled : Math.max(current, scaled));
      break;
    case 'min':
      target[k] = bound(current === undefined ? scaled : Math.min(current, scaled));
      break;
    default:
      throw new Error(`unsupported op ${e.op} for ${e.path}`);
  }
}
