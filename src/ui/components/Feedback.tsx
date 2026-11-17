import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { Tone } from '../lib/format';

export function Spinner({ size = 16, label }: { size?: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className="animate-spin"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

const ALERT_STYLES: Record<
  Exclude<Tone, 'neutral' | 'accent'>,
  { box: string; icon: ReactNode }
> = {
  ok: { box: 'bg-ok-soft text-ok-fg', icon: <CheckCircle2 size={16} aria-hidden /> },
  warn: { box: 'bg-warn-soft text-warn-fg', icon: <AlertTriangle size={16} aria-hidden /> },
  danger: { box: 'bg-danger-soft text-danger-fg', icon: <XCircle size={16} aria-hidden /> },
  info: { box: 'bg-info-soft text-info-fg', icon: <Info size={16} aria-hidden /> },
};

export function Alert({
  tone = 'info',
  title,
  children,
  action,
  role,
}: {
  tone?: Exclude<Tone, 'neutral' | 'accent'>;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  role?: 'alert' | 'status';
}) {
  const s = ALERT_STYLES[tone];
  return (
    <div role={role} className={`flex gap-2.5 rounded-lg px-3 py-2.5 ${s.box}`}>
      <span className="mt-0.5 flex-none">{s.icon}</span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-subtle">
        {icon}
      </div>
      <p className="font-semibold text-fg">{title}</p>
      {children && <div className="mt-1 max-w-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-surface-2 ${className}`} />;
}

export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-2 py-10 text-muted">
      <Spinner size={16} />
      <span>{label}…</span>
    </div>
  );
}
