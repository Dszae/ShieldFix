import { useEffect, useId, useState } from 'react';
import { EyeOff, Unlock, Droplet, MousePointerClick, X } from 'lucide-react';
import type { FixOutcome, FixPreview } from '../../shared/messages';
import type { CandidateSummary, FixActionKind } from '../../shared/schemas';
import { errorMessage, send } from '../lib/api';
import { CLASSIFICATION_LABEL } from '../lib/format';
import { useAnnounce } from '../components/announcerContext';
import { Button } from '../components/Button';
import { Alert, LoadingBlock } from '../components/Feedback';
import { ViewHeader } from './ViewHeader';

const ACTION_ICON: Record<FixActionKind, typeof EyeOff> = {
  hide: EyeOff,
  'close-dialog': X,
  'unlock-scroll': Unlock,
  'unfix-body': Unlock,
  'remove-filter': Droplet,
  'restore-pointer': MousePointerClick,
  'remove-inert': MousePointerClick,
};

export function FixView({
  tabId,
  hostname,
  candidate,
  onBack,
  onDone,
}: {
  tabId: number;
  hostname: string;
  candidate: CandidateSummary;
  onBack: () => void;
  onDone: (outcome: FixOutcome) => void | Promise<void>;
}) {
  const announce = useAnnounce();
  const rememberId = useId();
  const [preview, setPreview] = useState<FixPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    send({ type: 'tab/previewFix', tabId, candidateId: candidate.id })
      .then((p) => !cancelled && setPreview(p))
      .catch((err) => !cancelled && setError(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [tabId, candidate.id]);

  const apply = async () => {
    setApplying(true);
    setError(null);
    try {
      const outcome = await send({
        type: 'tab/applyFix',
        tabId,
        candidateId: candidate.id,
        remember,
      });
      announce(outcome.message);
      await onDone(outcome);
    } catch (err) {
      setError(errorMessage(err));
      announce(`Fix failed: ${errorMessage(err)}`, 'assertive');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div>
      <ViewHeader title="Review suggested fix" onBack={onBack} />
      <div className="space-y-3 p-4">
        <p className="text-muted">
          ShieldFix found an{' '}
          <strong className="font-semibold text-fg">
            {CLASSIFICATION_LABEL[candidate.classification].toLowerCase()}
          </strong>{' '}
          ({candidate.confidence}% confidence). It proposes these changes:
        </p>

        {!preview && !error && <LoadingBlock label="Preparing fix" />}
        {error && (
          <Alert tone="danger" title="No fix applied" role="alert">
            {error}
          </Alert>
        )}

        {preview && (
          <>
            <ul
              className="divide-y divide-line rounded-xl border border-line bg-surface"
              aria-label="Proposed changes"
            >
              {preview.actions.map((a, i) => {
                const Icon = ACTION_ICON[a.kind];
                return (
                  <li key={i} className="flex items-start gap-2.5 px-3 py-2.5">
                    <Icon size={15} className="mt-0.5 flex-none text-accent" aria-hidden />
                    <span className="min-w-0 break-words">{a.description}</span>
                  </li>
                );
              })}
            </ul>
            <p className="text-[12px] text-muted">
              Only how these elements are displayed changes. Nothing is deleted, no ads or trackers
              are unblocked, and
              <strong className="font-semibold"> Undo</strong> restores the page exactly. Reloading
              the page also restores it.
            </p>

            <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface p-3">
              <input
                id={rememberId}
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-none accent-[var(--sf-accent)]"
                aria-describedby={`${rememberId}-desc`}
              />
              <div>
                <label htmlFor={rememberId} className="font-medium">
                  Always apply on {hostname}
                </label>
                <p id={`${rememberId}-desc`} className="mt-0.5 text-[12px] text-muted">
                  {preview.rememberSelector ? (
                    <>
                      Saves a local rule for{' '}
                      <code className="font-mono text-[11px]">{preview.rememberSelector}</code>. You
                      can disable or delete it in the dashboard.
                    </>
                  ) : (
                    'This warning has no stable identifier, so no rule can be saved. ShieldFix will still apply high-confidence fixes here automatically.'
                  )}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button onClick={onBack} disabled={applying}>
                Cancel
              </Button>
              <Button variant="primary" loading={applying} onClick={() => void apply()}>
                Apply reversible fix
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
