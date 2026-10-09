import { z } from 'zod';
import { SCORE_KEYS } from '../types';
import type { Rule } from './rules';

export const KB_SCHEMA_VERSION = 1;

export const ScoresSchema = z.partialRecord(z.enum(SCORE_KEYS), z.number().min(0).max(1));

export const RuleSchema: z.ZodType<Rule> = z.lazy(() =>
  z.union([
    z.object({
      path: z.string().min(1),
      op: z.enum(['gte', 'lte', 'eq', 'set', 'unset', 'includes']),
      value: z.union([z.number(), z.string(), z.boolean()]).optional(),
    }),
    z.object({ all: z.array(RuleSchema) }),
    z.object({ any: z.array(RuleSchema) }),
    z.object({ not: RuleSchema }),
  ]),
);

export const EffectSchema = z.object({
  path: z.string().min(1),
  op: z.enum(['set', 'add', 'push', 'max', 'min']).optional(),
  value: z.union([z.number(), z.string()]),
});

export const OptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  effects: z.array(EffectSchema).default([]),
});
export type QuestionOption = z.infer<typeof OptionSchema>;

export const NodeKindSchema = z.enum(['single', 'multi', 'scale', 'yesno']);
export type NodeKind = z.infer<typeof NodeKindSchema>;

export const NodeSchema = z
  .object({
    id: z.string().min(1),
    kind: NodeKindSchema,
    prompt: z.string().min(1),
    help: z.string().optional(),
    round: z.union([z.literal(1), z.literal(2)]),
    priority: z.number().default(0),
    applies: z.array(RuleSchema).default([]),
    options: z.array(OptionSchema).default([]),
    dynamicOptions: z.enum(['archetypes']).optional(),
    /** scale only: five labels from the low pole to the high pole */
    stops: z.array(z.string()).length(5).optional(),
    /** scale only: preference path that receives -1, -0.5, 0, 0.5, 1 */
    field: z.string().optional(),
    yes: z.array(EffectSchema).optional(),
    no: z.array(EffectSchema).optional(),
    allowMissingOption: z.boolean().default(false),
    /** How free text on this node should be read; 'avoid' turns bare mentions into exclusions. */
    otherIntent: z.enum(['avoid']).optional(),
  })
  .refine((n) => n.kind !== 'scale' || (n.field && n.stops), { message: 'scale nodes need field and stops' })
  .refine((n) => n.kind !== 'yesno' || (n.yes && n.no), { message: 'yesno nodes need yes and no effects' })
  .refine((n) => !(n.kind === 'single' || n.kind === 'multi') || n.options.length > 0 || n.dynamicOptions, {
    message: 'choice nodes need options or dynamicOptions',
  });
export type QuestionNode = z.infer<typeof NodeSchema>;

export const ArchetypeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  cuisine: z.string().min(1),
  category: z.string().min(1),
  proteins: z.array(z.string()).default([]),
  carbs: z.array(z.string()).default([]),
  formats: z.array(z.string()).default([]),
  searchTerms: z.array(z.string().min(1)).min(1),
  scores: ScoresSchema,
});
export type Archetype = z.infer<typeof ArchetypeSchema>;

export const LexiconEntrySchema = z.object({
  pattern: z.string().min(1),
  scores: ScoresSchema.default({}),
  proteins: z.array(z.string()).default([]),
  carbs: z.array(z.string()).default([]),
  cuisine: z.string().optional(),
  formats: z.array(z.string()).default([]),
  archetypeId: z.string().optional(),
});
export type LexiconEntry = z.infer<typeof LexiconEntrySchema>;

export const KnowledgeBaseSchema = z.object({
  version: z.number().int(),
  questions: z.array(NodeSchema),
  archetypes: z.array(ArchetypeSchema),
  lexicon: z.array(LexiconEntrySchema),
});
export type KnowledgeBase = z.infer<typeof KnowledgeBaseSchema>;

export const KbAdditionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('archetype'), kbSchemaVersion: z.number().int(), payload: ArchetypeSchema }),
  z.object({ kind: z.literal('option'), kbSchemaVersion: z.number().int(), nodeId: z.string().min(1), payload: OptionSchema }),
  z.object({ kind: z.literal('lexicon'), kbSchemaVersion: z.number().int(), payload: LexiconEntrySchema }),
]);
export type KbAddition = z.infer<typeof KbAdditionSchema>;
