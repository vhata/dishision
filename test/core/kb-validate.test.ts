import { describe, expect, it } from 'vitest';
import { DERIVED_KEYS, kbIssues, PREFERENCE_FIELDS, parseKb } from '../../src/core/kb';
import { KB_SCHEMA_VERSION } from '../../src/core/kb/schema';
import { applyEffects, emptyPreferences } from '../../src/core/preferences';
import { deriveContext } from '../../src/core/questions';

/** A small knowledge base that passes both Zod and semantic validation. */
function raw() {
  return {
    version: KB_SCHEMA_VERSION,
    questions: [
      {
        id: 'protein',
        kind: 'multi',
        prompt: 'Protein?',
        round: 1,
        options: [{ id: 'beef', label: 'Beef', effects: [{ path: 'proteins.beef', value: 1 }] }],
      },
      { id: 'novelty', kind: 'scale', prompt: 'New?', round: 1, field: 'novelty', stops: ['a', 'b', 'c', 'd', 'e'] },
      {
        id: 'brothy',
        kind: 'yesno',
        prompt: 'Brothy?',
        round: 2,
        applies: [{ path: 'desiredQualities.comforting', op: 'gte', value: 0.5 }],
        yes: [{ path: 'desiredQualities.brothy', value: 1 }],
        no: [{ path: 'desiredQualities.brothy', value: -1 }],
      },
      {
        id: 'archetype_check',
        kind: 'multi',
        prompt: 'Gut reactions?',
        round: 2,
        dynamicOptions: 'archetypes',
        applies: [{ path: 'derived.plausibleArchetypeCount', op: 'gte', value: 5 }],
      },
    ],
    archetypes: [{ id: 'pho', label: 'Pho', cuisine: 'vietnamese', category: 'soup', searchTerms: ['pho'], scores: { brothy: 0.95 } }],
    lexicon: [{ pattern: '\\bpho\\b', archetypeId: 'pho', scores: { brothy: 0.95 } }],
  };
}

type Raw = ReturnType<typeof raw>;
// biome-ignore lint/suspicious/noExplicitAny: tests build deliberately invalid rows that the typed shape forbids.
type Loose = any;

function issuesAfter(edit: (kb: Loose) => void): string[] {
  const kb: Raw = raw();
  edit(kb);
  try {
    parseKb(kb);
    return [];
  } catch (e) {
    return [(e as Error).message];
  }
}

describe('parseKb semantic validation', () => {
  it('accepts the clean fixture', () => {
    expect(() => parseKb(raw())).not.toThrow();
  });

  it('rejects a lexicon pattern that does not compile', () => {
    const [msg] = issuesAfter((kb) => kb.lexicon.push({ pattern: '(unclosed', scores: {} }));
    expect(msg).toMatch(/lexicon\[1\]\.pattern: invalid regular expression/);
  });

  it('rejects a lexicon archetypeId that names no archetype', () => {
    const [msg] = issuesAfter((kb) => {
      kb.lexicon[0].archetypeId = 'phoo';
    });
    expect(msg).toMatch(/lexicon\[0\]\.archetypeId: unknown archetype phoo/);
  });

  it.each([
    ['proteins.beef.x', 1, /bad path/],
    ['protiens.beef', 1, /unknown preference field protiens/],
    ['proteins.lamb', 1, /unknown key lamb for proteins/],
    ['proteins', 1, /proteins needs a key/],
    ['novelty.x', 1, /novelty takes no key/],
    ['proteins.beef', 'lots', /proteins\.beef needs a number/],
    ['hunger', 'ravenous', /hunger must be one of/],
    ['hunger', 1, /hunger must be one of/],
    ['exclusions', 1, /exclusions needs a string/],
    ['archetypes.ramen', 1, /unknown archetype ramen/],
  ])('rejects option effect %s = %j', (path, value, pattern) => {
    const [msg] = issuesAfter((kb) => {
      kb.questions[0].options[0].effects = [{ path, value }];
    });
    expect(msg).toMatch(/questions\[protein\]\.options\[beef\]\.effects\[0\]/);
    expect(msg).toMatch(pattern);
  });

  it.each([
    ['exclusions', 'set', 'fried', /exclusions only supports push/],
    ['proteins.beef', 'push', 1, /proteins\.beef does not support push/],
    ['hunger', 'add', 'light', /hunger only supports set/],
  ])('rejects effect %s with op %s', (path, op, value, pattern) => {
    const [msg] = issuesAfter((kb) => {
      kb.questions[0].options[0].effects = [{ path, op, value }];
    });
    expect(msg).toMatch(pattern);
  });

  it('checks yes and no effects on yesno nodes', () => {
    const [msg] = issuesAfter((kb) => {
      kb.questions[2].no = [{ path: 'desiredQualities.brothyy', value: -1 }];
    });
    expect(msg).toMatch(/questions\[brothy\]\.no\[0\]: unknown key brothyy for desiredQualities/);
  });

  it.each([
    [{ path: 'desiredQualities.comfortng', op: 'gte', value: 0.5 }, /unknown key comfortng for desiredQualities/],
    [{ path: 'derived.plausibleCount', op: 'gte', value: 5 }, /unknown derived value plausibleCount/],
    [{ path: 'heavyness', op: 'lte', value: -0.5 }, /unknown preference field heavyness/],
    [{ path: 'heaviness', op: 'lte', value: 'light' }, /lte needs a number/],
    [{ path: 'hunger', op: 'gte', value: 1 }, /gte needs a numeric field/],
    [{ path: 'hunger', op: 'eq', value: 'starving' }, /hunger must be one of/],
    [{ path: 'exclusions', op: 'includes', value: 1 }, /includes needs a string/],
    [{ path: 'novelty', op: 'includes', value: 'x' }, /includes needs a list field/],
    [{ path: 'novelty', op: 'eq' }, /eq needs a value/],
  ])('rejects rule %j', (rule, pattern) => {
    const [msg] = issuesAfter((kb) => {
      kb.questions[2].applies = [{ all: [{ not: rule }] }];
    });
    expect(msg).toMatch(/questions\[brothy\]\.applies\[0\]\.all\[0\]\.not/);
    expect(msg).toMatch(pattern);
  });

  it.each([
    ['novety', /unknown preference field novety/],
    ['novelty.x', /novelty takes no key/],
    ['hunger', /scale field hunger needs a numeric field/],
    ['exclusions', /scale field exclusions needs a numeric field/],
  ])('rejects scale field %s', (field, pattern) => {
    const [msg] = issuesAfter((kb) => {
      kb.questions[1].field = field;
    });
    expect(msg).toMatch(/questions\[novelty\]\.field/);
    expect(msg).toMatch(pattern);
  });

  it('rejects duplicate question, option and archetype ids', () => {
    const [msg] = issuesAfter((kb) => {
      kb.questions.push({ ...kb.questions[1] });
      kb.questions[0].options.push({ id: 'beef', label: 'Beef again' });
      kb.archetypes.push({ ...kb.archetypes[0], label: 'Pho again' });
    });
    expect(msg).toMatch(/questions\[novelty\]: duplicate question id/);
    expect(msg).toMatch(/questions\[protein\]\.options\[beef\]: duplicate option id/);
    expect(msg).toMatch(/archetypes\[pho\]: duplicate archetype id/);
  });

  it('rejects static options on a dynamic node and options on non-choice nodes', () => {
    const [msg] = issuesAfter((kb) => {
      kb.questions[3].options = [{ id: 'x', label: 'X' }];
      kb.questions[1].options = [{ id: 'y', label: 'Y' }];
    });
    expect(msg).toMatch(/questions\[archetype_check\]: node archetype_check builds its options dynamically/);
    expect(msg).toMatch(/questions\[novelty\]: node novelty is a scale node and takes no options/);
  });

  it('rejects ids that would break effect paths or claim the overlay prefix', () => {
    const [msg] = issuesAfter((kb) => {
      kb.archetypes.push({ ...kb.archetypes[0], id: 'pho.special' });
      kb.archetypes.push({ ...kb.archetypes[0], id: 'kb_pho' });
      kb.questions[0].options.push({ id: 'kb_lamb', label: 'Lamb' });
    });
    expect(msg).toMatch(/archetypes\[pho\.special\]: id must not contain "\."/);
    expect(msg).toMatch(/archetypes\[kb_pho\]: id prefix kb_ is reserved for overlay rows/);
    expect(msg).toMatch(/questions\[protein\]\.options\[kb_lamb\]: id prefix kb_ is reserved for overlay rows/);
  });

  it('lists every problem in one error', () => {
    const [msg] = issuesAfter((kb) => {
      kb.lexicon.push({ pattern: '[', scores: {} });
      kb.questions[1].field = 'nope';
    });
    expect(msg).toMatch(/^knowledge base failed validation:\n/);
    expect(msg!.split('\n').filter((l) => l.startsWith('- '))).toHaveLength(2);
  });
});

describe('validator model stays in step with the preference model', () => {
  it('covers every field of an empty preference object', () => {
    for (const field of Object.keys(emptyPreferences())) expect(PREFERENCE_FIELDS).toHaveProperty(field);
  });

  it('accepts only effects that applyEffects can apply', () => {
    const kb = parseKb(raw());
    for (const [field, spec] of Object.entries(PREFERENCE_FIELDS)) {
      const effect =
        spec.kind === 'list'
          ? { path: field, value: 'x' }
          : spec.kind === 'enum'
            ? { path: field, value: spec.values[0]! }
            : spec.kind === 'number'
              ? { path: field, value: 0.5 }
              : { path: `${field}.${spec.keys?.[0] ?? (field === 'archetypes' ? 'pho' : 'anything')}`, value: 0.5 };
      kb.questions[0]!.options[0]!.effects = [effect];
      expect(kbIssues(kb), field).toEqual([]);
      expect(() => applyEffects(emptyPreferences(), [effect]), field).not.toThrow();
    }
  });

  it('knows every derived value the conversation computes', () => {
    const kb = parseKb(raw());
    expect(Object.keys(deriveContext(kb, emptyPreferences())).sort()).toEqual([...DERIVED_KEYS].sort());
  });
});
