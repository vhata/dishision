import { z } from 'zod';

export const CreateSessionSchema = z.union([
  z.object({ zip: z.string().regex(/^\d{5}$/, 'ZIP must be five digits') }),
  z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }),
]);

const otherText = z.string().trim().max(500).optional();
const nodeId = z.string().min(1);

export const AnswerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('single'), nodeId, optionId: z.string().min(1).optional(), otherText }),
  z.object({
    kind: z.literal('multi'),
    nodeId,
    selections: z.array(z.object({ optionId: z.string().min(1), intensity: z.union([z.literal(0.5), z.literal(1)]) })).max(20).default([]),
    otherText,
  }),
  z.object({ kind: z.literal('scale'), nodeId, stop: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(), otherText }),
  z.object({ kind: z.literal('yesno'), nodeId, value: z.enum(['yes', 'no', 'either']).optional(), otherText }),
]);

export const SuggestSchema = z.object({ nodeId, text: z.string().trim().min(2).max(80) });
