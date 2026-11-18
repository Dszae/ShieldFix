import { useId, type ReactNode } from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  busy?: boolean;
}

export function Switch({ checked, onChange, label, description, disabled, busy }: SwitchProps) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="block font-medium text-fg">
          {label}
        </label>
        {description && (
          <p id={`${id}-desc`} className="mt-0.5 text-[12px] text-muted">
            {description}
          </p>
        )}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={description ? `${id}-desc` : undefined}
        aria-busy={busy || undefined}
        disabled={disabled || busy}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-5 w-9 flex-none items-center rounded-full border transition-colors duration-150 disabled:opacity-50 ${
          checked ? 'border-accent bg-accent' : 'border-line-strong bg-surface-2'
        }`}
      >
        <span
          aria-hidden
          className={`inline-block h-3.5 w-3.5 rounded-full shadow transition-transform duration-150 ${
            checked ? 'translate-x-[18px] bg-accent-fg' : 'translate-x-[2px] bg-subtle'
          }`}
        />
      </button>
    </div>
  );
}
