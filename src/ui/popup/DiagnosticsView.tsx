import { RefreshCw } from 'lucide-react';
import type { CandidateSummary, DetectionReport, ResourceCategory } from '../../shared/schemas';
import { CLASSIFICATION_LABEL, LEVEL_LABEL, LEVEL_TONE, plural } from '../lib/format';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { ConfidenceMeter } from '../components/Meter';
import { primaryOf } from './status';
import { ViewHeader } from './ViewHeader';

const CATEGORY: Record<ResourceCategory, { label: string; tone: 'neutral' | 'warn' | 'info' }> = {
  'ad-tracking': { label: 'Ad / tracking', tone: 'neutral' },
  'first-party': { label: 'This site', tone: 'warn' },
  'third-party': { label: 'Third party', tone: 'info' },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-3.5">
      <h2 className="mb-2 text-[12px] font-semibold tracking-wide text-subtle">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function CandidateDetail({ c, developerMode }: { c: CandidateSummary; developerMode: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{CLASSIFICATION_LABEL[c.classification]}</span>
        <Badge tone={LEVEL_TONE[c.level]}>{LEVEL_LABEL[c.level]}</Badge>
      </div>
      <ConfidenceMeter
        value={c.confidence}
        tone={LEVEL_TONE[c.level]}
        label="Detection confidence"
      />
      <p className="truncate font-mono text-[11px] text-subtle" title={c.descriptor}>
        {c.descriptor}
      </p>
      <ul className="space-y-1" aria-label="Matched signals">
        {c.signals.map((s) => (
          <li key={s.id} className="flex items-start justify-between gap-2 text-[12px]">
            <span className={s.weight < 0 ? 'text-muted line-through decoration-subtle/50' : ''}>
              {s.label}
            </span>
            {developerMode && (
              <span
                className={`tabular flex-none font-mono ${s.weight < 0 ? 'text-danger-fg' : 'text-ok-fg'}`}
              >
                {s.weight > 0 ? `+${s.weight}` : s.weight}
              </span>
            )}
          </li>
        ))}
      </ul>
      {c.vetoes.length > 0 && (
        <p className="text-[12px] text-warn-fg">
          Protected: {c.vetoes.map((v) => v.label.toLowerCase()).join(', ')}.
        </p>
      )}
      <p className="text-[12px] text-muted">
        {c.fixable ? 'A reversible fix is available.' : (c.fixBlockedReason ?? 'No fix available.')}
      </p>
    </div>
  );
}

export function DiagnosticsView({
  report,
  developerMode,
  scanning,
  onBack,
  onRescan,
}: {
  report: DetectionReport;
  developerMode: boolean;
  scanning: boolean;
  onBack: () => void;
  onRescan: () => void;
}) {
  const primary = primaryOf(report);
  const others = report.candidates.filter((c) => c.id !== primary?.id);
  const res = report.page.blockedResources;

  return (
    <div>
      <ViewHeader
        title="Diagnosis"
        onBack={onBack}
        action={
          <Button
            size="sm"
            variant="ghost"
            loading={scanning}
            icon={<RefreshCw size={13} aria-hidden />}
            onClick={onRescan}
          >
            Scan again
          </Button>
        }
      />
      <div className="max-h-[480px] space-y-3 overflow-y-auto p-4" aria-busy={scanning}>
        <Section title="Summary">
          <dl>
            <Row
              label="Result"
              value={<Badge tone={LEVEL_TONE[report.level]}>{LEVEL_LABEL[report.level]}</Badge>}
            />
            <Row label="Anti-adblock warning" value={primary ? 'Detected' : 'Not detected'} />
            <Row
              label="Fix available"
              value={report.fix.active ? 'Applied' : primary?.fixable ? 'Yes' : 'No'}
            />
            <Row label="Ordinary dialogs left alone" value={report.ordinaryDialogs} />
            <Row label="Scan time" value={<span className="tabular">{report.scanMs} ms</span>} />
          </dl>
        </Section>

        {primary && (
          <Section title={report.fix.active ? 'Hidden warning' : 'Detected warning'}>
            <CandidateDetail c={primary} developerMode={developerMode} />
          </Section>
        )}

        {report.pageIssues.length > 0 && (
          <Section title="Page signals">
            <ul className="list-disc space-y-1 pl-4 text-[12px]">
              {report.pageIssues.map((i) => (
                <li key={i.id}>{i.label}</li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Page state">
          <dl>
            <Row label="Scrolling disabled" value={report.page.scrollLocked ? 'Yes' : 'No'} />
            <Row label="Blurred page areas" value={report.page.blurredElements} />
            <Row label="Video errors" value={report.page.videoErrors} />
          </dl>
        </Section>

        <Section title="Blocked or failed resources">
          <p className="mb-2 text-[12px] text-muted">
            {res.method === 'error-events'
              ? 'Recorded from load errors on this page.'
              : `Estimated after the page loaded${res.reliable ? '' : ' (the page loaded too many resources for a reliable estimate)'}.`}{' '}
            Ad and tracking resources are expected to be blocked. Resources from the site itself may
            be essential.
          </p>
          {res.total === 0 ? (
            <p className="text-[12px]">None found.</p>
          ) : (
            <>
              <dl className="mb-2">
                <Row label="This site" value={res.firstParty} />
                <Row label="Other third parties" value={res.otherThirdParty} />
                <Row label="Ad / tracking" value={res.adTracking} />
              </dl>
              <ul className="space-y-1" aria-label="Hosts">
                {res.hosts.slice(0, 8).map((h) => (
                  <li key={h.host} className="flex items-center justify-between gap-2 text-[12px]">
                    <span className="truncate font-mono text-[11px]" title={h.host}>
                      {h.host}
                    </span>
                    <span className="flex flex-none items-center gap-1.5">
                      <span className="tabular text-subtle">{h.count}</span>
                      <Badge tone={CATEGORY[h.category].tone}>{CATEGORY[h.category].label}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Section>

        {others.length > 0 && (
          <Section title={`Other elements (${others.length})`}>
            <ul className="space-y-1.5">
              {others.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-2 text-[12px]">
                  <span>{CLASSIFICATION_LABEL[c.classification]}</span>
                  <span className="text-subtle">{c.fixable ? 'Fixable' : 'Left unchanged'}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <p className="text-center text-[11px] text-subtle">
          {plural(report.candidates.length, 'element')} analysed · diagnostics stay on this device
        </p>
      </div>
    </div>
  );
}
