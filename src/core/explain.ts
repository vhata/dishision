import type { Recommendation } from './pairs';
import type { DinnerPreferences } from './preferences';

const SIGNAL_PHRASES: Record<string, string> = {
  brothy: 'broth',
  brightAcidic: 'lime and acid brightness',
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

const PENALTY_PHRASES: Record<string, string> = {
  tooRich: 'heavier than you wanted',
  tooStarchy: 'more starch than you wanted',
  tooSpicy: 'spicier than you wanted',
  repeatedCuisine: 'too close to something you had or have planned',
  bothHeavy: 'two heavy dishes together',
  bothStarchy: 'two starch bases together',
  tooMuch: 'more food than you asked for',
  menuless: 'a menu we have not read yet',
};

export function joinNatural(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function avoidedPhrases(rec: Recommendation, prefs: DinnerPreferences): string[] {
  const out: string[] = [];
  const maxOf = (key: 'rich' | 'carbHeavy' | 'spicy') => Math.max(...rec.items.map((i) => i.scores[key] ?? 0));
  if ((prefs.heaviness ?? 0) <= -0.5 && maxOf('rich') < 0.4) out.push('without getting heavy');
  if ((prefs.carbs.starchAsMain ?? 0) <= -0.5 && maxOf('carbHeavy') < 0.4) out.push('without a big rice or noodle base');
  if ((prefs.desiredQualities.spicy ?? 0) <= -0.5 && maxOf('spicy') < 0.3) out.push('without much heat');
  return out;
}

function lead(rec: Recommendation): string {
  const names = rec.items.map((i) => i.name);
  return `${names.length > 1 ? `${names[0]} plus ${names[1]}` : names[0]} at ${rec.restaurant.name}.`;
}

function runnerUpSentence(runnerUp: Recommendation, primary: Recommendation): string {
  const names = runnerUp.items.map((i) => i.name).join(' plus ');
  const [worst] = Object.entries(runnerUp.trace.penalties).sort((a, b) => b[1] - a[1]);
  let reason: string;
  if (worst && PENALTY_PHRASES[worst[0]]) {
    reason = PENALTY_PHRASES[worst[0]]!;
  } else {
    const [top] = Object.entries(primary.trace.positiveSignals).sort((a, b) => b[1] - a[1]);
    reason = top && SIGNAL_PHRASES[top[0]] ? `a little less ${SIGNAL_PHRASES[top[0]]}` : 'a close second';
  }
  return `Runner-up: ${names} at ${runnerUp.restaurant.name}, ${reason}.`;
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
