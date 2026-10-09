import type { JsonRequest, Llm } from '../types';

export class FixtureLlm implements Llm {
  readonly calls: string[] = [];
  constructor(private readonly responses: Record<string, unknown> = {}) {}

  async completeJson<T>(req: JsonRequest<T>): Promise<T | null> {
    this.calls.push(req.cacheKey);
    if (!(req.cacheKey in this.responses)) return null;
    const parsed = req.schema.safeParse(this.responses[req.cacheKey]);
    return parsed.success ? parsed.data : null;
  }
}
