import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { FixtureLlm } from '../../src/providers/llm/fixture';

const schema = z.object({ answer: z.number() });

describe('FixtureLlm', () => {
  it('returns null when it has no canned response', async () => {
    const llm = new FixtureLlm();
    expect(await llm.completeJson({ tier: 'small', system: 's', prompt: 'p', schema, cacheKey: 'k' })).toBeNull();
    expect(llm.calls).toEqual(['k']);
  });

  it('returns the canned response when it validates, null otherwise', async () => {
    const llm = new FixtureLlm({ good: { answer: 42 }, bad: { answer: 'x' } });
    expect(await llm.completeJson({ tier: 'large', system: 's', prompt: 'p', schema, cacheKey: 'good' })).toEqual({ answer: 42 });
    expect(await llm.completeJson({ tier: 'large', system: 's', prompt: 'p', schema, cacheKey: 'bad' })).toBeNull();
  });
});
