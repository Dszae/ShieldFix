import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Globe,
  Info,
  LayoutDashboard,
  Lock,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  Wand2,
} from 'lucide-react';
import { originPatternsFor } from '../../shared/domain';
import type { TabState } from '../../shared/messages';
import type { DetectionReport } from '../../shared/schemas';
import {
  ApiError,
  errorMessage,
  extensionVersion,
  openDashboard,
  removeOrigins,
  requestOrigins,
  send,
} from '../lib/api';
import { relativeTime, type Tone } from '../lib/format';
import { useTheme } from '../lib/hooks';
import { useAnnounce } from '../components/announcerContext';
import { Badge } from '../components/Badge';
import { Button, IconButton } from '../components/Button';
import { Alert, LoadingBlock } from '../components/Feedback';
import { Switch } from '../components/Switch';
import { Wordmark } from '../components/Logo';
import { primaryOf, statusFor } from './status';
import { DiagnosticsView } from './DiagnosticsView';
import { FixView } from './FixView';
import { BraveView } from './BraveView';

type View = 'main' | 'diagnostics' | 'fix' | 'brave';
type Flash = { tone: 'ok' | 'warn' | 'danger' | 'info'; text: string } | null;

const STATUS_ICON: Record<Tone, typeof ShieldCheck> = {
  ok: ShieldCheck,
  warn: AlertTriangle,
  danger: ShieldAlert,
  info: Info,
  neutral: Search,
  accent: ShieldCheck,
};

const STATUS_STYLE: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok-fg',
  warn: 'bg-warn-soft text-warn-fg',
  danger: 'bg-danger-soft text-danger-fg',
  info: 'bg-info-soft text-info-fg',
  neutral: 'bg-surface-2 text-muted',
  accent: 'bg-accent-soft text-accent-soft-fg',
};

async function resolveTabId(): Promise<number> {
  const param = new URLSearchParams(location.search).get('tabId');
  if (param && /^\d+$/.test(param)) return Number(param);
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) throw new Error('No active tab.');
  return tab.id;
}

export function Popup() {
  const announce = useAnnounce();
  const [state, setState] = useState<TabState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<ApiError | Error | null>(null);
  const [view, setView] = useState<View>('main');
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  useTheme(state?.settings.theme);

  const refresh = useCallback(async (tabId: number) => {
    const next = await send({ type: 'tab/state', tabId });
    setState(next);
    return next;
  }, []);

  const scan = useCallback(
    async (tabId: number, trigger: 'popup' | 'manual') => {
      setScanning(true);
      setScanError(null);
      try {
        const report = await send({ type: 'tab/scan', tabId, trigger });
        setState((s) => (s ? { ...s, report } : s));
        await refresh(tabId);
        const status = statusFor(report, false);
        announce(`${status.title}. ${status.description}`);
        return report;
      } catch (err) {
        setScanError(err instanceof Error ? err : new Error(errorMessage(err)));
        announce(`Scan failed: ${errorMessage(err)}`, 'assertive');
        return null;
      } finally {
        setScanning(false);
      }
    },
    [announce, refresh],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const tabId = await resolveTabId();
        const initial = await refresh(tabId);
        if (cancelled) return;
        if (initial.url.supported && initial.settings.scanOnPopupOpen) await scan(tabId, 'popup');
      } catch (err) {
        if (!cancelled) setLoadError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh, scan]);

  if (loadError) {
    return (
      <Shell>
        <div className="p-4">
          <Alert tone="danger" title="ShieldFix could not start" role="alert">
            {loadError}
          </Alert>
        </div>
      </Shell>
    );
  }
  if (!state) {
    return (
      <Shell>
        <LoadingBlock label="Loading" />
      </Shell>
    );
  }

  const report = state.report;
  const host = state.url.hostname;

  const onReportUpdate = (next: DetectionReport) =>
    setState((s) => (s ? { ...s, report: next } : s));

  if (view === 'diagnostics' && report) {
    return (
      <Shell state={state}>
        <DiagnosticsView
          report={report}
          developerMode={state.settings.developerMode}
          scanning={scanning}
          onBack={() => setView('main')}
          onRescan={() => void scan(state.tabId, 'manual')}
        />
      </Shell>
    );
  }
  if (view === 'fix' && report && primaryOf(report)) {
    return (
      <Shell state={state}>
        <FixView
          tabId={state.tabId}
          hostname={host ?? ''}
          candidate={primaryOf(report)!}
          onBack={() => setView('main')}
          onDone={async (outcome) => {
            onReportUpdate(outcome.report);
            await refresh(state.tabId);
            setFlash({
              tone: outcome.applied ? (outcome.verified.overlayHidden ? 'ok' : 'warn') : 'warn',
              text: outcome.message,
            });
            setView('main');
          }}
        />
      </Shell>
    );
  }
  if (view === 'brave') {
    return (
      <Shell state={state}>
        <BraveView
          hostname={host}
          onBack={() => setView('main')}
          hasFix={!!primaryOf(report)?.fixable && !report?.fix.active}
        />
      </Shell>
    );
  }

  if (!state.url.supported) {
    return (
      <Shell state={state}>
        <div className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-muted">
            <Globe size={16} aria-hidden />
            <span>{host ?? 'This page'}</span>
          </div>
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="font-semibold">ShieldFix can’t run on this page</p>
            <p className="mt-1 text-muted">{state.url.reason}</p>
          </div>
        </div>
      </Shell>
    );
  }

  const status = statusFor(report, scanning);
  const StatusIcon = STATUS_ICON[status.tone];
  const primary = primaryOf(report);
  const fixAvailable = !!primary?.fixable && !report?.fix.active;

  const undo = async (forget: boolean) => {
    setBusy(forget ? 'forget' : 'undo');
    try {
      const outcome = await send({ type: 'tab/revertFix', tabId: state.tabId, forget });
      if (outcome.report) onReportUpdate(outcome.report);
      await refresh(state.tabId);
      setFlash({ tone: outcome.reverted ? 'ok' : 'info', text: outcome.message });
      announce(outcome.message);
    } catch (err) {
      setFlash({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  const toggleMonitoring = (enable: boolean) => {
    if (!host) return;
    const patterns = originPatternsFor(host);
    setBusy('monitor');
    // The permission request must start synchronously in the click handler.
    const permission = enable ? requestOrigins(patterns) : Promise.resolve(true);
    void permission
      .then(async (granted) => {
        if (!granted) {
          setFlash({
            tone: 'info',
            text: 'Access was not granted, so automatic detection stays off for this site.',
          });
          return;
        }
        await send({ type: 'site/update', hostname: host, patch: { monitor: enable } });
        if (!enable) await removeOrigins(patterns);
        await send({ type: 'monitoring/sync' });
        const next = await refresh(state.tabId);
        const text = next.monitoringActive
          ? `ShieldFix will check ${host} automatically when pages load.`
          : `Automatic detection is off for ${host}.`;
        setFlash({ tone: 'ok', text });
        announce(text);
      })
      .catch((err) => setFlash({ tone: 'danger', text: errorMessage(err) }))
      .finally(() => setBusy(null));
  };

  const toggleAutoFix = async (enable: boolean) => {
    if (!host) return;
    setBusy('autofix');
    try {
      await send({ type: 'site/update', hostname: host, patch: { autoFix: enable } });
      await refresh(state.tabId);
      announce(
        enable
          ? 'Saved fixes will be applied automatically on this site.'
          : 'Saved fixes will no longer be applied automatically.',
      );
    } catch (err) {
      setFlash({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Shell state={state}>
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Globe size={15} className="flex-none text-subtle" aria-hidden />
            <h1 className="truncate font-semibold" title={host ?? undefined}>
              {host}
            </h1>
          </div>
          <span className="flex-none text-[12px] text-subtle">
            {scanning ? 'Scanning…' : report ? `Scanned ${relativeTime(report.scannedAt)}` : ''}
          </span>
        </div>

        <section
          aria-label="Page status"
          aria-busy={scanning}
          className="animate-enter rounded-xl border border-line bg-surface p-3.5 shadow-card"
        >
          <div className="flex gap-3">
            <span
              className={`grid h-9 w-9 flex-none place-items-center rounded-lg ${STATUS_STYLE[status.tone]}`}
            >
              <StatusIcon size={18} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold leading-tight">{status.title}</p>
                <Badge tone={status.tone} dot>
                  {status.pill}
                </Badge>
              </div>
              <p className="mt-1 text-muted">{status.description}</p>
              {report && report.level !== 'none' && !report.fix.active && (
                <p className="tabular mt-1.5 text-[12px] text-subtle">
                  Confidence {Math.round(report.confidence)}%
                </p>
              )}
            </div>
          </div>
        </section>

        {scanError && (
          <Alert
            tone={
              scanError instanceof ApiError && scanError.code === 'no-access' ? 'info' : 'danger'
            }
            title={
              scanError instanceof ApiError && scanError.code === 'no-access'
                ? 'Page access needed'
                : 'Scan failed'
            }
            role="alert"
          >
            {scanError.message}
          </Alert>
        )}
        {flash && (
          <Alert tone={flash.tone} role="status">
            {flash.text}
          </Alert>
        )}

        <div className="grid gap-2">
          {fixAvailable && (
            <Button
              variant="primary"
              block
              icon={<Wand2 size={15} aria-hidden />}
              onClick={() => setView('fix')}
            >
              Review suggested fix
            </Button>
          )}
          {report?.fix.active && (
            <Button
              block
              icon={<Undo2 size={15} aria-hidden />}
              loading={busy === 'undo'}
              onClick={() => void undo(false)}
            >
              Undo fix
            </Button>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              icon={<Search size={15} aria-hidden />}
              loading={scanning && !report}
              disabled={scanning}
              onClick={async () => {
                const r = report ?? (await scan(state.tabId, 'manual'));
                if (r) setView('diagnostics');
              }}
            >
              Diagnose
            </Button>
            <Button icon={<ShieldCheck size={15} aria-hidden />} onClick={() => setView('brave')}>
              Brave Shields
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded-xl border border-line bg-surface p-3.5">
          <Switch
            checked={state.monitoringActive}
            busy={busy === 'monitor'}
            onChange={toggleMonitoring}
            label="Watch this site"
            description={
              state.settings.monitorAllSites && state.monitoringActive
                ? 'All sites are watched (change in Settings).'
                : 'Detect warnings automatically when pages on this site load.'
            }
            disabled={state.settings.monitorAllSites && state.monitoringActive}
          />
          {(state.site?.autoFix || fixAvailable || report?.fix.active) && (
            <Switch
              checked={!!state.site?.autoFix}
              busy={busy === 'autofix'}
              onChange={(v) => void toggleAutoFix(v)}
              label="Apply fixes automatically here"
              description="Only high-confidence, reversible fixes you have approved for this site."
            />
          )}
          {report?.fix.active && state.site?.autoFix && (
            <button
              type="button"
              className="text-[12px] font-medium text-accent hover:underline"
              onClick={() => void undo(true)}
              disabled={busy !== null}
            >
              Undo and stop fixing this site
            </button>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children, state }: { children: ReactNode; state?: TabState }) {
  const monitoring = state?.monitoringActive;
  return (
    <div className="flex min-h-[220px] flex-col">
      <header className="flex items-center justify-between border-b border-line bg-surface px-4 py-2.5">
        <Wordmark />
        <div className="flex items-center gap-1">
          {state && (
            <Badge tone={monitoring ? 'accent' : 'neutral'}>
              {monitoring ? 'Watching site' : 'On demand'}
            </Badge>
          )}
          <IconButton label="Open settings" onClick={() => openDashboard('settings')}>
            <Settings size={16} aria-hidden />
          </IconButton>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="flex items-center justify-between border-t border-line px-4 py-2 text-[12px] text-subtle">
        <span className="flex items-center gap-1.5">
          <Lock size={12} aria-hidden />
          Private · processed on this device
        </span>
        <span className="flex items-center gap-2">
          <span className="tabular">v{extensionVersion()}</span>
          <button
            type="button"
            onClick={() => openDashboard('overview')}
            className="inline-flex items-center gap-1 font-medium text-accent hover:underline"
          >
            <LayoutDashboard size={12} aria-hidden />
            Dashboard
          </button>
        </span>
      </footer>
    </div>
  );
}
