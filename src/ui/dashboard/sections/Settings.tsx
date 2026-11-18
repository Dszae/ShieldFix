import { Monitor, Moon, Sun } from 'lucide-react';
import { ALL_SITES_ORIGINS } from '../../../shared/constants';
import type { Theme } from '../../../shared/schemas';
import { errorMessage, removeOrigins, requestOrigins, send } from '../../lib/api';
import { useAnnounce } from '../../components/announcerContext';
import { Card, CardHeader } from '../../components/Card';
import { Alert } from '../../components/Feedback';
import { PageHeader } from '../../components/PageHeader';
import { Switch } from '../../components/Switch';
import { useDashboard } from '../context';
import { useSettingsUpdater } from '../useSettingsUpdater';

const THEMES: { id: Theme; label: string; icon: typeof Sun }[] = [
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
];

export function SettingsSection() {
  const { settings, info, refresh } = useDashboard();
  const announce = useAnnounce();
  const { update, error, setError, busy, setBusy } = useSettingsUpdater();

  const setAllSites = (enable: boolean) => {
    setBusy('monitorAllSites');
    setError(null);
    const permission = enable ? requestOrigins([...ALL_SITES_ORIGINS]) : Promise.resolve(true);
    void permission
      .then(async (granted) => {
        if (!granted) {
          setError(
            'Access to all sites was not granted, so automatic detection everywhere stays off.',
          );
          return;
        }
        await send({ type: 'settings/update', patch: { monitorAllSites: enable } });
        if (!enable) await removeOrigins([...ALL_SITES_ORIGINS]);
        await send({ type: 'monitoring/sync' });
        announce(
          enable
            ? 'ShieldFix now checks every site automatically.'
            : 'Automatic detection on all sites is off.',
        );
        refresh();
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(null));
  };

  return (
    <>
      <PageHeader title="Settings" description="Changes are saved immediately." />
      {error && (
        <div className="mb-4">
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        </div>
      )}
      <div className="space-y-4">
        <Card>
          <CardHeader title="Appearance" />
          <fieldset>
            <legend className="mb-2 font-medium">Theme</legend>
            <div
              role="radiogroup"
              aria-label="Theme"
              className="inline-flex rounded-lg border border-line-strong bg-surface-2 p-0.5"
            >
              {THEMES.map((t) => {
                const active = settings.theme === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => void update({ theme: t.id }, `${t.label} theme selected.`)}
                    className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors ${
                      active ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg'
                    }`}
                  >
                    <t.icon size={14} aria-hidden />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </Card>

        <Card>
          <CardHeader
            title="Detection"
            description="ShieldFix never changes a page without your approval, except for fixes you chose to save for a site."
          />
          <div className="space-y-4">
            <Switch
              checked={settings.scanOnPopupOpen}
              busy={busy === 'scanOnPopupOpen'}
              onChange={(v) => void update({ scanOnPopupOpen: v })}
              label="Check the page when I open ShieldFix"
              description="Scans the current tab each time you click the toolbar button."
            />
            <Switch
              checked={settings.showInPageNotice}
              busy={busy === 'showInPageNotice'}
              onChange={(v) => void update({ showInPageNotice: v })}
              label="Show a notice on watched sites"
              description="A small, dismissible message appears on the page when a warning is detected."
            />
            <Switch
              checked={settings.autoApplyRemembered}
              busy={busy === 'autoApplyRemembered'}
              onChange={(v) => void update({ autoApplyRemembered: v })}
              label="Apply saved fixes automatically"
              description="Master switch for fixes you saved with “Always apply on this site”. Turn off to always ask."
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Automatic detection"
            description="By default ShieldFix only looks at a page when you click its toolbar button, and needs no access to your sites."
          />
          <Switch
            checked={settings.monitorAllSites && info.allSitesPermission}
            busy={busy === 'monitorAllSites'}
            onChange={setAllSites}
            label="Watch all sites"
            description="Checks every page as it loads, so warnings are caught without opening ShieldFix. Requires permission to read and change all sites. Detection always runs locally."
          />
          <p className="mt-3 text-[12px] text-subtle">
            To watch only specific sites, use “Watch this site” in the toolbar popup or the Sites
            page.
          </p>
        </Card>

        <Card>
          <CardHeader title="Advanced" />
          <Switch
            checked={settings.developerMode}
            busy={busy === 'developerMode'}
            onChange={(v) => void update({ developerMode: v })}
            label="Developer diagnostics"
            description="Shows signal weights and technical detail in the diagnosis view."
          />
        </Card>
      </div>
    </>
  );
}
