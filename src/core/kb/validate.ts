/**
 * Semantic checks the Zod schema cannot express: patterns compile, effect and
 * rule paths name real preference fields with values of the right type, and
 * references and ids resolve. A knowledge base that passes these checks
 * cannot make tagging or answering throw.
 */
import {
  BEEF_KEYS,
  CARB_KEYS,
  type DinnerPreferences,
  type Hunger,
  type Leftovers,
  PROTEIN_KEYS,
  QUALITY_KEYS,
  SEAFOOD_KEYS,
} from '../preferences';
import type { Derived } from '../questions';
import type { Rule } from './rules';
import type { Archetype, KnowledgeBase, LexiconEntry, QuestionNode, QuestionOption } from './schema';

type Effect = QuestionOption['effects'][number];

export type FieldSpec =
  | { kind: 'number' }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'list' }
  /** A record of numbers. `keys` closes the record; `archetypes` keys must name an archetype. */
  | { kind: 'record'; keys?: readonly string[] }
  /** A value rules can only test with set or unset. */
  | { kind: 'opaque' };

/** The spec a value of type V must have, so a spec that disagrees with its type fails to compile. */
type SpecFor<V> = [V] extends [number]
  ? { kind: 'number' }
  : [V] extends [string]
    ? { kind: 'enum'; values: readonly V[] }
    : [V] extends [string[]]
      ? { kind: 'list' }
      : [V] extends [Record<string, number>]
        ? string extends keyof V
          ? { kind: 'record' }
          : { kind: 'record'; keys: readonly (keyof V)[] }
        : { kind: 'opaque' };

/** Keys of T without its index signature. */
type KnownKeys<T> = keyof { [K in keyof T as string extends K ? never : number extends K ? never : K]: T[K] };

/** Exactly one spec per field of T, each matching the field's type. */
type SpecsFor<T> = { [K in KnownKeys<T>]-?: SpecFor<NonNullable<T[K]>> };

/** Returns `values`, failing to compile unless they list every member of T. */
const every =
  <T extends string>() =>
  <const V extends readonly T[]>(values: V & ([Exclude<T, V[number]>] extends [never] ? unknown : { missing: Exclude<T, V[number]> })) =>
    values;

const HUNGER = every<Hunger>()(['light', 'normal', 'very_hungry']);
const LEFTOVERS = every<Leftovers>()(['want', 'avoid', 'indifferent']);
const BUDGET_KEYS = every<keyof DinnerPreferences['budget']>()(['max', 'flexible']);

/**
 * The shape of `DinnerPreferences` as effects and rules may address it. The
 * `satisfies` clause makes tsc reject a field added to, renamed in or retyped in
 * the interface without a matching entry here.
 */
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
  budget: { kind: 'record', keys: BUDGET_KEYS },
  recentMeals: { kind: 'list' },
  futureMeals: { kind: 'list' },
  exclusions: { kind: 'list' },
  notes: { kind: 'list' },
} satisfies SpecsFor<DinnerPreferences>;

/** Values rules can read under `derived.`, checked against `Derived` from questions.ts the same way. */
export const DERIVED_FIELDS: Readonly<Record<string, FieldSpec>> = {
  plausibleArchetypes: { kind: 'opaque' },
  plausibleArchetypeCount: { kind: 'number' },
} satisfies SpecsFor<Derived>;

/** Ids starting with this belong to overlay rows. */
export const OVERLAY_PREFIX = 'kb_';

/** What a path resolves to once its field and key are known. */
type Target =
  | { kind: 'number' }
  | { kind: 'enum'; field: string; values: readonly string[] }
  | { kind: 'list' }
  | { kind: 'record' }
  | { kind: 'opaque' };

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
  const spec = Object.hasOwn(PREFERENCE_FIELDS, field) ? PREFERENCE_FIELDS[field] : undefined;
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

/** Resolves a rule path, which may also read a derived value. */
function resolveRulePath(path: string, ctx: ValidationContext): Target | string {
  if (!path.startsWith('derived.')) return resolvePath(path, ctx);
  const key = path.slice('derived.'.length);
  const spec = Object.hasOwn(DERIVED_FIELDS, key) ? DERIVED_FIELDS[key] : undefined;
  if (!spec) return `unknown derived value ${key}`;
  if (spec.kind === 'enum') return { kind: 'enum', field: path, values: spec.values };
  return spec;
}

export function effectIssues(effect: Effect, ctx: ValidationContext): string[] {
  const { path, op, value } = effect;
  const target = resolvePath(path, ctx);
  if (typeof target === 'string') return [target];
  switch (target.kind) {
    case 'opaque':
      return [`${path} cannot be written`];
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
  const target = resolveRulePath(path, ctx);
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
      if (target.kind === 'list' || target.kind === 'record' || target.kind === 'opaque') return fail(`eq cannot compare ${path}`);
      if (target.kind === 'enum' && !target.values.includes(String(value))) {
        return fail(`${target.field} must be one of ${target.values.join(', ')}`);
      }
      if (target.kind === 'number' && typeof value !== 'number') return fail(`eq on ${path} needs a number`);
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
    issues.push(`${where}.pattern: invalid regular expression: ${(e as Error).message.replace(/^Invalid regular expression: /, '')}`);
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
