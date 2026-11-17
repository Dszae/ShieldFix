import type { ReactNode } from 'react';

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-xl border border-line bg-surface shadow-card ${padded ? 'p-4' : ''} ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
  as: Heading = 'h2',
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  as?: 'h2' | 'h3';
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Heading className="text-[14px] font-semibold text-fg">{title}</Heading>
        {description && <p className="mt-0.5 text-muted">{description}</p>}
      </div>
      {action && <div className="flex flex-none items-center gap-2">{action}</div>}
    </div>
  );
}

export function Divider() {
  return <hr className="border-line" />;
}
