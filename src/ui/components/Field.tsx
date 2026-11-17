import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

const CONTROL =
  'w-full rounded-lg border bg-surface px-3 py-2 text-[13px] text-fg placeholder:text-subtle transition-colors focus:border-accent focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-0';

interface FieldShell {
  label: string;
  hint?: ReactNode;
  error?: string | null;
}

function Shell({
  id,
  label,
  hint,
  error,
  children,
}: FieldShell & { id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] font-medium text-fg">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-err`} className="mt-1 text-[12px] text-danger-fg">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1 text-[12px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, error?: string | null, hint?: ReactNode) {
  return error ? `${id}-err` : hint ? `${id}-hint` : undefined;
}

export function TextField({
  label,
  hint,
  error,
  className = '',
  ...rest
}: FieldShell & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        aria-invalid={!!error || undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${CONTROL} ${error ? 'border-danger' : 'border-line-strong'} ${className}`}
        {...rest}
      />
    </Shell>
  );
}

export function TextArea({
  label,
  hint,
  error,
  className = '',
  ...rest
}: FieldShell & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        aria-invalid={!!error || undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${CONTROL} ${error ? 'border-danger' : 'border-line-strong'} font-mono text-[12px] ${className}`}
        {...rest}
      />
    </Shell>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  className = '',
  ...rest
}: FieldShell & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Shell id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        aria-invalid={!!error || undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${CONTROL} ${error ? 'border-danger' : 'border-line-strong'} ${className}`}
        {...rest}
      >
        {children}
      </select>
    </Shell>
  );
}
