import { fixtureCandidates } from '../../../fixtures/sf';
import type { CandidateQuery, CandidateSource, RestaurantCandidates } from '../types';

export class FixtureCandidateSource implements CandidateSource {
  async candidates(query: CandidateQuery): Promise<RestaurantCandidates[]> {
    return fixtureCandidates(query.kb);
  }
}
