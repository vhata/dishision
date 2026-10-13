/**
 * Semantic checks the Zod schema cannot express: patterns compile, effect and
 * rule paths name real preference fields with values of the right type, and
 * references and ids resolve. A knowledge base that passes these checks
 * cannot make tagging or answering throw.
 */
import { BEEF_KEYS, CARB_KEYS, type Hunger, type Leftovers, PROTEIN_KEYS, QUALITY_KEYS, SEAFOOD_KEYS } from '../preferences';
import type { Rule } from './rules';
import type { Archetype, KnowledgeBase, LexiconEntry, QuestionNode, QuestionOption } from './schema';

type Effect = QuestionOption['effects'][number];

export type FieldSpec =
  | { kind: 'number' }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'list' }
  /** A record of numbers. `keys` closes the record; `archetypes` keys must name an archetype. */
  | { kind: 'record'; keys?: readonly string[] };

const HUNGER = ['light', 'normal', 'very_hungry'] as const satisfies readonly Hunger[];
const LEFTOVERS = ['want', 'avoid', 'indifferent'] as const satisfies readonly Leftovers[];

/** The shape of `DinnerPreferences` as effects and rules may address it. */
export const PREFERENCE_FIELDS: Readonly<Record<string, FieldSpec>> = {
  hunger: { kind: 'enum', values: HUNGER },
  desiredQualities: { kind: 'record', keys: QUALITY_KEYS },
  heaviness: { kind: 'number' },
  noIdea: { kind: 'number' },
  proteins: { kind: 'record', keys: PROTEIN_KEYS },
  seafood: { kind: 'record', keys: SEAFOOD_KEYS },
  beef: { kind: 'record', keys: BEEF_KEYS },
  carbs: { kind: 'record', keys: CARB_KEYS },
  cuisines: { kind: 'record' },
  archetypes: { kind: 'record' },
  novelty: { kind: 'number' },
  handheld: { kind: 'number' },
  leftovers: { kind: 'enum', values: LEFTOVERS },
  budget: { kind: 'record', keys: ['max', 'flexible'] },
  recentMeals: { kind: 'list' },
  futureMeals: { kind: 'list' },
  exclusions: { kind: 'list' },
  notes: { kind: 'list' },
};

/** Values rules can read under `derived.`; kept in step with `deriveContext` by a test. */
export const DERIVED_KEYS = ['plausibleArchetypes', 'plausibleArchetypeCount'] as const;

/** Ids starting with this belong to overlay rows. */
export const OVERLAY_PREFIX = 'kb_';

/** What a path resolves to once its field and key are known. */
type Target = { kind: 'number' } | { kind: 'enum'; field: string; values: readonly string[] } | { kind: 'list' } | { kind: 'record' };

export interface ValidationContext {
  archetypeIds: ReadonlySet<string>;
}

export function contextOf(kb: Pick<KnowledgeBase, 'archetypes'>): ValidationContext {
  return { archetypeIds: new Set(kb.archetypes.map((a) => a.id)) };
}

/** Resolves a preference path, or returns the reason it does not resolve. */
function resolvePath(path: string, ctx: ValidationContext): Target | string {
  const parts = path.split('.');
  const [field, key] = parts;
  if (parts.length > 2 || !field || key === '') return `bad path ${path}`;
  const spec = PREFERENCE_FIELDS[field];
  if (!spec) return `unknown preference field ${field}`;
  if (spec.kind === 'record') {
    if (key === undefined) return { kind: 'record' };
    if (spec.keys && !spec.keys.includes(key)) return `unknown key ${key} for ${field}`;
    if (field === 'archetypes' && !ctx.archetypeIds.has(key)) return `unknown archetype ${key}`;
    return { kind: 'number' };
  }
  if (key !== undefined) return `${field} takes no key`;
  if (spec.kind === 'enum') return { kind: 'enum', field, values: spec.values };
  return spec;
}

export function effectIssues(effect: Effect, ctx: ValidationContext): string[] {
  const { path, op, value } = effect;
  const target = resolvePath(path, ctx);
  if (typeof target === 'string') return [target];
  switch (target.kind) {
    case 'record':
      return [`${path} needs a key`];
    case 'list':
      if ((op ?? 'push') !== 'push') return [`${path} only supports push`];
      return typeof value === 'string' ? [] : [`${path} needs a string`];
    case 'enum':
      if ((op ?? 'set') !== 'set') return [`${path} only supports set`];
      return typeof value === 'string' && target.values.includes(value)
        ? []
        : [`${target.field} must be one of ${target.values.join(', ')}`];
    case 'number':
      if (op === 'push') return [`${path} does not support push`];
      return typeof value === 'number' ? [] : [`${path} needs a number`];
  }
}

export function ruleIssues(rule: Rule, ctx: ValidationContext, where: string): string[] {
  if ('all' in rule) return rule.all.flatMap((r, i) => ruleIssues(r, ctx, `${where}.all[${i}]`));
  if ('any' in rule) return rule.any.flatMap((r, i) => ruleIssues(r, ctx, `${where}.any[${i}]`));
  if ('not' in rule) return ruleIssues(rule.not, ctx, `${where}.not`);
  const fail = (msg: string) => [`${where}: ${msg}`];
  const { path, op, value } = rule;
  if (path.startsWith('derived.')) {
    const key = path.slice('derived.'.length);
    if (!(DERIVED_KEYS as readonly string[]).includes(key)) return fail(`unknown derived value ${key}`);
    if ((op === 'gte' || op === 'lte') && typeof value !== 'number') return fail(`${op} needs a number`);
    return [];
  }
  const target = resolvePath(path, ctx);
  if (typeof target === 'string') return fail(target);
  switch (op) {
    case 'set':
    case 'unset':
      return [];
    case 'gte':
    case 'lte':
      if (target.kind !== 'number') return fail(`${op} needs a numeric field, ${path} is not one`);
      return typeof value === 'number' ? [] : fail(`${op} needs a number`);
    case 'eq':
      if (value === undefined) return fail('eq needs a value');
      if (target.kind === 'enum' && !target.values.includes(String(value))) {
        return fail(`${target.field} must be one of ${target.values.join(', ')}`);
      }
      if (target.kind === 'number' && typeof value !== 'number') return fail(`eq on ${path} needs a number`);
      if (target.kind === 'list' || target.kind === 'record') return fail(`eq cannot compare ${path}`);
      return [];
    case 'includes':
      if (target.kind !== 'list') return fail(`includes needs a list field, ${path} is not one`);
      return typeof value === 'string' ? [] : fail('includes needs a string');
  }
}

export function optionIssues(option: QuestionOption, ctx: ValidationContext, where: string): string[] {
  return option.effects.flatMap((e, i) => effectIssues(e, ctx).map((msg) => `${where}.effects[${i}]: ${msg}`));
}

/** Why a node cannot take static options, or undefined when it can. */
export function staticOptionsRefusal(node: QuestionNode): string | undefined {
  if (node.dynamicOptions) return `node ${node.id} builds its options dynamically`;
  if (node.kind === 'scale' || node.kind === 'yesno') return `node ${node.id} is a ${node.kind} node and takes no options`;
  return undefined;
}

/** Problems with an archetype id, phrased to follow "id <id>"; a "." would split `archetypes.<id>` effect paths. */
export function archetypeIdIssues(id: string): string[] {
  return id.includes('.') ? ['must not contain "."'] : [];
}

export function lexiconIssues(entry: LexiconEntry, ctx: ValidationContext, where: string): string[] {
  const issues: string[] = [];
  try {
    new RegExp(entry.pattern, 'i');
  } catch (e) {
    issues.push(`${where}.pattern: invalid regular expression (${(e as Error).message})`);
  }
  if (entry.archetypeId !== undefined && !ctx.archetypeIds.has(entry.archetypeId)) {
    issues.push(`${where}.archetypeId: unknown archetype ${entry.archetypeId}`);
  }
  return issues;
}

function nodeIssues(node: QuestionNode, ctx: ValidationContext): string[] {
  const where = `questions[${node.id}]`;
  const issues: string[] = [];
  const refusal = staticOptionsRefusal(node);
  if (refusal && node.options.length > 0) issues.push(`${where}: ${refusal}`);
  const optionIds = new Set<string>();
  for (const option of node.options) {
    const at = `${where}.options[${option.id}]`;
    if (optionIds.has(option.id)) issues.push(`${at}: duplicate option id`);
    if (option.id.startsWith(OVERLAY_PREFIX)) issues.push(`${at}: id prefix ${OVERLAY_PREFIX} is reserved for overlay rows`);
    optionIds.add(option.id);
    issues.push(...optionIssues(option, ctx, at));
  }
  if (node.field !== undefined) {
    const target = resolvePath(node.field, ctx);
    if (typeof target === 'string') issues.push(`${where}.field: ${target}`);
    else if (target.kind !== 'number') issues.push(`${where}.field: scale field ${node.field} needs a numeric field`);
  }
  for (const side of ['yes', 'no'] as const) {
    (node[side] ?? []).forEach((e, i) => {
      for (const msg of effectIssues(e, ctx)) issues.push(`${where}.${side}[${i}]: ${msg}`);
    });
  }
  node.applies.forEach((r, i) => {
    issues.push(...ruleIssues(r, ctx, `${where}.applies[${i}]`));
  });
  return issues;
}

function baseArchetypeIssues(archetypes: Archetype[]): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();
  for (const a of archetypes) {
    const where = `archetypes[${a.id}]`;
    if (seen.has(a.id)) issues.push(`${where}: duplicate archetype id`);
    seen.add(a.id);
    if (a.id.startsWith(OVERLAY_PREFIX)) issues.push(`${where}: id prefix ${OVERLAY_PREFIX} is reserved for overlay rows`);
    for (const msg of archetypeIdIssues(a.id)) issues.push(`${where}: id ${msg}`);
  }
  return issues;
}

/** Every semantic problem in a base knowledge base; empty when it is sound. */
export function kbIssues(kb: KnowledgeBase): string[] {
  const ctx = contextOf(kb);
  const issues = baseArchetypeIssues(kb.archetypes);
  const questionIds = new Set<string>();
  for (const node of kb.questions) {
    if (questionIds.has(node.id)) issues.push(`questions[${node.id}]: duplicate question id`);
    questionIds.add(node.id);
    issues.push(...nodeIssues(node, ctx));
  }
  kb.lexicon.forEach((entry, i) => {
    issues.push(...lexiconIssues(entry, ctx, `lexicon[${i}]`));
  });
  return issues;
}
