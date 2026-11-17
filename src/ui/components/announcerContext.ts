import { createContext, useContext } from 'react';

export type Announce = (message: string, tone?: 'polite' | 'assertive') => void;

export const AnnouncerContext = createContext<Announce>(() => undefined);

/** Announce a status message to screen readers. */
export function useAnnounce(): Announce {
  return useContext(AnnouncerContext);
}
