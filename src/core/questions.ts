import { evalRule, type Derived as RuleDerived } from './kb/rules';
import type { Archetype, KnowledgeBase, QuestionNode, QuestionOption } from './kb/schema';
import { plausibleArchetypes } from './planner';
import { applyEffects, emptyPreferences, type DinnerPreferences } from './preferences';

export interface ConversationState {
  prefs: DinnerPreferences;
  asked: string[];
  round2Asked: number;
  rejectedItemIds: string[];
}

export function initialState(): ConversationState {
  return { prefs: emptyPreferences(), asked: [], round2Asked: 0, rejectedItemIds: [] };
}

export const MAX_ROUND2 = 3;
export const SCALE_VALUES = [-1, -0.5, 0, 0.5, 1] as const;
export const MAX_ARCHETYPE_OPTIONS = 8;

export interface Derived extends RuleDerived {
  plausibleArchetypes: Archetype[];
  plausibleArchetypeCount: number;
}

export function deriveContext(kb: KnowledgeBase, prefs: DinnerPreferences): Derived {
  const plausible = plausibleArchetypes(kb, prefs);
  return { plausibleArchetypes: plausible, plausibleArchetypeCount: plausible.length };
}

export interface PresentedQuestion {
  node: QuestionNode;
  options: QuestionOption[];
}

export function optionsFor(node: QuestionNode, derived: Derived): QuestionOption[] {
  if (node.dynamicOptions === 'archetypes') {
    return derived.plausibleArchetypes.slice(0, MAX_ARCHETYPE_OPTIONS).map((a) => ({
      id: `arch:${a.id}`,
      label: a.label,
      effects: [{ path: `archetypes.${a.id}`, value: 1 }],
    }));
  }
  return node.options;
}

export function nextQuestion(kb: KnowledgeBase, state: ConversationState, derived: Derived): PresentedQuestion | null {
  const asked = new Set(state.asked);
  const roundOne = kb.questions.filter((n) => n.round === 1 && !asked.has(n.id)).sort((a, b) => b.priority - a.priority);
  const first = roundOne[0];
  if (first) return { node: first, options: optionsFor(first, derived) };
  if (state.round2Asked >= MAX_ROUND2) return null;
  const roundTwo = kb.questions
    .filter((n) => n.round === 2 && !asked.has(n.id) && n.applies.every((r) => evalRule(r, state.prefs, derived)))
    .sort((a, b) => b.priority - a.priority);
  const node = roundTwo[0];
  if (!node) return null;
  const options = optionsFor(node, derived);
  if (node.dynamicOptions && options.length === 0) {
    return nextQuestion(kb, { ...state, asked: [...state.asked, node.id] }, derived);
  }
  return { node, options };
}

export type Intensity = 0.5 | 1;
export type AnswerInput = { nodeId: string; otherText?: string } & (
  | { kind: 'single'; optionId?: string }
  | { kind: 'multi'; selections: { optionId: string; intensity: Intensity }[] }
  | { kind: 'scale'; stop?: 0 | 1 | 2 | 3 | 4 }
  | { kind: 'yesno'; value?: 'yes' | 'no' | 'either' }
);

export function applyAnswer(kb: KnowledgeBase, state: ConversationState, answer: AnswerInput, derived: Derived): ConversationState {
  const node = kb.questions.find((n) => n.id === answer.nodeId);
  if (!node) throw new Error(`unknown node ${answer.nodeId}`);
  if (node.kind !== answer.kind) throw new Error(`answer kind ${answer.kind} does not match node kind ${node.kind}`);
  const options = optionsFor(node, derived);
  const option = (id: string): QuestionOption => {
    const found = options.find((o) => o.id === id);
    if (!found) throw new Error(`unknown option ${id} for ${node.id}`);
    return found;
  };

  let prefs = state.prefs;
  switch (answer.kind) {
    case 'single':
      if (answer.optionId) prefs = applyEffects(prefs, option(answer.optionId).effects, 1);
      break;
    case 'multi':
      for (const s of answer.selections ?? []) prefs = applyEffects(prefs, option(s.optionId).effects, s.intensity);
      break;
    case 'scale':
      if (answer.stop !== undefined && node.field) prefs = applyEffects(prefs, [{ path: node.field, value: SCALE_VALUES[answer.stop] }], 1);
      break;
    case 'yesno':
      if (answer.value === 'yes') prefs = applyEffects(prefs, node.yes ?? [], 1);
      else if (answer.value === 'no') prefs = applyEffects(prefs, node.no ?? [], 1);
      break;
  }
  return {
    ...state,
    prefs,
    asked: [...state.asked, node.id],
    round2Asked: state.round2Asked + (node.round === 2 ? 1 : 0),
  };
}
