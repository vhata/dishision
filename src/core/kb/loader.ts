import questions from '../../../kb/questions.json';
import archetypes from '../../../kb/archetypes.json';
import lexicon from '../../../kb/lexicon.json';
import { KB_SCHEMA_VERSION, KbAdditionSchema, KnowledgeBaseSchema, type KnowledgeBase } from './schema';

export function parseKb(raw: unknown): KnowledgeBase {
  return KnowledgeBaseSchema.parse(raw);
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

const prefix = (id: string) => (id.startsWith('kb_') ? id : `kb_${id}`);

/** Merges approved additions over a base KB. Never mutates the base. */
export function mergeKb(base: KnowledgeBase, additions: AdditionRow[]): { kb: KnowledgeBase; rejected: RejectedAddition[] } {
  const kb: KnowledgeBase = structuredClone(base);
  const rejected: RejectedAddition[] = [];
  for (const row of additions) {
    const parsed = KbAdditionSchema.safeParse(row);
    if (!parsed.success) {
      rejected.push({ id: row.id, error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
      continue;
    }
    const add = parsed.data;
    if (add.kbSchemaVersion !== KB_SCHEMA_VERSION) {
      rejected.push({ id: row.id, error: `schema version ${add.kbSchemaVersion} != ${KB_SCHEMA_VERSION}` });
      continue;
    }
    switch (add.kind) {
      case 'archetype':
        kb.archetypes.push({ ...add.payload, id: prefix(add.payload.id) });
        break;
      case 'option': {
        const node = kb.questions.find((q) => q.id === add.nodeId);
        if (!node) {
          rejected.push({ id: row.id, error: `unknown node ${add.nodeId}` });
          break;
        }
        node.options.push({ ...add.payload, id: prefix(add.payload.id) });
        break;
      }
      case 'lexicon':
        kb.lexicon.push(add.payload);
        break;
    }
  }
  return { kb, rejected };
}
