import { z } from 'zod';
export const roles = ['engineer', 'medic', 'soldier', 'scientist', 'scout', 'mechanic'] as const;
export type Role = (typeof roles)[number];
export const profileSchema = z.object({
  name: z.string().trim().min(2, 'Никнейм: от 2 до 18 символов').max(18),
  role: z.enum(roles),
  avatar: z.number().int().min(0).max(5),
});
export const codeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z2-9]{6}$/, 'Код комнаты состоит из 6 символов');
export const difficulties = ['normal', 'hard', 'nightmare'] as const;
export type Difficulty = (typeof difficulties)[number];
