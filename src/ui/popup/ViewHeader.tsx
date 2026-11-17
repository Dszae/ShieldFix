import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { IconButton } from '../components/Button';

export function ViewHeader({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack: () => void;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
      <IconButton label="Back" onClick={onBack}>
        <ChevronLeft size={18} aria-hidden />
      </IconButton>
      <h1 className="flex-1 font-semibold">{title}</h1>
      {action}
    </div>
  );
}
