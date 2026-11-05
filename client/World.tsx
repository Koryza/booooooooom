import { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { AVATAR_COLORS, ROOM_INFO, WORLD, type RoomId } from '../shared/catalog';
import type { GameState } from '../shared/types';
export default function World({ state, playerId, selected, onSelect }: { state: GameState; playerId: string; selected: RoomId; onSelect: (r: RoomId) => void }) {
  const parent = useRef<HTMLDivElement>(null);
  const latest = useRef({ state, playerId, selected, onSelect }); latest.current = { state, playerId, selected, onSelect };
  useEffect(() => {
    if (!parent.current) return;
    class BunkerScene extends Phaser.Scene {
      private people = new Map<string, Phaser.GameObjects.Container>();
      private gauges = new Map<string, Phaser.GameObjects.Text>();
      private overlay!: Phaser.GameObjects.Graphics;
      private floor!: Phaser.GameObjects.Graphics;
      private signature = '';
      create() {
        this.cameras.main.setBackgroundColor('#101713');
        this.floor = this.add.graphics(); this.overlay = this.add.graphics().setDepth(2);
        this.add.text(32, 20, 'ПЛАН УБЕЖИЩА / СЕКТОР 07', { fontFamily: 'monospace', fontSize: '10px', color: '#68765d', letterSpacing: 2 });
        this.add.text(1120, 20, 'ГЛУБИНА −42 М', { fontFamily: 'monospace', fontSize: '10px', color: '#68765d' }).setOrigin(1, 0);
        for (const [index, r] of ROOM_INFO.entries()) {
          this.add.text(r.x + 14, r.y + 13, `${String(index + 1).padStart(2, '0')}  ${r.label}`, { fontFamily: 'monospace', fontSize: '10px', color: r.color }).setDepth(3);
          this.gauges.set(r.id, this.add.text(r.x + r.w - 12, r.y + r.h - 17, '', { fontFamily: 'monospace', fontSize: '9px', color: '#9ca68c' }).setOrigin(1, 0).setDepth(3));
          this.add.zone(r.x, r.y, r.w, r.h).setOrigin(0).setInteractive({ useHandCursor: true }).on('pointerdown', () => latest.current.onSelect(r.id as RoomId));
        }
      }
      private drawFloor(s: GameState) {
        const g = this.floor; g.clear(); g.fillStyle(0x1d261d); g.fillRect(1100, 208, 22, 470);
        for (let row = 0; row < 3; row++) {
          g.fillStyle(0x20291e); g.fillRect(28, 208 + row * 210, 1094, 50);
          g.lineStyle(1, 0x303c28); g.strokeRect(28, 208 + row * 210, 1094, 50);
          for (let x = 55; x < 1110; x += 70) { g.fillStyle(0x53613a); g.fillRect(x, 230 + row * 210, 13, 2); }
        }
        for (const r of ROOM_INFO) {
          const built = s.rooms[r.id as RoomId].built;
          g.fillStyle(0x080e0a); g.fillRect(r.x - 3, r.y - 3, r.w + 6, r.h + 6);
          g.fillStyle(built ? 0x283128 : 0x171e18); g.fillRect(r.x, r.y, r.w, r.h);
          for (let tx = r.x + 5; tx < r.x + r.w; tx += 24) for (let ty = r.y + 5; ty < r.y + r.h; ty += 24) {
            g.lineStyle(1, built ? 0x303a2e : 0x202920, .7); g.strokeRect(tx, ty, 24, 24);
          }
          g.lineStyle(6, 0x414a38); g.strokeRect(r.x, r.y, r.w, r.h);
          if (!built) { g.lineStyle(1, 0x655c3c, .3); for (let x = r.x; x < r.x + r.w; x += 24) g.lineBetween(x, r.y + 30, x + 60, r.y + 130); continue; }
          const furniture = (x: number, y: number, w: number, h: number, col = 0x53604c) => { g.fillStyle(0x0e150f, .5); g.fillRect(r.x + x + 3, r.y + y + 3, w, h); g.fillStyle(col); g.fillRect(r.x + x, r.y + y, w, h); g.lineStyle(1, 0x708162, .7); g.strokeRect(r.x + x, r.y + y, w, h); };
          if (r.id === 'command') { for (let i = 0; i < 4; i++) { furniture(18 + i * 54, 40, 40, 24); g.fillStyle(0x87a568); g.fillRect(r.x + 22 + i * 54, r.y + 43, 31, 12); g.fillStyle(0x38472c); g.fillRect(r.x + 25 + i * 54, r.y + 46, 12, 2); } furniture(76, 104, 92, 24); }
          else if (r.id === 'living') { for (let i = 0; i < 3; i++) { furniture(20 + i * 76, 42, 50, 28); furniture(20 + i * 76, 96, 50, 28); g.fillStyle(0x89947a); g.fillRect(r.x + 24 + i * 76, r.y + 45, 10, 20); g.fillRect(r.x + 24 + i * 76, r.y + 99, 10, 20); } }
          else if (r.id === 'generator') { furniture(34, 48, 78, 72, 0x706548); furniture(137, 48, 78, 72, 0x706548); for (let i = 0; i < 5; i++) { g.fillStyle(0x414637); g.fillRect(r.x + 43, r.y + 55 + i * 12, 58, 5); g.fillRect(r.x + 146, r.y + 55 + i * 12, 58, 5); } }
          else if (r.id === 'medical') { furniture(24, 46, 64, 32, 0x788377); furniture(24, 101, 64, 28, 0x788377); furniture(166, 43, 60, 44); g.fillStyle(0xc3b3a1); g.fillRect(r.x + 188, r.y + 51, 12, 29); g.fillRect(r.x + 180, r.y + 59, 28, 11); }
          else if (r.id === 'water' || r.id === 'ventilation') { for (let i = 0; i < 3; i++) { furniture(24 + i * 76, 44, 52, 77, 0x405c57); g.fillStyle(0x273e39); g.fillCircle(r.x + 50 + i * 76, r.y + 77, 19); g.lineStyle(2, 0x719181); g.strokeCircle(r.x + 50 + i * 76, r.y + 77, 15); } }
          else if (r.id === 'kitchen') { furniture(16, 41, 215, 25); furniture(40, 96, 72, 26); furniture(142, 96, 72, 26); for (let i = 0; i < 4; i++) { g.fillStyle(0x38482c); g.fillCircle(r.x + 46 + i * 47, r.y + 54, 8); } }
          else if (r.id === 'airlock') { furniture(24, 47, 20, 70, 0x675a45); furniture(196, 47, 20, 70, 0x675a45); g.fillStyle(0x3d4639); g.fillRect(r.x + 80, r.y + 44, 90, 30); g.lineStyle(2, 0x9b865b); g.strokeRect(r.x + 84, r.y + 46, 82, 25); }
          else if (r.id === 'greenhouse') { for (let i = 0; i < 3; i++) { furniture(23 + i * 77, 44, 50, 80); for (let j = 0; j < 5; j++) { g.fillStyle(0x799b53); g.fillCircle(r.x + 37 + i * 77, r.y + 53 + j * 14, 5); g.fillCircle(r.x + 58 + i * 77, r.y + 53 + j * 14, 5); } } }
          else { for (let i = 0; i < 3; i++) { furniture(20 + i * 77, 44, 53, 28); furniture(20 + i * 77, 98, 53, 28); g.lineStyle(1, 0x82916d); g.lineBetween(r.x + 26 + i * 77, r.y + 48, r.x + 65 + i * 77, r.y + 67); } }
          g.fillStyle(0x263323); g.fillRect(r.x + r.w / 2 - 22, r.y + r.h - 4, 44, 12);
          g.fillStyle(0x71825a); g.fillRect(r.x + r.w / 2 - 20, r.y + r.h + 5, 40, 2);
        }
      }
      update(time: number) {
        const { state: s, playerId: me, selected } = latest.current;
        const sig = ROOM_INFO.map(r => s.rooms[r.id as RoomId].built).join(',');
        if (sig !== this.signature) { this.signature = sig; this.drawFloor(s); }
        const g = this.overlay; g.clear();
        for (const r of ROOM_INFO) {
          const room = s.rooms[r.id as RoomId]; const color = room.integrity < 30 ? 0xe08d69 : 0xb0ca83;
          if (selected === r.id) { g.lineStyle(2, 0xbbd985, .85); g.strokeRect(r.x - 4, r.y - 4, r.w + 8, r.h + 8); }
          if (room.built) {
            g.fillStyle(s.power ? color : 0xc0654a, .6 + Math.sin(time / 800) * .2); g.fillRect(r.x + 85, r.y + 4, 80, 3);
            g.fillStyle(s.power ? 0xc1dd92 : 0xda634a, s.power ? .025 : .04 + Math.sin(time / 400) * .02); g.fillRect(r.x + 6, r.y + 6, r.w - 12, r.h - 12);
          }
          this.gauges.get(r.id)?.setText(room.built ? `LV${room.level} / ${Math.ceil(room.integrity)}%` : 'ТРЕБУЕТСЯ ПОСТРОЙКА');
        }
        for (const [id, container] of this.people) if (!s.players.some(p => p.id === id && !p.expedition)) { container.destroy(); this.people.delete(id); }
        for (const p of s.players.filter(p => !p.expedition)) {
          let container = this.people.get(p.id);
          if (!container) {
            const color = Phaser.Display.Color.HexStringToColor(AVATAR_COLORS[p.avatar]).color;
            const body = this.add.graphics(); body.fillStyle(0x000000, .35); body.fillEllipse(1, 8, 23, 12);
            if (p.id === me) { body.lineStyle(1, color, .6); body.strokeEllipse(0, 8, 27, 15); }
            body.fillStyle(color); body.fillRoundedRect(-7, -7, 14, 17, 3); body.fillStyle(0xd3be9a); body.fillCircle(0, -11, 5);
            body.fillStyle(0x1a271a); body.fillRect(-6, 8, 4, 5); body.fillRect(2, 8, 4, 5);
            const name = this.add.text(0, -29, p.name + (p.id === me ? ' · ВЫ' : ''), { fontFamily: 'monospace', fontSize: '10px', color: p.id === me ? '#c6de9b' : '#b9c5ad', backgroundColor: '#101a12', padding: { x: 4, y: 2 } }).setOrigin(.5, 1);
            container = this.add.container(p.x, p.y, [body, name]).setDepth(8); this.people.set(p.id, container);
          }
          container.x = Phaser.Math.Linear(container.x, p.x, .25); container.y = Phaser.Math.Linear(container.y, p.y, .25);
          container.setAlpha(p.connected ? (p.hp <= 0 ? .35 : 1) : .4);
          if (p.task) { g.lineStyle(3, 0xc2dc8c); const fraction = Phaser.Math.Clamp((s.elapsed - p.task.startedAt) / (p.task.endsAt - p.task.startedAt), 0, 1); g.lineBetween(p.x - 12, p.y + 20, p.x - 12 + 24 * fraction, p.y + 20); }
        }
      }
    }
    const game = new Phaser.Game({ type: Phaser.CANVAS, width: WORLD.width, height: WORLD.height, parent: parent.current, transparent: false, scene: BunkerScene, render: { antialias: true }, audio: { noAudio: true }, input: { keyboard: false }, scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, fps: { target: 30, forceSetTimeOut: true }, banner: false });
    return () => game.destroy(true);
  }, []);
  return <div ref={parent} className="world" role="img" aria-label="Карта бункера с помещениями и выжившими"/>;
}
