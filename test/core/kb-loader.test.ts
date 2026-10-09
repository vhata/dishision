import { describe, expect, it } from 'vitest';
import { KB_SCHEMA_VERSION } from '../../src/core/kb/schema';
import { loadBaseKb, mergeKb, parseKb } from '../../src/core/kb/loader';

const base = parseKb({
  version: KB_SCHEMA_VERSION,
  questions: [
    { id: 'protein', kind: 'multi', prompt: 'Protein?', round: 1, options: [{ id: 'beef', label: 'Beef', effects: [{ path: 'proteins.beef', value: 1 }] }] },
  ],
  archetypes: [
    { id: 'pho', label: 'Pho', cuisine: 'vietnamese', category: 'soup', proteins: ['beef'], searchTerms: ['pho'], scores: { brothy: 0.95 } },
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
  it('adds a prefixed archetype and keeps base entries untouched', () => {
    const { kb, rejected } = mergeKb(base, [
      { id: 'r1', kind: 'archetype', kbSchemaVersion: KB_SCHEMA_VERSION, payload: { id: 'ramen', label: 'Ramen', cuisine: 'japanese', category: 'soup', searchTerms: ['ramen'], scores: { brothy: 0.95 } } },
    ]);
    expect(rejected).toEqual([]);
    expect(kb.archetypes.map((a) => a.id)).toEqual(['pho', 'kb_ramen']);
    expect(base.archetypes).toHaveLength(1);
  });

  it('adds an option to an existing node and rejects unknown nodes', () => {
    const { kb, rejected } = mergeKb(base, [
      { id: 'r2', kind: 'option', kbSchemaVersion: KB_SCHEMA_VERSION, nodeId: 'protein', payload: { id: 'lamb', label: 'Lamb', effects: [{ path: 'proteins.beef', value: 0.5 }] } },
      { id: 'r3', kind: 'option', kbSchemaVersion: KB_SCHEMA_VERSION, nodeId: 'nope', payload: { id: 'x', label: 'X' } },
    ]);
    expect(kb.questions[0]!.options.map((o) => o.id)).toEqual(['beef', 'kb_lamb']);
    expect(rejected).toEqual([{ id: 'r3', error: 'unknown node nope' }]);
  });

  it('rejects wrong schema versions and invalid payloads', () => {
    const { kb, rejected } = mergeKb(base, [
      { id: 'r4', kind: 'archetype', kbSchemaVersion: 99, payload: { id: 'x', label: 'X', cuisine: 'c', category: 'c', searchTerms: ['x'], scores: {} } },
      { id: 'r5', kind: 'archetype', kbSchemaVersion: KB_SCHEMA_VERSION, payload: { id: 'x' } },
      { id: 'r6', kind: 'archetype', kbSchemaVersion: KB_SCHEMA_VERSION, payload: { id: 'pho', label: 'Pho again', cuisine: 'c', category: 'c', searchTerms: ['x'], scores: {} } },
    ]);
    expect(kb.archetypes.map((a) => a.id)).toEqual(['pho', 'kb_pho']);
    expect(rejected.map((r) => r.id)).toEqual(['r4', 'r5']);
  });
});
