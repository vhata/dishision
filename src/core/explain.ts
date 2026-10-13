import type { Recommendation } from './pairs';
import type { DinnerPreferences } from './preferences';
import type { ScoreKey } from './types';

// Attribute words only: a phrase must hold for any dish with the score, so it never names an ingredient.
const SIGNAL_PHRASES: Record<string, string> = {
  brothy: 'broth',
  brightAcidic: 'bright acidity',
  fresh: 'something fresh',
  spicy: 'some heat',
  comforting: 'comfort',
  savory: 'deep savoriness',
  crispy: 'crunch',
  rich: 'richness',
  proteinForward: 'plenty of protein',
  handheld: 'something you eat with your hands',
  adventurous: 'something a bit different',
  carbHeavy: 'a proper starch base',
  protein: 'the protein you asked for',
};

/** How a runner-up falls short of the pick on a wanted quality; used only when both dishes carry the score. */
const SHORTFALL_PHRASES: Record<string, string> = {
  brothy: 'not as brothy',
  brightAcidic: 'not as bright',
  fresh: 'not as fresh',
  spicy: 'not as spicy',
  comforting: 'not as comforting',
  savory: 'not as savory',
  crispy: 'not as crunchy',
  rich: 'not as rich',
  proteinForward: 'lighter on protein',
  handheld: 'not as easy to eat with your hands',
  adventurous: 'not as adventurous',
  carbHeavy: 'lighter on starch',
};

const PENALTY_PHRASES: Record<string, string> = {
  tooRich: 'heavier than you wanted',
  tooStarchy: 'more starch than you wanted',
  tooSpicy: 'spicier than you wanted',
  repeatedCuisine: 'too close to something you had or have planned',
  bothHeavy: 'two heavy dishes together',
  bothStarchy: 'two starch bases together',
  sameDominant: 'two dishes with the same main flavor',
  tooMuch: 'more food than you asked for',
  menuless: 'a menu we have not read yet',
};

/** Smallest difference between two scores that the runner-up sentence calls a shortfall. */
const SHORTFALL_GAP = 0.1;
/** Largest score gap at which the runner-up is called a close second. */
const CLOSE_SECOND = 0.05;
const EPSILON = 1e-9;

export function joinNatural(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function penaltyPhrase(key: string): string | undefined {
  if (PENALTY_PHRASES[key]) return PENALTY_PHRASES[key];
  // scoring.ts records a carb the diner wants less of as avoid_<carb tag>, so the carb word comes from the item's tags.
  if (key.startsWith('avoid_')) return `comes with ${key.slice('avoid_'.length)}, which you wanted less of`;
  return undefined;
}

/** The largest penalty on the trace that has a phrase. */
function topPenalty(rec: Recommendation): { key: string; value: number; phrase: string } | null {
  for (const [key, value] of Object.entries(rec.trace.penalties).sort((a, b) => b[1] - a[1])) {
    const phrase = penaltyPhrase(key);
    if (phrase) return { key, value, phrase };
  }
  return null;
}

/** The highest score any dish carries for the key, as pair composition combines them; undefined when no dish has it. */
function measured(rec: Recommendation, key: string): number | undefined {
  const known = rec.items.map((i) => i.scores[key as ScoreKey]).filter((v): v is number => v !== undefined);
  return known.length ? Math.max(...known) : undefined;
}

/** The protein match the scorer recorded; undefined when no dish has protein tags to match against. */
function proteinOf(rec: Recommendation): number | undefined {
  if (rec.items.every((i) => i.tags.proteins.length === 0)) return undefined;
  return rec.trace.positiveSignals.protein ?? 0;
}

function avoidedPhrases(rec: Recommendation, prefs: DinnerPreferences): string[] {
  const out: string[] = [];
  // An avoidance is claimed only when every dish has the score; a missing score is unknown, not low.
  const below = (key: 'rich' | 'carbHeavy' | 'spicy', limit: number) =>
    rec.items.every((i) => i.scores[key] !== undefined && i.scores[key] < limit);
  if ((prefs.heaviness ?? 0) <= -0.5 && below('rich', 0.4)) out.push('without getting heavy');
  if ((prefs.carbs.starchAsMain ?? 0) <= -0.5 && below('carbHeavy', 0.4)) out.push('without a big rice or noodle base');
  if ((prefs.desiredQualities.spicy ?? 0) <= -0.5 && below('spicy', 0.3)) out.push('without much heat');
  return out;
}

function lead(rec: Recommendation): string {
  const names = rec.items.map((i) => i.name);
  return `${names.length > 1 ? `${names[0]} plus ${names[1]}` : names[0]} at ${rec.restaurant.name}.`;
}

function dishesAt(rec: Recommendation): string {
  return `${rec.items.map((i) => i.name).join(' plus ')} at ${rec.restaurant.name}`;
}

/** The first of the pick's signals, strongest first, on which the runner-up measurably falls short. */
function shortfall(runnerUp: Recommendation, primary: Recommendation): string | null {
  for (const [key] of Object.entries(primary.trace.positiveSignals).sort((a, b) => b[1] - a[1])) {
    if (key === 'protein') {
      const theirs = proteinOf(runnerUp);
      const ours = primary.trace.positiveSignals.protein ?? 0;
      if (theirs !== undefined && ours - theirs >= SHORTFALL_GAP - EPSILON) {
        return theirs === 0 ? 'not a protein you asked for' : 'not your first-choice protein';
      }
      continue;
    }
    const phrase = SHORTFALL_PHRASES[key];
    const ours = measured(primary, key);
    const theirs = measured(runnerUp, key);
    if (phrase && ours !== undefined && theirs !== undefined && ours - theirs >= SHORTFALL_GAP - EPSILON) return phrase;
  }
  return null;
}

function runnerUpSentence(runnerUp: Recommendation, primary: Recommendation): string {
  const reason =
    topPenalty(runnerUp)?.phrase ??
    shortfall(runnerUp, primary) ??
    (primary.score - runnerUp.score <= CLOSE_SECOND + EPSILON ? 'a close second' : 'the next best fit');
  return `Runner-up: ${dishesAt(runnerUp)}, ${reason}.`;
}

export function explain(rec: Recommendation, prefs: DinnerPreferences, runnerUp?: Recommendation | null): string {
  const first = lead(rec);
  if (rec.menuless) {
    const dish = rec.items[0]?.name.toLowerCase() ?? 'this';
    return `${first} We could not read this menu yet, so this is a match on cuisine and rating: ${rec.restaurant.name} looks like a good place for ${dish}. Check the menu before ordering.`;
  }
  const signals = Object.entries(rec.trace.positiveSignals)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => SIGNAL_PHRASES[k])
    .filter((p): p is string => !!p)
    .slice(0, 3);
  const got = signals.length ? `You get ${joinNatural(signals)}` : 'It lines up with what you asked for';
  const avoided = avoidedPhrases(rec, prefs);
  let text = `${first} ${got}${avoided.length ? `, ${joinNatural(avoided)}` : ''}.`;
  const described = rec.items.find((i) => i.description && i.description.length <= 120);
  if (described) text += ` The menu lists ${described.name} as "${described.description}".`;
  if (runnerUp) text += ` ${runnerUpSentence(runnerUp, rec)}`;
  return text;
}
