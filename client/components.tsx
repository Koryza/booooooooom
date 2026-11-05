import type { ReactNode } from 'react';
import { ROLE_INFO, AVATAR_COLORS } from '../shared/catalog';
import type { Player } from '../shared/types';
import type { Role } from '../shared/validation';
export function Avatar({ avatar, size = 42 }: { avatar: number; size?: number }) {
  return <div className="avatar" style={{ width: size, height: size, color: AVATAR_COLORS[avatar], background: AVATAR_COLORS[avatar] + '15' }}><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="M10 8a6 6 0 0 1 12 0v6c0 2-2 5-6 5s-6-3-6-5zM5 29v-5c0-3 5-4 7-4l4 3 4-3c3 0 7 2 7 4v5z"/><path d="M9 10h14M13 12v3m6-3v3" stroke="#141e19" strokeWidth="2"/></svg></div>;
}
export function RolePicker({ value, onChange, disabled = false }: { value: Role; onChange: (r: Role) => void; disabled?: boolean }) {
  return <div className="role-grid">{Object.entries(ROLE_INFO).map(([key, r]) => <button key={key} type="button" className={'role-option ' + (key === value ? 'selected' : '')} onClick={() => onChange(key as Role)} disabled={disabled} title={r.bonus}><b style={{ color: r.color }}>{r.short}</b><span>{r.name}</span></button>)}</div>;
}
export function Meter({ label, value, color = 'var(--green)' }: { label: string; value: number; color?: string }) {
  return <div className="meter"><div><span>{label}</span><b>{Math.ceil(value)}<small>%</small></b></div><div className="track"><i style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: value < 25 ? 'var(--red)' : color }}/></div></div>;
}
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" onClick={onClose}><section role="dialog" aria-modal="true" aria-label={title} className="modal panel" onClick={e => e.stopPropagation()}><header className="panel-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть">✕</button></header>{children}</section></div>;
}
export function PlayerCard({ player, me, host }: { player: Player; me: boolean; host: boolean }) {
  return <div className="player-row"><Avatar avatar={player.avatar}/><div className="grow"><b>{player.name} {me && <small>ВЫ</small>}</b><span style={{ color: ROLE_INFO[player.role].color }}>{ROLE_INFO[player.role].name}{host ? ' · Лидер' : ''}</span></div><span className={'dot ' + (player.connected ? 'online' : '')}/><small>{player.connected ? player.ready ? 'ГОТОВ' : 'В ЛОББИ' : 'НЕТ СВЯЗИ'}</small></div>;
}
