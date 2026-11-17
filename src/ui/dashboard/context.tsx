import { createContext, useContext } from 'react';
import type { AppInfo } from '../../shared/messages';
import type { Settings } from '../../shared/schemas';

export interface DashboardContextValue {
  settings: Settings;
  info: AppInfo;
  /** Increments whenever stored data changes. */
  version: number;
  refresh: () => void;
  navigate: (section: string) => void;
}

export const DashboardContext = createContext<DashboardContextValue | null>(null);

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error('useDashboard must be used inside <Dashboard>.');
  return ctx;
}
