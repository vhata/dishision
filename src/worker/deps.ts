import { loadBaseKb, type KnowledgeBase } from '../core/kb';
import { FixtureGeocoder } from '../providers/geocoder/fixture';
import { FixtureLlm } from '../providers/llm/fixture';
import type { Geocoder, Llm } from '../providers/types';
import type { Env } from './env';

export interface Deps {
  kb: KnowledgeBase;
  llm: Llm;
  geocoder: Geocoder;
}

function unsupported(name: string, value: string): never {
  throw new Error(`${name}=${value} is not available in this build`);
}

export function buildDeps(env: Env): Deps {
  const kb = loadBaseKb();
  const llm: Llm = env.LLM_PROVIDER === 'fixture' ? new FixtureLlm() : unsupported('LLM_PROVIDER', env.LLM_PROVIDER);
  const geocoder: Geocoder = env.GEOCODER === 'fixture' ? new FixtureGeocoder() : unsupported('GEOCODER', env.GEOCODER);
  return { kb, llm, geocoder };
}
