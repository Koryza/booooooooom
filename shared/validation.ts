import { z } from 'zod';
export const profileSchema = z
  .object({
    name: z.string().trim().min(2, 'Позывной: от 2 до 18 символов').max(18, 'Не более 18 символов'),
  })
  .strict();
export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{6}$/, 'Код комнаты состоит из 6 символов');
export const settingsSchema = z
  .object({
    seats: z.number().int().min(1).max(11).nullable(),
    revealSeconds: z.number().int().min(20).max(180),
    discussionSeconds: z.number().int().min(20).max(300),
    voteSeconds: z.number().int().min(15).max(120),
  })
  .strict();
