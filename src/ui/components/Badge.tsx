import type { ReactNode } from 'react';
import type { Tone } from '../lib/format';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted',
  ok: 'bg-ok-soft text-ok-fg',
  warn: 'bg-warn-soft text-warn-fg',
  danger: 'bg-danger-soft text-danger-fg',
  info: 'bg-info-soft text-info-fg',
  accent: 'bg-accent-soft text-accent-soft-fg',
};

const DOTS: Record<Tone, string> = {
  neutral: 'bg-subtle',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-info',
  accent: 'bg-accent',
};

export function Badge({
  tone = 'neutral',
  children,
  dot,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TONES[tone]}`}
    >
      {dot && <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOTS[tone]}`} />}
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  return (
    <span aria-hidden className={`inline-block h-2 w-2 flex-none rounded-full ${DOTS[tone]}`} />
  );
}
