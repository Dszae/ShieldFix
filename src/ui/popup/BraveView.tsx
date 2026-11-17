import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { errorMessage, send } from '../lib/api';
import { useIsBrave } from '../lib/hooks';
import { Button } from '../components/Button';
import { Alert } from '../components/Feedback';
import { ViewHeader } from './ViewHeader';

/**
 * Guidance for native browser controls. Extensions cannot read or change Brave
 * Shields, so ShieldFix explains the steps instead of pretending to act.
 */
export function BraveView({
  hostname,
  hasFix,
  onBack,
}: {
  hostname: string | null;
  hasFix: boolean;
  onBack: () => void;
}) {
  const isBrave = useIsBrave();
  const [result, setResult] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  const open = async () => {
    try {
      const r = await send({ type: 'brave/open', page: 'shields' });
      setResult({ tone: 'ok', text: `Opened ${r.opened} in a new tab.` });
    } catch (err) {
      setResult({ tone: 'danger', text: errorMessage(err) });
    }
  };

  return (
    <div>
      <ViewHeader
        title={isBrave === false ? 'Privacy protection' : 'Brave Shields'}
        onBack={onBack}
      />
      <div className="space-y-3 p-4">
        <Alert tone="info">
          ShieldFix cannot change {isBrave === false ? 'your ad blocker' : 'Brave Shields'} for you
          — browsers don’t let extensions do that, and ShieldFix never lowers protection on its own.
        </Alert>

        {hasFix && (
          <p className="text-muted">
            <strong className="font-semibold text-fg">Least invasive first:</strong> try ShieldFix’s
            reversible fix before lowering protection. It keeps ads and trackers blocked.
          </p>
        )}

        {isBrave !== false ? (
          <ol className="list-decimal space-y-2 rounded-xl border border-line bg-surface py-3 pr-3 pl-8">
            <li>Click the Brave Shields icon (the lion) on the right of the address bar.</li>
            <li>
              To change protection for{' '}
              <strong className="font-semibold">{hostname ?? 'this site'}</strong> only, lower
              “Trackers &amp; ads blocking” in the advanced controls, or turn Shields off for this
              site.
            </li>
            <li>
              Reload the page. You can turn protection back up from the same panel at any time.
            </li>
          </ol>
        ) : (
          <ol className="list-decimal space-y-2 rounded-xl border border-line bg-surface py-3 pr-3 pl-8">
            <li>Open the menu of the ad-blocking or privacy extension you use.</li>
            <li>
              Allow (“allowlist”){' '}
              <strong className="font-semibold">{hostname ?? 'this site'}</strong> only — avoid
              turning protection off everywhere.
            </li>
            <li>Reload the page.</li>
          </ol>
        )}
        <p className="text-[12px] text-subtle">Exact labels differ between browser versions.</p>

        {isBrave !== false && (
          <>
            <Button block icon={<ExternalLink size={14} aria-hidden />} onClick={() => void open()}>
              Open global Shields settings
            </Button>
            <p className="text-[12px] text-muted">
              Global settings change the defaults for every site. For a single site, use the Shields
              icon instead.
            </p>
          </>
        )}
        {result && (
          <Alert tone={result.tone} role="status">
            {result.text}
          </Alert>
        )}
      </div>
    </div>
  );
}
