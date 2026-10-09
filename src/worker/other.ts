import { applyPatch, buildOtherPrompt, keywordParse, otherCacheKey, PreferencePatchSchema, type PreferencePatch } from '../core/otherText';
import type { DinnerPreferences } from '../core/preferences';
import type { Llm } from '../providers/types';

export interface OtherParse {
  source: 'llm' | 'keywords';
  patch: PreferencePatch;
}

export async function parseOther(llm: Llm, text: string, nodePrompt: string): Promise<OtherParse> {
  const { system, prompt } = buildOtherPrompt(text, nodePrompt);
  const fromLlm = await llm.completeJson({ tier: 'large', system, prompt, schema: PreferencePatchSchema, cacheKey: otherCacheKey(text) });
  return fromLlm ? { source: 'llm', patch: fromLlm } : { source: 'keywords', patch: keywordParse(text) };
}

export function applyOther(prefs: DinnerPreferences, text: string, parse: OtherParse): DinnerPreferences {
  const next = applyPatch(prefs, parse.patch);
  const note = text.trim();
  if (note && !next.notes.includes(note.toLowerCase())) next.notes.push(note.toLowerCase());
  return next;
}
