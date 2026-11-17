import { useIsBrave } from '../../lib/hooks';
import { Card, CardHeader } from '../../components/Card';
import { LogoMark } from '../../components/Logo';
import { PageHeader } from '../../components/PageHeader';
import { useDashboard } from '../context';

const PRINCIPLES = [
  ['Privacy first', 'Everything runs on your device. Nothing is collected.'],
  [
    'Compatibility second',
    'Least invasive option first: a reversible cosmetic fix before lowering protection.',
  ],
  [
    'You stay in control',
    'No page is changed without your approval, and every change can be undone.',
  ],
] as const;

export function About() {
  const { info } = useDashboard();
  const isBrave = useIsBrave();
  return (
    <>
      <PageHeader title="About ShieldFix" />
      <div className="space-y-4">
        <Card>
          <div className="flex items-center gap-4">
            <LogoMark size={48} />
            <div>
              <p className="text-[16px] font-semibold">ShieldFix</p>
              <p className="tabular text-muted">Version {info.version}</p>
            </div>
          </div>
          <p className="mt-4 max-w-2xl text-muted">
            Make the web more compatible with privacy-focused browsing. ShieldFix identifies pages
            that react to ad and tracker blocking, explains what is happening and offers the least
            invasive, reversible fix.
          </p>
        </Card>
        <Card>
          <CardHeader title="Principles" />
          <dl className="grid gap-4 sm:grid-cols-3">
            {PRINCIPLES.map(([t, d]) => (
              <div key={t}>
                <dt className="font-medium">{t}</dt>
                <dd className="mt-1 text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </Card>
        <Card>
          <CardHeader title="Environment" />
          <dl className="grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-muted">Browser</dt>
              <dd className="font-medium">
                {isBrave === null ? 'Checking…' : isBrave ? 'Brave' : 'Chromium-based browser'}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Detection mode</dt>
              <dd className="font-medium">
                {info.monitoringMode === 'on-demand'
                  ? 'On demand'
                  : info.monitoringMode === 'all-sites'
                    ? 'All sites'
                    : 'Selected sites'}
              </dd>
            </div>
            <div>
              <dt className="text-muted">License</dt>
              <dd className="font-medium">MIT</dd>
            </div>
            <div>
              <dt className="text-muted">Network access</dt>
              <dd className="font-medium">None</dd>
            </div>
          </dl>
        </Card>
      </div>
    </>
  );
}
