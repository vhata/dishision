import { applyPatch, buildOtherPrompt, keywordParse, otherCacheKey, PreferencePatchSchema, type OtherIntent, type PreferencePatch } from '../core/otherText';
import type { DinnerPreferences } from '../core/preferences';
import type { Llm } from '../providers/types';

export interface OtherParse {
  source: 'llm' | 'keywords';
  patch: PreferencePatch;
}

export async function parseOther(llm: Llm, text: string, nodePrompt: string, intent?: OtherIntent): Promise<OtherParse> {
  const { system, prompt } = buildOtherPrompt(text, nodePrompt, intent);
  const fromLlm = await llm.completeJson({ tier: 'large', system, prompt, schema: PreferencePatchSchema, cacheKey: `${otherCacheKey(text)}:${intent ?? 'any'}` });
  return fromLlm ? { source: 'llm', patch: fromLlm } : { source: 'keywords', patch: keywordParse(text, { intent }) };
}

export function applyOther(prefs: DinnerPreferences, text: string, parse: OtherParse): DinnerPreferences {
  const next = applyPatch(prefs, parse.patch);
  const note = text.trim();
  if (note && !next.notes.includes(note.toLowerCase())) next.notes.push(note.toLowerCase());
  return next;
}
