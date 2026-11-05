import { z } from 'zod';
import { CATEGORIES } from '../shared/types.js';
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('reveal'), category: z.enum(CATEGORIES) }).strict(),
  z.object({ type: z.literal('readyVote'), ready: z.boolean() }).strict(),
  z.object({ type: z.literal('advance') }).strict(),
  z.object({ type: z.literal('vote'), targetId: z.string().uuid() }).strict(),
  z.object({ type: z.literal('nextRound') }).strict(),
  z
    .object({
      type: z.literal('special'),
      cardId: z.string().uuid(),
      targetId: z.string().uuid().optional(),
      category: z.enum(CATEGORIES).optional(),
    })
    .strict(),
  z.object({ type: z.literal('rematch') }).strict(),
]);
