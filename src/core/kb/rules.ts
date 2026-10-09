import { getPath, type DinnerPreferences } from '../preferences';

export type RuleOp = 'gte' | 'lte' | 'eq' | 'set' | 'unset' | 'includes';
export type Rule =
  | { path: string; op: RuleOp; value?: number | string | boolean }
  | { all: Rule[] }
  | { any: Rule[] }
  | { not: Rule };

export type Derived = Record<string, unknown>;

function isSet(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}

export function evalRule(rule: Rule, prefs: DinnerPreferences, derived: Derived = {}): boolean {
  if ('all' in rule) return rule.all.every((r) => evalRule(r, prefs, derived));
  if ('any' in rule) return rule.any.some((r) => evalRule(r, prefs, derived));
  if ('not' in rule) return !evalRule(rule.not, prefs, derived);
  const v = rule.path.startsWith('derived.') ? derived[rule.path.slice('derived.'.length)] : getPath(prefs, rule.path);
  switch (rule.op) {
    case 'set':
      return isSet(v);
    case 'unset':
      return !isSet(v);
    case 'eq':
      return v === rule.value;
    case 'gte':
      return typeof v === 'number' && typeof rule.value === 'number' && v >= rule.value;
    case 'lte':
      return typeof v === 'number' && typeof rule.value === 'number' && v <= rule.value;
    case 'includes':
      return Array.isArray(v) && v.includes(rule.value as never);
  }
}
