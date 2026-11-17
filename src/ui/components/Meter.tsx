import type { Tone } from '../lib/format';

const FILL: Record<Tone, string> = {
  neutral: 'bg-subtle',
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-info',
  accent: 'bg-accent',
};

export function ConfidenceMeter({
  value,
  tone,
  label,
}: {
  value: number;
  tone: Tone;
  label: string;
}) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="flex items-center gap-2">
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={v}
        aria-valuetext={`${v}%`}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2"
      >
        <div className={`h-full rounded-full ${FILL[tone]}`} style={{ width: `${v}%` }} />
      </div>
      <span className="tabular w-9 text-right text-[12px] font-medium text-muted">{v}%</span>
    </div>
  );
}
