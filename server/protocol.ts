import { z } from 'zod';
import { ACTION_INFO, ROOM_INFO } from '../shared/catalog.js';
import type { ActionId, RoomId } from '../shared/catalog.js';
const room = z.enum(ROOM_INFO.map((r) => r.id) as [RoomId, ...RoomId[]]);
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cancel') }),
  z.object({
    type: z.literal('move'),
    x: z.number().finite().min(-1).max(1),
    y: z.number().finite().min(-1).max(1),
  }),
  z.object({ type: z.literal('travel'), room }),
  z.object({
    type: z.literal('act'),
    action: z.enum(Object.keys(ACTION_INFO) as [ActionId, ...ActionId[]]),
    room,
  }),
  z.object({
    type: z.literal('challenge'),
    id: z.string().uuid(),
    answer: z.array(z.number().int().min(0).max(3)).max(8),
  }),
  z.object({ type: z.literal('craft'), recipe: z.string().max(30) }),
  z.object({ type: z.literal('research'), tech: z.string().max(30) }),
  z.object({ type: z.literal('upgrade'), room }),
  z.object({ type: z.literal('build') }),
  z.object({ type: z.literal('use'), item: z.enum(['medkit', 'ration']) }),
  z.object({
    type: z.literal('give'),
    item: z.enum(['medkit', 'ration']),
    amount: z.number().int().min(1).max(5),
    playerId: z.string().uuid(),
  }),
  z.object({
    type: z.literal('expedition'),
    zone: z.string().max(30),
    mode: z.enum(['quiet', 'fast']),
  }),
  z.object({ type: z.literal('join-expedition'), id: z.string().uuid() }),
  z.object({ type: z.literal('vote'), choice: z.number().int().min(0).max(2) }),
  z.object({ type: z.literal('ending'), ending: z.enum(['evacuation', 'autonomy', 'vaccine']) }),
]);
