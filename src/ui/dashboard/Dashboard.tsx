import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  History,
  Info,
  LayoutGrid,
  ListChecks,
  Lock,
  Globe,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import type { AppInfo } from '../../shared/messages';
import type { Settings } from '../../shared/schemas';
import { send } from '../lib/api';
import { useAsync, useStorageVersion, useTheme } from '../lib/hooks';
import { Alert, LoadingBlock } from '../components/Feedback';
import { Wordmark } from '../components/Logo';
import { DashboardContext } from './context';
import { Overview } from './sections/Overview';
import { Sites } from './sections/Sites';
import { HistorySection } from './sections/History';
import { Rules } from './sections/Rules';
import { SettingsSection } from './sections/Settings';
import { Privacy } from './sections/Privacy';
import { Help } from './sections/Help';
import { About } from './sections/About';
import { Welcome } from './sections/Welcome';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'sites', label: 'Sites', icon: Globe },
  { id: 'history', label: 'History', icon: History },
  { id: 'rules', label: 'Compatibility rules', icon: ListChecks },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
  { id: 'privacy', label: 'Privacy', icon: Lock },
  { id: 'help', label: 'Help', icon: BookOpen },
  { id: 'about', label: 'About', icon: Info },
];

const SECTIONS = new Set([...NAV.map((n) => n.id), 'welcome']);

function currentSection(): string {
  const id = location.hash.replace(/^#\/?/, '').split('?')[0] ?? '';
  return SECTIONS.has(id) ? id : 'overview';
}

export function Dashboard() {
  const [section, setSection] = useState(currentSection);
  const version = useStorageVersion();
  const data = useAsync(async () => {
    const [settings, info] = await Promise.all([
      send({ type: 'settings/get' }),
      send({ type: 'app/info' }),
    ]);
    return { settings, info } as { settings: Settings; info: AppInfo };
  }, [version]);
  useTheme(data.data?.settings.theme);

  useEffect(() => {
    const onHash = () => setSection(currentSection());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const label = section === 'welcome' ? 'Welcome' : NAV.find((n) => n.id === section)?.label;
    document.title = `${label} · ShieldFix`;
  }, [section]);

  const navigate = useCallback((id: string) => {
    location.hash = `#/${id}`;
    document.getElementById('main')?.focus(); // move focus to the new section for keyboard users
  }, []);

  const { data: loaded, reload } = data;
  const ctx = useMemo(
    () => (loaded ? { ...loaded, version, refresh: reload, navigate } : null),
    [loaded, version, reload, navigate],
  );

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only-focusable fixed top-2 left-2 z-50 rounded-md bg-surface px-3 py-2 shadow-pop"
      >
        Skip to content
      </a>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 md:flex-row md:px-8 md:py-10">
        <aside className="md:w-56 md:flex-none">
          <div className="mb-5 px-2">
            <Wordmark />
          </div>
          <nav aria-label="Dashboard sections">
            <ul className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
              {NAV.map((item) => {
                const active = item.id === section;
                return (
                  <li key={item.id}>
                    <a
                      href={`#/${item.id}`}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 whitespace-nowrap transition-colors ${
                        active
                          ? 'bg-surface font-medium text-fg shadow-card'
                          : 'text-muted hover:bg-surface-2 hover:text-fg'
                      }`}
                    >
                      <item.icon size={16} aria-hidden className={active ? 'text-accent' : ''} />
                      {item.label}
                    </a>
                  </li>
                );
              })}
            </ul>
          </nav>
        </aside>

        <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          {data.status === 'error' && !data.data && (
            <Alert tone="danger" title="Could not load ShieldFix data" role="alert">
              {data.error}
            </Alert>
          )}
          {!ctx && data.status === 'loading' && <LoadingBlock />}
          {ctx && (
            <DashboardContext.Provider value={ctx}>
              <div key={section} className="animate-enter">
                {section === 'welcome' && <Welcome />}
                {section === 'overview' && <Overview />}
                {section === 'sites' && <Sites />}
                {section === 'history' && <HistorySection />}
                {section === 'rules' && <Rules />}
                {section === 'settings' && <SettingsSection />}
                {section === 'privacy' && <Privacy />}
                {section === 'help' && <Help />}
                {section === 'about' && <About />}
              </div>
            </DashboardContext.Provider>
          )}
        </main>
      </div>
    </div>
  );
}
