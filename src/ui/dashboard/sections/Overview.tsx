import { ArrowRight, History as HistoryIcon, Sparkles } from 'lucide-react';
import { send } from '../../lib/api';
import { EVENT_LABEL, LEVEL_LABEL, LEVEL_TONE, relativeTime } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card, CardHeader } from '../../components/Card';
import { Alert, EmptyState, Skeleton } from '../../components/Feedback';
import { PageHeader } from '../../components/PageHeader';
import { useDashboard } from '../context';

const MODE_TEXT = {
  'on-demand': {
    title: 'On demand',
    body: 'ShieldFix checks a page only when you open it from the toolbar.',
  },
  'selected-sites': {
    title: 'Selected sites',
    body: 'Pages on sites you chose are checked automatically as they load.',
  },
  'all-sites': { title: 'All sites', body: 'Every page is checked automatically as it loads.' },
} as const;

export function Overview() {
  const { info, settings, version, navigate } = useDashboard();
  const data = useAsync(async () => {
    const [history, sites, rules] = await Promise.all([
      send({ type: 'history/list' }),
      send({ type: 'sites/list' }),
      send({ type: 'rules/list' }),
    ]);
    return { history, sites, rules };
  }, [version]);
  const d = data.data;
  const mode = MODE_TEXT[info.monitoringMode];

  const stats = d
    ? [
        {
          label: 'Detections',
          value: d.history.filter((h) => h.event === 'detected').length,
          hint: `last ${settings.historyRetentionDays} days`,
        },
        {
          label: 'Fixes applied',
          value: d.history.filter(
            (h) => h.event === 'fix-applied' || h.event === 'fix-auto-applied',
          ).length,
          hint: `last ${settings.historyRetentionDays} days`,
        },
        {
          label: 'Sites with preferences',
          value: d.sites.filter((s) => s.monitor || s.autoFix).length,
          hint: 'saved locally',
        },
        {
          label: 'Active rules',
          value: d.rules.filter((r) => r.enabled && !r.expired).length,
          hint: `${d.rules.length} total`,
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="Overview"
        description="A summary of what ShieldFix has done on this device."
      />

      {!info.onboardingCompleted && (
        <div className="mb-4">
          <Alert
            tone="info"
            title="Finish setting up ShieldFix"
            action={
              <Button
                size="sm"
                variant="primary"
                icon={<Sparkles size={13} aria-hidden />}
                onClick={() => navigate('welcome')}
              >
                Start setup
              </Button>
            }
          >
            Choose when ShieldFix should look for anti-adblock warnings.
          </Alert>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {d
          ? stats.map((s) => (
              <Card key={s.label}>
                <p className="text-[12px] text-muted">{s.label}</p>
                <p className="tabular mt-1 text-[24px] font-semibold tracking-tight">{s.value}</p>
                <p className="text-[12px] text-subtle">{s.hint}</p>
              </Card>
            ))
          : Array.from({ length: 4 }, (_, i) => (
              <Card key={i}>
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-3 h-6 w-10" />
              </Card>
            ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Detection mode" />
          <p className="font-medium">{mode.title}</p>
          <p className="mt-1 text-muted">{mode.body}</p>
          {info.monitoringMode === 'selected-sites' && (
            <p className="mt-2 text-[12px] text-subtle">{info.monitoredHosts.join(', ')}</p>
          )}
          <Button className="mt-4" size="sm" onClick={() => navigate('settings')}>
            Change mode
          </Button>
        </Card>

        <Card className="lg:col-span-3" padded={false}>
          <div className="p-4 pb-0">
            <CardHeader
              title="Recent activity"
              action={
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<ArrowRight size={13} aria-hidden />}
                  onClick={() => navigate('history')}
                >
                  All history
                </Button>
              }
            />
          </div>
          {data.status === 'error' && (
            <div className="px-4 pb-4">
              <Alert tone="danger">{data.error}</Alert>
            </div>
          )}
          {d && d.history.length === 0 && (
            <EmptyState icon={<HistoryIcon size={18} aria-hidden />} title="No activity yet">
              {settings.historyEnabled
                ? 'When ShieldFix detects a warning or applies a fix, it appears here.'
                : 'History is turned off in Privacy settings.'}
            </EmptyState>
          )}
          {d && d.history.length > 0 && (
            <ul className="divide-y divide-line">
              {d.history.slice(0, 6).map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{h.hostname}</p>
                    <p className="text-[12px] text-subtle">{relativeTime(h.at)}</p>
                  </div>
                  <div className="flex flex-none items-center gap-1.5">
                    <Badge tone={h.event === 'detected' ? 'neutral' : 'accent'}>
                      {EVENT_LABEL[h.event]}
                    </Badge>
                    <Badge tone={LEVEL_TONE[h.level]}>{LEVEL_LABEL[h.level]}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
