import { loadBaseKb, type KnowledgeBase } from '../core/kb';
import { FixtureCandidateSource } from '../providers/candidates/fixture';
import { FixtureGeocoder } from '../providers/geocoder/fixture';
import { FixtureLlm } from '../providers/llm/fixture';
import type { CandidateSource, Geocoder, Llm } from '../providers/types';
import type { Env } from './env';

export interface Deps {
  kb: KnowledgeBase;
  llm: Llm;
  geocoder: Geocoder;
  candidates: CandidateSource;
}

function unsupported(name: string, value: string): never {
  throw new Error(`${name}=${value} is not available in this build`);
}

export function buildDeps(env: Env): Deps {
  const kb = loadBaseKb();
  const llm: Llm = env.LLM_PROVIDER === 'fixture' ? new FixtureLlm() : unsupported('LLM_PROVIDER', env.LLM_PROVIDER);
  const geocoder: Geocoder = env.GEOCODER === 'fixture' ? new FixtureGeocoder() : unsupported('GEOCODER', env.GEOCODER);
  const candidates: CandidateSource =
    env.RESTAURANT_PROVIDER === 'fixture' ? new FixtureCandidateSource() : unsupported('RESTAURANT_PROVIDER', env.RESTAURANT_PROVIDER);
  return { kb, llm, geocoder, candidates };
}
