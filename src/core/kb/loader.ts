import archetypes from '../../../kb/archetypes.json';
import lexicon from '../../../kb/lexicon.json';
import questions from '../../../kb/questions.json';
import { KB_SCHEMA_VERSION, type KbAddition, KbAdditionSchema, type KnowledgeBase, KnowledgeBaseSchema } from './schema';
import {
  archetypeIdIssues,
  contextOf,
  kbIssues,
  lexiconIssues,
  OVERLAY_PREFIX,
  optionIssues,
  staticOptionsRefusal,
  type ValidationContext,
} from './validate';

/** Parses and semantically validates a base knowledge base, throwing with every problem found. */
export function parseKb(raw: unknown): KnowledgeBase {
  const kb = KnowledgeBaseSchema.parse(raw);
  const issues = kbIssues(kb);
  if (issues.length > 0) throw new Error(`knowledge base failed validation:\n${issues.map((i) => `- ${i}`).join('\n')}`);
  return kb;
}

let cached: KnowledgeBase | undefined;
export function loadBaseKb(): KnowledgeBase {
  cached ??= parseKb({ version: KB_SCHEMA_VERSION, questions, archetypes, lexicon });
  return cached;
}

export interface RejectedAddition {
  id: string;
  error: string;
}

export interface AdditionRow {
  id: string;
  [key: string]: unknown;
}

/** Overlay ids are `kb_` plus the row id, never the payload id, so two rows cannot collide. */
export const overlayId = (rowId: string) => `${OVERLAY_PREFIX}${rowId}`;

/** Archetype rows merge first so option and lexicon rows can reference them regardless of row order. */
const KIND_ORDER: Record<KbAddition['kind'], number> = { archetype: 0, option: 1, lexicon: 1 };

/** Adds one validated row to `kb` in place, or returns why it was rejected. */
function addRow(kb: KnowledgeBase, ctx: ValidationContext, rowId: string, add: KbAddition): string | undefined {
  const id = overlayId(rowId);
  switch (add.kind) {
    case 'archetype': {
      const bad = archetypeIdIssues(id);
      if (bad.length > 0) return `archetype id ${id} ${bad.join('; ')}`;
      if (kb.archetypes.some((a) => a.id === id)) return `duplicate archetype id ${id}`;
      kb.archetypes.push({ ...add.payload, id });
      return undefined;
    }
    case 'option': {
      const node = kb.questions.find((q) => q.id === add.nodeId);
      if (!node) return `unknown node ${add.nodeId}`;
      const refusal = staticOptionsRefusal(node);
      if (refusal) return refusal;
      if (node.options.some((o) => o.id === id)) return `duplicate option id ${id} in node ${node.id}`;
      const issues = optionIssues(add.payload, ctx, 'payload');
      if (issues.length > 0) return issues.join('; ');
      node.options.push({ ...add.payload, id });
      return undefined;
    }
    case 'lexicon': {
      const issues = lexiconIssues(add.payload, ctx, 'payload');
      if (issues.length > 0) return issues.join('; ');
      kb.lexicon.push(add.payload);
      return undefined;
    }
  }
}

/**
 * Merges approved additions over a base KB. Never mutates the base. Each row is
 * checked on its own against the KB built so far; a row that fails the schema or
 * the semantic checks is listed in `rejected`, in input order, and the rest still merge.
 */
export function mergeKb(base: KnowledgeBase, additions: AdditionRow[]): { kb: KnowledgeBase; rejected: RejectedAddition[] } {
  const kb: KnowledgeBase = structuredClone(base);
  const rejected: (RejectedAddition & { index: number })[] = [];
  const valid: { index: number; rowId: string; add: KbAddition }[] = [];
  for (const [index, row] of additions.entries()) {
    const reject = (error: string) => rejected.push({ index, id: String(row.id), error });
    if (typeof row.id !== 'string' || row.id === '') {
      reject('row id must be a non-empty string');
      continue;
    }
    const parsed = KbAdditionSchema.safeParse(row);
    if (!parsed.success) {
      reject(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
      continue;
    }
    if (parsed.data.kbSchemaVersion !== KB_SCHEMA_VERSION) {
      reject(`schema version ${parsed.data.kbSchemaVersion} != ${KB_SCHEMA_VERSION}`);
      continue;
    }
    valid.push({ index, rowId: row.id, add: parsed.data });
  }
  // Stable sort: rows of one rank keep their input order.
  valid.sort((a, b) => KIND_ORDER[a.add.kind] - KIND_ORDER[b.add.kind]);
  let ctx = contextOf(kb);
  for (const { index, rowId, add } of valid) {
    const error = addRow(kb, ctx, rowId, add);
    if (error) rejected.push({ index, id: rowId, error });
    else if (add.kind === 'archetype') ctx = contextOf(kb);
  }
  rejected.sort((a, b) => a.index - b.index);
  return { kb, rejected: rejected.map(({ id, error }) => ({ id, error })) };
}
