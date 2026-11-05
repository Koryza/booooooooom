import { useEffect, useRef, type ReactNode } from 'react';
import {
  Backpack,
  BriefcaseBusiness,
  Eye,
  FileText,
  Fingerprint,
  HeartPulse,
  Puzzle,
  Sparkles,
  LockKeyhole,
  X,
} from 'lucide-react';
import { AVATAR_COLORS, CATEGORY_INFO } from '../shared/catalog';
import type { Category } from '../shared/types';
const icons = {
  profession: BriefcaseBusiness,
  biology: Fingerprint,
  health: HeartPulse,
  hobby: Sparkles,
  phobia: Eye,
  baggage: Backpack,
  fact: FileText,
  trait: Puzzle,
};
export function CategoryIcon({ category, size = 17 }: { category: Category; size?: number }) {
  const Icon = icons[category];
  return <Icon size={size} />;
}
export function Avatar({
  avatar,
  name,
  size = 44,
}: {
  avatar: number;
  name?: string;
  size?: number;
}) {
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        color: AVATAR_COLORS[avatar % AVATAR_COLORS.length],
        backgroundColor: AVATAR_COLORS[avatar % AVATAR_COLORS.length] + '18',
      }}
      aria-hidden="true"
    >
      <svg viewBox="0 0 40 44">
        <path d="M8 42v-8c0-6 6-10 12-10s12 4 12 10v8" fill="currentColor" />
        <circle cx="20" cy="15" r="9" fill="currentColor" />
        <path d="M11 12c2-10 16-12 19 1l-9-4z" fill="#25251e" />
        <path d="M16 17h2m5 0h2M17 23h6" stroke="#25251e" strokeWidth="2" />
      </svg>
      {name && <span>{name.slice(0, 1)}</span>}
    </div>
  );
}
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-icon">
        <span />
      </span>
      <div>
        БУНКЕР<small>ПРАВО НА БУДУЩЕЕ</small>
      </div>
    </div>
  );
}
export function HiddenCard({ category }: { category: Category }) {
  return (
    <div className="hidden-card">
      <CategoryIcon category={category} size={13} />
      <span>{CATEGORY_INFO[category].name}</span>
      <LockKeyhole size={11} />
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const elements = () => [
      ...(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input,select,a[href]',
      ) || []),
    ];
    elements()[0]?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close.current();
      if (e.key === 'Tab') {
        const list = elements(),
          first = list[0],
          last = list.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={dialog}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
