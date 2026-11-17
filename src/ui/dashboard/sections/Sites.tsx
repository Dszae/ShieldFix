import { useState } from 'react';
import { Globe, RotateCcw, Trash2 } from 'lucide-react';
import { originPatternsFor } from '../../../shared/domain';
import type { SiteRecord } from '../../../shared/schemas';
import { errorMessage, removeOrigins, requestOrigins, send } from '../../lib/api';
import { LEVEL_LABEL, LEVEL_TONE, plural, relativeTime } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import { useAnnounce } from '../../components/announcerContext';
import { Badge } from '../../components/Badge';
import { Button, IconButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/Dialog';
import { Alert, EmptyState, LoadingBlock } from '../../components/Feedback';
import { TextField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { Switch } from '../../components/Switch';
import { useDashboard } from '../context';

export function Sites() {
  const { version, info, refresh } = useDashboard();
  const announce = useAnnounce();
  const sites = useAsync(() => send({ type: 'sites/list' }), [version]);
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState<
    { kind: 'remove'; site: SiteRecord } | { kind: 'reset' } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const list = (sites.data ?? []).filter((s) => s.hostname.includes(query.trim().toLowerCase()));

  const setMonitor = (site: SiteRecord, enable: boolean) => {
    const patterns = originPatternsFor(site.hostname);
    setBusy(`${site.hostname}:monitor`);
    setError(null);
    const permission = enable ? requestOrigins(patterns) : Promise.resolve(true); // must start in the click
    void permission
      .then(async (granted) => {
        if (!granted) {
          setError(`Access to ${site.hostname} was not granted, so it is not watched.`);
          return;
        }
        await send({ type: 'site/update', hostname: site.hostname, patch: { monitor: enable } });
        if (!enable) await removeOrigins(patterns);
        await send({ type: 'monitoring/sync' });
        announce(enable ? `Watching ${site.hostname}.` : `Stopped watching ${site.hostname}.`);
        refresh();
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(null));
  };

  const setAutoFix = async (site: SiteRecord, enable: boolean) => {
    setBusy(`${site.hostname}:autofix`);
    try {
      await send({ type: 'site/update', hostname: site.hostname, patch: { autoFix: enable } });
      announce(
        enable
          ? `Saved fixes enabled for ${site.hostname}.`
          : `Saved fixes disabled for ${site.hostname}.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Sites"
        description="Sites where ShieldFix detected something or where you saved a preference. Stored only on this device."
        action={
          <Button
            variant="danger"
            icon={<RotateCcw size={14} aria-hidden />}
            disabled={!sites.data?.length}
            onClick={() => setConfirm({ kind: 'reset' })}
          >
            Reset all sites
          </Button>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        </div>
      )}
      {info.monitoringMode === 'all-sites' && (
        <div className="mb-4">
          <Alert tone="info">
            All sites are watched automatically. Per-site watching applies when that mode is off.
          </Alert>
        </div>
      )}

      <Card padded={false}>
        <div className="border-b border-line p-4">
          <TextField
            label="Filter sites"
            type="search"
            placeholder="example.com"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {sites.status === 'loading' && !sites.data && <LoadingBlock />}
        {sites.status === 'error' && (
          <div className="p-4">
            <Alert tone="danger">{sites.error}</Alert>
          </div>
        )}
        {sites.data && list.length === 0 && (
          <EmptyState
            icon={<Globe size={18} aria-hidden />}
            title={query ? 'No matching sites' : 'No sites yet'}
          >
            {query
              ? 'Try a different filter.'
              : 'Sites appear here after ShieldFix detects a warning or you save a preference for them.'}
          </EmptyState>
        )}
        <ul className="divide-y divide-line">
          {list.map((site) => (
            <li key={site.hostname} className="grid gap-4 p-4 md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold">{site.hostname}</p>
                  {site.lastLevel && (
                    <Badge tone={LEVEL_TONE[site.lastLevel]}>{LEVEL_LABEL[site.lastLevel]}</Badge>
                  )}
                </div>
                <p className="mt-1 text-[12px] text-subtle">
                  {site.lastScannedAt
                    ? `Last checked ${relativeTime(site.lastScannedAt)}`
                    : 'Not checked yet'}{' '}
                  · {plural(site.detections, 'detection')} ·{' '}
                  {plural(site.fixesApplied, 'fix', 'fixes')}
                </p>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-56 space-y-3">
                  <Switch
                    checked={
                      site.monitor &&
                      (info.monitoredHosts.includes(site.hostname) ||
                        info.monitoringMode === 'all-sites')
                    }
                    busy={busy === `${site.hostname}:monitor`}
                    onChange={(v) => setMonitor(site, v)}
                    label="Watch automatically"
                  />
                  <Switch
                    checked={site.autoFix}
                    busy={busy === `${site.hostname}:autofix`}
                    onChange={(v) => void setAutoFix(site, v)}
                    label="Apply saved fixes"
                  />
                </div>
                <IconButton
                  label={`Remove ${site.hostname}`}
                  onClick={() => setConfirm({ kind: 'remove', site })}
                >
                  <Trash2 size={16} aria-hidden />
                </IconButton>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      <ConfirmDialog
        open={confirm?.kind === 'remove'}
        title={confirm?.kind === 'remove' ? `Remove ${confirm.site.hostname}?` : ''}
        description="Its saved preferences and summary are deleted. Compatibility rules for the site are kept and can be managed under Rules."
        confirmLabel="Remove site"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (confirm?.kind !== 'remove') return;
          try {
            if (confirm.site.monitor) await removeOrigins(originPatternsFor(confirm.site.hostname));
            await send({ type: 'site/remove', hostname: confirm.site.hostname });
            announce(`Removed ${confirm.site.hostname}.`);
          } catch (err) {
            setError(errorMessage(err));
          }
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === 'reset'}
        title="Reset all site settings?"
        description="All site preferences and summaries are deleted and automatic watching stops for every site. Rules and history are kept."
        confirmLabel="Reset all sites"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          try {
            const hosts = (sites.data ?? [])
              .filter((s) => s.monitor)
              .flatMap((s) => originPatternsFor(s.hostname));
            if (hosts.length) await removeOrigins(hosts);
            await send({ type: 'sites/reset' });
            announce('All site settings were reset.');
          } catch (err) {
            setError(errorMessage(err));
          }
          setConfirm(null);
        }}
      />
    </>
  );
}
