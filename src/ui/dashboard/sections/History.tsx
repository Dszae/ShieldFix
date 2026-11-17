import { useState } from 'react';
import { History as HistoryIcon, Trash2 } from 'lucide-react';
import type { HistoryEntry } from '../../../shared/schemas';
import { errorMessage, send } from '../../lib/api';
import { EVENT_LABEL, LEVEL_LABEL, LEVEL_TONE } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import { useAnnounce } from '../../components/announcerContext';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/Dialog';
import { Alert, EmptyState, LoadingBlock } from '../../components/Feedback';
import { TextField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { useDashboard } from '../context';

function groupByDay(entries: HistoryEntry[]): [string, HistoryEntry[]][] {
  const groups = new Map<string, HistoryEntry[]>();
  for (const e of entries) {
    const key = new Date(e.at).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  return Array.from(groups.entries());
}

export function HistorySection() {
  const { version, settings, navigate } = useDashboard();
  const announce = useAnnounce();
  const history = useAsync(() => send({ type: 'history/list' }), [version]);
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const list = (history.data ?? []).filter((h) => h.hostname.includes(query.trim().toLowerCase()));

  return (
    <>
      <PageHeader
        title="History"
        description={`Local diagnostic history: the site name, what happened and the confidence. Page addresses and content are never recorded. Entries older than ${settings.historyRetentionDays} days are discarded.`}
        action={
          <Button
            variant="danger"
            icon={<Trash2 size={14} aria-hidden />}
            disabled={!history.data?.length}
            onClick={() => setConfirm(true)}
          >
            Clear history
          </Button>
        }
      />
      {!settings.historyEnabled && (
        <div className="mb-4">
          <Alert
            tone="info"
            title="History is turned off"
            action={
              <Button size="sm" onClick={() => navigate('privacy')}>
                Privacy settings
              </Button>
            }
          >
            ShieldFix is not recording new activity.
          </Alert>
        </div>
      )}
      {error && (
        <div className="mb-4">
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        </div>
      )}
      <Card padded={false}>
        <div className="border-b border-line p-4">
          <TextField
            label="Filter by site"
            type="search"
            placeholder="example.com"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {history.status === 'loading' && !history.data && <LoadingBlock />}
        {history.status === 'error' && (
          <div className="p-4">
            <Alert tone="danger">{history.error}</Alert>
          </div>
        )}
        {history.data && list.length === 0 && (
          <EmptyState
            icon={<HistoryIcon size={18} aria-hidden />}
            title={query ? 'No matching entries' : 'No history yet'}
          >
            {query ? 'Try a different filter.' : 'Detections and fixes will be listed here.'}
          </EmptyState>
        )}
        {groupByDay(list).map(([day, entries]) => (
          <section key={day} aria-label={day}>
            <h2 className="bg-surface-2 px-4 py-1.5 text-[12px] font-semibold text-subtle">
              {day}
            </h2>
            <ul className="divide-y divide-line">
              {entries.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <time
                      className="tabular w-12 flex-none text-[12px] text-subtle"
                      dateTime={new Date(h.at).toISOString()}
                    >
                      {new Date(h.at).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </time>
                    <span className="truncate font-medium">{h.hostname}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={h.event === 'detected' ? 'neutral' : 'accent'}>
                      {EVENT_LABEL[h.event]}
                    </Badge>
                    <Badge tone={LEVEL_TONE[h.level]}>
                      {LEVEL_LABEL[h.level]} · {Math.round(h.confidence)}%
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Card>
      <ConfirmDialog
        open={confirm}
        title="Clear all history?"
        description="Every history entry is deleted from this device. Site preferences and rules are not affected."
        confirmLabel="Clear history"
        destructive
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          try {
            await send({ type: 'history/clear' });
            announce('History cleared.');
          } catch (err) {
            setError(errorMessage(err));
          }
          setConfirm(false);
        }}
      />
    </>
  );
}
