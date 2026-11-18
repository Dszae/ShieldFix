import { useCallback, useRef, useState, type ReactNode } from 'react';
import { AnnouncerContext, type Announce } from './announcerContext';

export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [polite, setPolite] = useState('');
  const [assertive, setAssertive] = useState('');
  const timer = useRef<number | null>(null);

  const announce = useCallback<Announce>((message, tone = 'polite') => {
    const set = tone === 'assertive' ? setAssertive : setPolite;
    set('');
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => set(message), 60);
  }, []);

  return (
    <AnnouncerContext.Provider value={announce}>
      {children}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {polite}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {assertive}
      </div>
    </AnnouncerContext.Provider>
  );
}
