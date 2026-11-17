import { useState } from 'react';
import { Check, Trash2 } from 'lucide-react';
import { ALL_SITES_ORIGINS } from '../../../shared/constants';
import { errorMessage, removeOrigins, send } from '../../lib/api';
import { useAnnounce } from '../../components/announcerContext';
import { Button } from '../../components/Button';
import { Card, CardHeader } from '../../components/Card';
import { ConfirmDialog } from '../../components/Dialog';
import { Alert } from '../../components/Feedback';
import { SelectField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { Switch } from '../../components/Switch';
import { useDashboard } from '../context';
import { useSettingsUpdater } from '../useSettingsUpdater';

const PROMISES = [
  'Detection and fixes run entirely on your device.',
  'ShieldFix makes no network requests: no analytics, no telemetry, no remote code.',
  'Page content, page addresses and form data are never stored or sent anywhere.',
  'No account is needed and nothing is synchronised between devices.',
];

export function Privacy() {
  const { settings, info, refresh } = useDashboard();
  const announce = useAnnounce();
  const { update, error, setError, busy } = useSettingsUpdater();
  const [confirm, setConfirm] = useState<'reset' | 'revoke' | null>(null);
  // Required host permissions (none in release builds) cannot be revoked at runtime.
  const required = new Set(chrome.runtime.getManifest().host_permissions ?? []);
  const siteOrigins = info.grantedOrigins.filter((o) => o.includes('://') && !required.has(o));

  return (
    <>
      <PageHeader
        title="Privacy"
        description="ShieldFix is designed to work without collecting anything about you."
      />
      {error && (
        <div className="mb-4">
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        </div>
      )}
      <div className="space-y-4">
        <Card>
          <CardHeader title="How your data is handled" />
          <ul className="space-y-2">
            {PROMISES.map((p) => (
              <li key={p} className="flex gap-2">
                <Check size={16} className="mt-0.5 flex-none text-ok" aria-hidden />
                <span>{p}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[12px] text-muted">
            Stored locally: your settings, site preferences (site name and switches), compatibility
            rules and, if enabled, a diagnostic history of site names, events and confidence scores.
          </p>
        </Card>

        <Card>
          <CardHeader title="Diagnostic history" />
          <div className="space-y-4">
            <Switch
              checked={settings.historyEnabled}
              busy={busy === 'historyEnabled'}
              onChange={(v) =>
                void update(
                  { historyEnabled: v },
                  v ? 'History turned on.' : 'History turned off and cleared.',
                )
              }
              label="Keep a local history"
              description="Turning this off also deletes the existing history."
            />
            <div className="max-w-xs">
              <SelectField
                label="Keep entries for"
                value={String(settings.historyRetentionDays)}
                disabled={!settings.historyEnabled}
                onChange={(e) =>
                  void update(
                    { historyRetentionDays: Number(e.target.value) },
                    'Retention updated.',
                  )
                }
              >
                <option value="7">7 days</option>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="365">1 year</option>
              </SelectField>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Site access"
            description="Access is only needed for automatic detection. Without it, ShieldFix works on a page only when you click its toolbar button."
          />
          {siteOrigins.length === 0 ? (
            <p className="text-muted">ShieldFix has no permanent access to any site.</p>
          ) : (
            <>
              <ul className="mb-3 flex flex-wrap gap-1.5">
                {siteOrigins.slice(0, 30).map((o) => (
                  <li key={o} className="rounded-md bg-surface-2 px-2 py-0.5 font-mono text-[11px]">
                    {o}
                  </li>
                ))}
              </ul>
              <Button variant="danger" onClick={() => setConfirm('revoke')}>
                Revoke all site access
              </Button>
            </>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Delete all data"
            description="Removes settings, site preferences, rules and history from this device."
          />
          <Button
            variant="danger"
            icon={<Trash2 size={14} aria-hidden />}
            onClick={() => setConfirm('reset')}
          >
            Delete all ShieldFix data
          </Button>
        </Card>
      </div>

      <ConfirmDialog
        open={confirm === 'revoke'}
        title="Revoke all site access?"
        description="Automatic detection stops everywhere. ShieldFix keeps working when you click its toolbar button."
        confirmLabel="Revoke access"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          try {
            await removeOrigins(siteOrigins.length ? siteOrigins : [...ALL_SITES_ORIGINS]);
            await send({ type: 'monitoring/sync' });
            announce('Site access revoked.');
            refresh();
          } catch (err) {
            setError(errorMessage(err));
          }
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        title="Delete all ShieldFix data?"
        description="This cannot be undone. Fixes currently applied in open tabs stay until those pages are reloaded."
        confirmLabel="Delete everything"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          try {
            await send({ type: 'data/reset' });
            announce('All data deleted.');
            refresh();
          } catch (err) {
            setError(errorMessage(err));
          }
          setConfirm(null);
        }}
      />
    </>
  );
}
