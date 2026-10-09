import { describe, expect, it } from 'vitest';
import { loadBaseKb } from '../../src/core/kb';
import { applyAnswer, deriveContext, initialState, nextQuestion, type AnswerInput, type ConversationState } from '../../src/core/questions';
import { emptyPreferences, applyEffects } from '../../src/core/preferences';

const kb = loadBaseKb();

function step(state: ConversationState, answer: AnswerInput): ConversationState {
  return applyAnswer(kb, state, answer, deriveContext(kb, state.prefs));
}
function ask(state: ConversationState) {
  return nextQuestion(kb, state, deriveContext(kb, state.prefs));
}

const roundOneComfortBeef: AnswerInput[] = [
  { kind: 'single', nodeId: 'hunger', optionId: 'normal' },
  { kind: 'multi', nodeId: 'feel', selections: [{ optionId: 'comforting', intensity: 1 }, { optionId: 'savory', intensity: 0.5 }] },
  { kind: 'multi', nodeId: 'protein', selections: [{ optionId: 'beef', intensity: 1 }] },
  { kind: 'scale', nodeId: 'novelty', stop: 3 },
  { kind: 'multi', nodeId: 'avoid', selections: [{ optionId: 'japanese', intensity: 1 }] },
];

describe('round one', () => {
  it('asks the five fixed questions in order', () => {
    let state = initialState();
    const seen: string[] = [];
    for (const answer of roundOneComfortBeef) {
      const q = ask(state)!;
      seen.push(q.node.id);
      expect(q.node.id).toBe(answer.nodeId);
      state = step(state, answer);
    }
    expect(seen).toEqual(['hunger', 'feel', 'protein', 'novelty', 'avoid']);
    expect(state.prefs.desiredQualities.comforting).toBe(1);
    expect(state.prefs.desiredQualities.savory).toBe(0.5);
    expect(state.prefs.proteins.beef).toBe(1);
    expect(state.prefs.novelty).toBe(0.5);
    expect(state.prefs.exclusions).toEqual(['japanese']);
  });

  it('advances when the user selects nothing', () => {
    let state = initialState();
    state = step(state, { kind: 'single', nodeId: 'hunger' });
    state = step(state, { kind: 'multi', nodeId: 'feel', selections: [] });
    expect(state.asked).toEqual(['hunger', 'feel']);
    expect(ask(state)!.node.id).toBe('protein');
  });
});

describe('round two', () => {
  it('asks brothy, heaviness and beef style for the comfort-beef profile, then stops', () => {
    let state = initialState();
    for (const a of roundOneComfortBeef) state = step(state, a);

    expect(ask(state)!.node.id).toBe('brothy');
    state = step(state, { kind: 'yesno', nodeId: 'brothy', value: 'yes' });
    expect(state.prefs.desiredQualities.brothy).toBe(1);

    expect(ask(state)!.node.id).toBe('heaviness');
    state = step(state, { kind: 'scale', nodeId: 'heaviness', stop: 1 });
    expect(state.prefs.heaviness).toBe(-0.5);

    expect(ask(state)!.node.id).toBe('beef_style');
    state = step(state, { kind: 'multi', nodeId: 'beef_style', selections: [{ optionId: 'thinSliced', intensity: 1 }] });

    expect(ask(state)).toBeNull();
    expect(state.round2Asked).toBe(3);
  });

  it('does not ask heaviness when rich was already chosen, and asks handheld when starving and rich', () => {
    let state = initialState();
    state = step(state, { kind: 'single', nodeId: 'hunger', optionId: 'very_hungry' });
    state = step(state, { kind: 'multi', nodeId: 'feel', selections: [{ optionId: 'rich', intensity: 1 }] });
    state = step(state, { kind: 'multi', nodeId: 'protein', selections: [{ optionId: 'beef', intensity: 1 }] });
    state = step(state, { kind: 'scale', nodeId: 'novelty', stop: 0 });
    state = step(state, { kind: 'multi', nodeId: 'avoid', selections: [] });
    const asked: string[] = [];
    for (let q = ask(state); q; q = ask(state)) {
      asked.push(q.node.id);
      state = step(state, { kind: q.node.kind, nodeId: q.node.id } as AnswerInput);
    }
    expect(asked).not.toContain('heaviness');
    expect(asked).toContain('handheld');
    expect(asked.length).toBeLessThanOrEqual(3);
  });

  it('offers the archetype check with generated options when many archetypes are plausible', () => {
    const prefs = applyEffects(emptyPreferences(), [
      { path: 'desiredQualities.comforting', value: 1 },
      { path: 'desiredQualities.savory', value: 1 },
    ]);
    const state: ConversationState = { ...initialState(), prefs, asked: ['hunger', 'feel', 'protein', 'novelty', 'avoid', 'brothy', 'heaviness', 'spice', 'carbs'], round2Asked: 2 };
    const derived = deriveContext(kb, prefs);
    expect(derived.plausibleArchetypeCount).toBeGreaterThanOrEqual(5);
    const q = nextQuestion(kb, state, derived)!;
    expect(q.node.id).toBe('archetype_check');
    expect(q.options.length).toBeGreaterThan(0);
    expect(q.options.length).toBeLessThanOrEqual(8);
    const first = q.options[0]!;
    const next = applyAnswer(kb, state, { kind: 'multi', nodeId: 'archetype_check', selections: [{ optionId: first.id, intensity: 1 }] }, derived);
    expect(next.prefs.archetypes[first.id.replace('arch:', '')]).toBe(1);
  });

  it('rejects unknown nodes, mismatched kinds and unknown options', () => {
    const state = initialState();
    expect(() => step(state, { kind: 'single', nodeId: 'nope', optionId: 'x' })).toThrow(/unknown node/);
    expect(() => step(state, { kind: 'multi', nodeId: 'hunger', selections: [] })).toThrow(/kind/);
    expect(() => step(state, { kind: 'single', nodeId: 'hunger', optionId: 'ravenous' })).toThrow(/unknown option/);
  });
});
