import { describe, expect, it } from 'vitest';
import { type AdditionRow, loadBaseKb, mergeKb, parseKb } from '../../src/core/kb/loader';
import { KB_SCHEMA_VERSION } from '../../src/core/kb/schema';
import { tagItem } from '../../src/core/lexicon';
import { applyAnswer, deriveContext, initialState } from '../../src/core/questions';

const base = parseKb({
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
    { id: 'archetype_check', kind: 'multi', prompt: 'Gut reactions?', round: 2, dynamicOptions: 'archetypes' },
  ],
  archetypes: [
    {
      id: 'pho',
      label: 'Pho',
      cuisine: 'vietnamese',
      category: 'soup',
      proteins: ['beef'],
      searchTerms: ['pho'],
      scores: { brothy: 0.95 },
    },
  ],
  lexicon: [],
});

describe('loadBaseKb', () => {
  it('parses the repo knowledge base', () => {
    const kb = loadBaseKb();
    expect(kb.version).toBe(KB_SCHEMA_VERSION);
    const ids = kb.questions.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('mergeKb', () => {
  it('adds an archetype under kb_ plus the row id and keeps base entries untouched', () => {
    const { kb, rejected } = mergeKb(base, [
      {
        id: 'r1',
        kind: 'archetype',
        kbSchemaVersion: KB_SCHEMA_VERSION,
        payload: { id: 'ramen', label: 'Ramen', cuisine: 'japanese', category: 'soup', searchTerms: ['ramen'], scores: { brothy: 0.95 } },
      },
    ]);
    expect(rejected).toEqual([]);
    expect(kb.archetypes.map((a) => a.id)).toEqual(['pho', 'kb_r1']);
    expect(base.archetypes).toHaveLength(1);
  });

  it('adds an option to an existing node and rejects unknown nodes', () => {
    const { kb, rejected } = mergeKb(base, [
      {
        id: 'r2',
        kind: 'option',
        kbSchemaVersion: KB_SCHEMA_VERSION,
        nodeId: 'protein',
        payload: { id: 'lamb', label: 'Lamb', effects: [{ path: 'proteins.beef', value: 0.5 }] },
      },
      { id: 'r3', kind: 'option', kbSchemaVersion: KB_SCHEMA_VERSION, nodeId: 'nope', payload: { id: 'x', label: 'X' } },
    ]);
    expect(kb.questions[0]!.options.map((o) => o.id)).toEqual(['beef', 'kb_r2']);
    expect(rejected).toEqual([{ id: 'r3', error: 'unknown node nope' }]);
  });

  it('rejects wrong schema versions and invalid payloads', () => {
    const { kb, rejected } = mergeKb(base, [
      {
        id: 'r4',
        kind: 'archetype',
        kbSchemaVersion: 99,
        payload: { id: 'x', label: 'X', cuisine: 'c', category: 'c', searchTerms: ['x'], scores: {} },
      },
      { id: 'r5', kind: 'archetype', kbSchemaVersion: KB_SCHEMA_VERSION, payload: { id: 'x' } },
      {
        id: 'r6',
        kind: 'archetype',
        kbSchemaVersion: KB_SCHEMA_VERSION,
        payload: { id: 'pho', label: 'Pho again', cuisine: 'c', category: 'c', searchTerms: ['x'], scores: {} },
      },
    ]);
    expect(kb.archetypes.map((a) => a.id)).toEqual(['pho', 'kb_r6']);
    expect(rejected.map((r) => r.id)).toEqual(['r4', 'r5']);
  });
});

const v = KB_SCHEMA_VERSION;
const ramen = { id: 'ramen', label: 'Ramen', cuisine: 'japanese', category: 'soup', searchTerms: ['ramen'], scores: { brothy: 0.95 } };
const lamb = (id: string, path: string, value: number | string = 1): AdditionRow => ({
  id,
  kind: 'option',
  kbSchemaVersion: v,
  nodeId: 'protein',
  payload: { id: 'lamb', label: 'Lamb', effects: [{ path, value }] },
});

describe('mergeKb semantic validation', () => {
  it('rejects a lexicon row whose pattern does not compile, so tagging cannot throw', () => {
    const { kb, rejected } = mergeKb(base, [
      { id: 'l1', kind: 'lexicon', kbSchemaVersion: v, payload: { pattern: '(unclosed', scores: { brothy: 0.5 } } },
      { id: 'l2', kind: 'lexicon', kbSchemaVersion: v, payload: { pattern: '\\bpho\\b', scores: { brothy: 0.9 } } },
    ]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.id).toBe('l1');
    expect(rejected[0]!.error).toMatch(/payload\.pattern: invalid regular expression/);
    expect(kb.lexicon.map((e) => e.pattern)).toEqual(['\\bpho\\b']);
    expect(() => tagItem(kb, { name: 'Pho' })).not.toThrow();
  });

  it('rejects an option row whose effect path would throw when answered', () => {
    const { kb, rejected } = mergeKb(base, [lamb('o1', 'proteins.lamb.x'), lamb('o2', 'proteins.beef', 0.5)]);
    expect(rejected.map((r) => r.id)).toEqual(['o1']);
    expect(rejected[0]!.error).toMatch(/payload\.effects\[0\]: bad path proteins\.lamb\.x/);
    const options = kb.questions[0]!.options.map((o) => o.id);
    expect(options).toEqual(['beef', 'kb_o2']);
    const answer = {
      kind: 'multi' as const,
      nodeId: 'protein',
      selections: options.map((optionId) => ({ optionId, intensity: 1 as const })),
    };
    expect(() => applyAnswer(kb, initialState(), answer, deriveContext(kb, initialState().prefs))).not.toThrow();
  });

  it.each([
    ['protiens.beef', 1, /unknown preference field protiens/],
    ['proteins.beef', 'lots', /proteins\.beef needs a number/],
    ['archetypes.nope', 1, /unknown archetype nope/],
  ])('rejects an option row with effect %s = %j', (path, value, pattern) => {
    const { kb, rejected } = mergeKb(base, [lamb('o3', path, value)]);
    expect(rejected.map((r) => r.id)).toEqual(['o3']);
    expect(rejected[0]!.error).toMatch(pattern);
    expect(kb.questions[0]!.options).toHaveLength(1);
  });

  it('rejects options on dynamic and non-choice nodes, which would be ignored', () => {
    const { kb, rejected } = mergeKb(base, [
      { ...lamb('o4', 'proteins.beef'), nodeId: 'archetype_check' },
      { ...lamb('o5', 'proteins.beef'), nodeId: 'novelty' },
    ]);
    expect(rejected).toEqual([
      { id: 'o4', error: 'node archetype_check builds its options dynamically' },
      { id: 'o5', error: 'node novelty is a scale node and takes no options' },
    ]);
    expect(kb.questions[1]!.options).toEqual([]);
    expect(kb.questions[2]!.options).toEqual([]);
  });

  it('rejects a lexicon row naming an unknown archetype and accepts one naming an overlay archetype', () => {
    const { kb, rejected } = mergeKb(base, [
      { id: 'l3', kind: 'lexicon', kbSchemaVersion: v, payload: { pattern: 'ramen', archetypeId: 'kb_a1', scores: {} } },
      { id: 'l4', kind: 'lexicon', kbSchemaVersion: v, payload: { pattern: 'ramen', archetypeId: 'ramen', scores: {} } },
      { id: 'a1', kind: 'archetype', kbSchemaVersion: v, payload: ramen },
    ]);
    expect(rejected).toEqual([{ id: 'l4', error: 'payload.archetypeId: unknown archetype ramen' }]);
    expect(kb.lexicon.map((e) => e.archetypeId)).toEqual(['kb_a1']);
    expect(kb.archetypes.map((a) => a.id)).toEqual(['pho', 'kb_a1']);
  });

  it('gives rows with the same payload id distinct ids derived from the row id', () => {
    const { kb, rejected } = mergeKb(base, [
      { id: 'a2', kind: 'archetype', kbSchemaVersion: v, payload: ramen },
      { id: 'a3', kind: 'archetype', kbSchemaVersion: v, payload: ramen },
      { id: 'o6', kind: 'option', kbSchemaVersion: v, nodeId: 'protein', payload: { id: 'beef', label: 'More beef' } },
    ]);
    expect(rejected).toEqual([]);
    expect(kb.archetypes.map((a) => a.id)).toEqual(['pho', 'kb_a2', 'kb_a3']);
    expect(kb.questions[0]!.options.map((o) => o.id)).toEqual(['beef', 'kb_o6']);
  });

  it('prefixes a payload id that already starts with kb_ and ignores the payload id', () => {
    const { kb } = mergeKb(base, [{ id: 'kb_a4', kind: 'archetype', kbSchemaVersion: v, payload: { ...ramen, id: 'kb_pho' } }]);
    expect(kb.archetypes.map((a) => a.id)).toEqual(['pho', 'kb_kb_a4']);
  });

  it('rejects a repeated row id instead of creating a second entry with the same id', () => {
    const { kb, rejected } = mergeKb(base, [
      { id: 'a5', kind: 'archetype', kbSchemaVersion: v, payload: ramen },
      { id: 'a5', kind: 'archetype', kbSchemaVersion: v, payload: { ...ramen, label: 'Other ramen' } },
      lamb('o7', 'proteins.beef'),
      lamb('o7', 'proteins.beef'),
    ]);
    expect(rejected).toEqual([
      { id: 'a5', error: 'duplicate archetype id kb_a5' },
      { id: 'o7', error: 'duplicate option id kb_o7 in node protein' },
    ]);
    expect(kb.archetypes.map((a) => a.label)).toEqual(['Pho', 'Ramen']);
  });

  it('rejects a row id that cannot form a usable id', () => {
    const { kb, rejected } = mergeKb(base, [
      { id: 'a.6', kind: 'archetype', kbSchemaVersion: v, payload: ramen },
      { id: '', kind: 'archetype', kbSchemaVersion: v, payload: ramen },
    ]);
    expect(rejected).toEqual([
      { id: 'a.6', error: 'archetype id kb_a.6 must not contain "."' },
      { id: '', error: 'row id must be a non-empty string' },
    ]);
    expect(kb.archetypes).toHaveLength(1);
  });
});
