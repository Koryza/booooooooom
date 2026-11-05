import { ROOM_INFO, getRoom, type RoomId } from './catalog.js';
import type { Point } from './types.js';
export function roomAt(p: Point): RoomId | null {
  return (
    (ROOM_INFO.find(
      (r) => p.x >= r.x + 6 && p.x <= r.x + r.w - 6 && p.y >= r.y + 6 && p.y <= r.y + r.h - 6,
    )?.id as RoomId) || null
  );
}
export function walkable(p: Point): boolean {
  if (p.x >= 1100 && p.x <= 1120 && p.y >= 215 && p.y <= 670) return true;
  if (p.x >= 36 && p.x <= 1115 && [208, 418, 628].some((y) => p.y >= y + 6 && p.y <= y + 44))
    return true;
  return ROOM_INFO.some(
    (r) =>
      (p.x >= r.x + 8 && p.x <= r.x + r.w - 8 && p.y >= r.y + 8 && p.y <= r.y + r.h - 8) ||
      (Math.abs(p.x - r.x - r.w / 2) <= 20 && p.y >= r.y + r.h - 10 && p.y <= r.y + r.h + 40),
  );
}
export function sweep(p: Point, dx: number, dy: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 3));
  for (let i = 0; i < steps; i++) {
    if (walkable({ x: p.x + dx / steps, y: p.y })) p.x += dx / steps;
    if (walkable({ x: p.x, y: p.y + dy / steps })) p.y += dy / steps;
  }
}
export function route(p: Point, id: RoomId): Point[] {
  const target = getRoom(id);
  const sourceId = roomAt(p);
  const source = sourceId && getRoom(sourceId);
  const tx = target.x + target.w / 2,
    ty = target.y + target.h / 2,
    tc = target.y + 185;
  if (sourceId === id)
    return [
      { x: tx, y: p.y },
      { x: tx, y: ty },
    ];
  const points: Point[] = [];
  const sc = source
    ? source.y + 185
    : [233, 443, 653].reduce((best, y) => (Math.abs(y - p.y) < Math.abs(best - p.y) ? y : best));
  if (source)
    points.push({ x: source.x + source.w / 2, y: p.y }, { x: source.x + source.w / 2, y: sc });
  else points.push({ x: p.x, y: sc });
  if (Math.abs(sc - tc) > 1) points.push({ x: 1110, y: sc }, { x: 1110, y: tc });
  points.push({ x: tx, y: tc }, { x: tx, y: ty });
  return points;
}
