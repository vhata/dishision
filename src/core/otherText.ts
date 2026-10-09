import { z } from 'zod';
import { BEEF_KEYS, CARB_KEYS, PROTEIN_KEYS, QUALITY_KEYS, SEAFOOD_KEYS, clamp1, type DinnerPreferences, type ProteinKey, type SeafoodKey } from './preferences';

const unit = z.number().min(-1).max(1);

export const PreferencePatchSchema = z.object({
  desiredQualities: z.partialRecord(z.enum(QUALITY_KEYS), unit).optional(),
  proteins: z.partialRecord(z.enum(PROTEIN_KEYS), unit).optional(),
  seafood: z.partialRecord(z.enum(SEAFOOD_KEYS), unit).optional(),
  beef: z.partialRecord(z.enum(BEEF_KEYS), unit).optional(),
  carbs: z.partialRecord(z.enum(CARB_KEYS), unit).optional(),
  cuisines: z.record(z.string(), unit).optional(),
  exclusions: z.array(z.string()).optional(),
  recentMeals: z.array(z.string()).optional(),
  futureMeals: z.array(z.string()).optional(),
  hunger: z.enum(['light', 'normal', 'very_hungry']).optional(),
  heaviness: unit.optional(),
  novelty: unit.optional(),
  handheld: unit.optional(),
  budgetMax: z.number().positive().optional(),
});
export type PreferencePatch = z.infer<typeof PreferencePatchSchema>;

export const OTHER_PROMPT_VERSION = 1;

export function otherCacheKey(text: string): string {
  return `other:v${OTHER_PROMPT_VERSION}:${text.trim().toLowerCase().replace(/\s+/g, ' ')}`;
}

export function buildOtherPrompt(text: string, nodePrompt: string, intent?: OtherIntent): { system: string; prompt: string } {
  return {
    system:
      "You convert a diner's free-text remark into a JSON preference patch. Only fill fields the text clearly supports. " +
      'Numbers run from -1 (avoid) to 1 (want). Negations become exclusions, never positive preferences. ' +
      'Dishes eaten recently go in recentMeals; meals planned soon go in futureMeals. Output JSON only.',
    prompt: `Question being answered: "${nodePrompt}"${intent === 'avoid' ? ' (the diner is listing things they do NOT want; bare mentions are exclusions)' : ''}\nDiner wrote: "${text}"`,
  };
}

const CUISINE_WORDS: Record<string, string> = {
  thai: 'thai', vietnamese: 'vietnamese', chinese: 'chinese', sichuan: 'chinese', japanese: 'japanese', korean: 'korean',
  indian: 'indian', mexican: 'mexican', italian: 'italian', american: 'american', 'middle eastern': 'middle_eastern',
  lebanese: 'middle_eastern', mediterranean: 'middle_eastern', greek: 'greek', hawaiian: 'hawaiian',
  pho: 'vietnamese', 'banh mi': 'vietnamese', ramen: 'japanese', sushi: 'japanese', tacos: 'mexican', burrito: 'mexican',
  curry: 'indian', pizza: 'italian', pasta: 'italian', shawarma: 'middle_eastern', kebab: 'middle_eastern', poke: 'hawaiian',
};

const PROTEIN_WORDS: [RegExp, ProteinKey, SeafoodKey?][] = [
  [/\b(beef|steak|brisket)\b/, 'beef'],
  [/\bchicken\b/, 'chicken'],
  [/\bpork\b/, 'pork'],
  [/\bsalmon\b/, 'seafood', 'salmon'],
  [/\b(shrimp|prawns?|crab|shellfish|oysters?)\b/, 'seafood', 'shellfish'],
  [/\b(fish|seafood|tuna)\b/, 'seafood', 'fish'],
  [/\b(vegetarian|veggie|tofu|vegan)\b/, 'vegetarian'],
];

const NEGATION = /\b(no|not|skip|without|avoid|don'?t|nothing|none|never)\b/;
const WORD = (w: string) => new RegExp(`\\b${w}\\b`);

function set(obj: Record<string, number>, key: string, value: number): void {
  const current = obj[key];
  obj[key] = clamp1(current === undefined ? value : Math.abs(value) >= Math.abs(current) ? value : current);
}
function push(list: string[], value: string): void {
  const v = value.trim().toLowerCase();
  if (v && !list.includes(v)) list.push(v);
}

export type OtherIntent = 'avoid';

export interface KeywordParseOptions {
  /** On the avoid question a bare "sushi" means do not want sushi. */
  intent?: OtherIntent;
}

export function keywordParse(text: string, opts: KeywordParseOptions = {}): PreferencePatch {
  const patch: PreferencePatch = {};
  const dq = (): Record<string, number> => (patch.desiredQualities ??= {});
  const proteins = (): Record<string, number> => (patch.proteins ??= {});
  const seafood = (): Record<string, number> => (patch.seafood ??= {});
  const carbs = (): Record<string, number> => (patch.carbs ??= {});
  const cuisines = (): Record<string, number> => (patch.cuisines ??= {});
  const exclusions = (): string[] => (patch.exclusions ??= []);
  const recent = (): string[] => (patch.recentMeals ??= []);
  const future = (): string[] => (patch.futureMeals ??= []);

  const lower = text.toLowerCase();

  // Meals eaten or planned are handled on the whole text first, then stripped so they are not read as cravings.
  let working = lower;
  const RECENT = /\b(?:had|ate|got)\s+([a-z]+(?: [a-z]+)?)\b/g;
  for (const m of lower.matchAll(RECENT)) {
    const phrase = m[1]!;
    const word = Object.keys(CUISINE_WORDS).find((w) => phrase.startsWith(w)) ?? phrase.split(' ')[0]!;
    push(recent(), word);
    if (CUISINE_WORDS[word]) push(recent(), CUISINE_WORDS[word]!);
    working = working.replace(m[0], ' ');
  }
  const FUTURE = /\b(?:having|getting|eating|doing)\s+([a-z]+)\s+(?:later|tomorrow|this week|later this week|on \w+day|\w+day)\b/g;
  for (const m of lower.matchAll(FUTURE)) {
    const word = m[1]!;
    push(future(), CUISINE_WORDS[word] ?? word);
    working = working.replace(m[0], ' ');
  }

  for (const rawClause of working.split(/[,.;!?]| but | and | though /)) {
    const clause = rawClause.trim();
    if (!clause) continue;
    const negated = opts.intent === 'avoid' || NEGATION.test(clause);
    const sign = negated ? -1 : 1;

    for (const [word, key] of Object.entries(CUISINE_WORDS)) {
      if (!WORD(word).test(clause)) continue;
      if (negated) push(exclusions(), key);
      else set(cuisines(), key, 0.5);
    }
    for (const [re, key, sub] of PROTEIN_WORDS) {
      const m = clause.match(re);
      if (!m) continue;
      if (negated) {
        push(exclusions(), key === 'seafood' && sub ? sub : key);
      } else {
        set(proteins(), key, 0.7);
        if (sub) set(seafood(), sub, 1);
      }
    }

    if (/\b(broth\w*|soup\w*)\b/.test(clause)) set(dq(), 'brothy', sign);
    if (/\b(spicy|heat|hot)\b/.test(clause)) set(dq(), 'spicy', 0.7 * sign);
    if (/\bmild\b/.test(clause)) set(dq(), 'spicy', -0.5);
    if (/\b(heavy|rich|indulgent|greasy)\b/.test(clause)) patch.heaviness = clamp1(0.7 * sign);
    if (/\blight(er)?\b/.test(clause) && !/\bnot light/.test(clause)) patch.heaviness = -0.5;
    if (/\b(fresh|bright|citrus\w*|lime|acidic|tangy|zingy)\b/.test(clause)) {
      set(dq(), 'fresh', 0.7 * sign);
      set(dq(), 'brightAcidic', 0.7 * sign);
    }
    if (/\b(comfort\w*|cozy|cosy)\b/.test(clause)) set(dq(), 'comforting', 0.8 * sign);
    if (/\b(crispy|crunchy|fried)\b/.test(clause)) {
      set(dq(), 'crispy', 0.7 * sign);
      if (negated && /\bfried\b/.test(clause)) push(exclusions(), 'fried');
    }
    if (/\b(savou?ry|umami|meaty)\b/.test(clause)) set(dq(), 'savory', 0.7 * sign);
    if (/\b(hands?|handheld|sandwich|wrap|burger)\b/.test(clause)) patch.handheld = clamp1(0.7 * sign);

    if (/\b(starving|very hungry|really hungry|ravenous)\b/.test(clause)) patch.hunger = 'very_hungry';
    else if (/\b(not (very|that|too) hungry|light dinner|small dinner|snack)\b/.test(clause)) patch.hunger = 'light';

    if (/\brice\b/.test(clause)) set(carbs(), 'rice', negated ? -1 : 0.5);
    if (/\bnoodles?\b/.test(clause)) set(carbs(), 'noodles', negated ? -1 : 0.5);
    if (/\bbread\b/.test(clause)) set(carbs(), 'bread', negated ? -1 : 0.5);
    if (/\btortillas?\b/.test(clause)) set(carbs(), 'tortillas', negated ? -1 : 0.5);
    if (/\b(carbs? on the side|not a (rice|noodle) bowl|low[- ]carb)\b/.test(clause)) set(carbs(), 'starchAsMain', -1);

    if (/\b(surprise me|adventurous|something (new|different|interesting|unusual)|interesting)\b/.test(clause)) patch.novelty = 0.7;
    if (/\b(familiar|usual|classic|safe|normal)\b/.test(clause)) patch.novelty = -0.7;

    const money = clause.match(/\$\s?(\d{1,3})\b|\b(\d{1,3})\s?(dollars|bucks)\b/);
    if (money) {
      const n = Number(money[1] ?? money[2]);
      if (n > 0) patch.budgetMax = n;
    }
  }
  return patch;
}

export function applyPatch(prefs: DinnerPreferences, patch: PreferencePatch): DinnerPreferences {
  const next = structuredClone(prefs);
  const records = ['desiredQualities', 'proteins', 'seafood', 'beef', 'carbs', 'cuisines'] as const;
  for (const field of records) {
    const incoming = patch[field];
    if (!incoming) continue;
    const target = next[field] as Record<string, number>;
    for (const [k, v] of Object.entries(incoming)) if (typeof v === 'number') target[k] = clamp1(v);
  }
  const lists = ['exclusions', 'recentMeals', 'futureMeals'] as const;
  for (const field of lists) for (const v of patch[field] ?? []) push(next[field], v);
  if (patch.hunger) next.hunger = patch.hunger;
  if (patch.heaviness !== undefined) next.heaviness = clamp1(patch.heaviness);
  if (patch.novelty !== undefined) next.novelty = clamp1(patch.novelty);
  if (patch.handheld !== undefined) next.handheld = clamp1(patch.handheld);
  if (patch.budgetMax !== undefined) next.budget.max = patch.budgetMax;
  return next;
}
