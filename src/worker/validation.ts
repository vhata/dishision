import { z } from 'zod';
import { FEEDBACK_REASONS } from '../core/feedback';
import { coarsenPoint } from '../shared/location';

// A device fix is coarsened here, at the parse boundary, so no route ever
// holds the raw coordinates; the client coarsens too, as defence in depth.
export const CreateSessionSchema = z.union([
  z.object({ zip: z.string().regex(/^\d{5}$/, 'ZIP must be five digits') }),
  z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).transform(coarsenPoint),
]);

const otherText = z.string().trim().max(500).optional();
const nodeId = z.string().min(1);

export const AnswerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('single'), nodeId, optionId: z.string().min(1).optional(), otherText }),
  z.object({
    kind: z.literal('multi'),
    nodeId,
    selections: z
      .array(z.object({ optionId: z.string().min(1), intensity: z.union([z.literal(0.5), z.literal(1)]) }))
      .max(20)
      .default([]),
    otherText,
  }),
  z.object({
    kind: z.literal('scale'),
    nodeId,
    stop: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).optional(),
    otherText,
  }),
  z.object({ kind: z.literal('yesno'), nodeId, value: z.enum(['yes', 'no', 'either']).optional(), otherText }),
]);

export const SuggestSchema = z.object({ nodeId, text: z.string().trim().min(2).max(80) });

export const RecommendSchema = z.object({ force: z.boolean().optional() });
export const FeedbackSchema = z.object({ reason: z.enum(FEEDBACK_REASONS) });
