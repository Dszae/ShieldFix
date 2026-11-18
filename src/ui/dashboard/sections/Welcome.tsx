import { useId, useState } from 'react';
import { Eye, MousePointerClick, ShieldCheck, Undo2 } from 'lucide-react';
import { ALL_SITES_ORIGINS } from '../../../shared/constants';
import { errorMessage, requestOrigins, send } from '../../lib/api';
import { useAnnounce } from '../../components/announcerContext';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { Alert } from '../../components/Feedback';
import { LogoMark } from '../../components/Logo';
import { useDashboard } from '../context';

type Mode = 'on-demand' | 'all-sites';

const STEPS = [
  {
    icon: Eye,
    title: 'Detect',
    body: 'Recognises anti-adblock warnings and tells them apart from normal dialogs.',
  },
  {
    icon: MousePointerClick,
    title: 'You decide',
    body: 'Proposes the least invasive fix and waits for your approval.',
  },
  {
    icon: Undo2,
    title: 'Reversible',
    body: 'Fixes only hide warnings. Undo or reload restores the page.',
  },
];

export function Welcome() {
  const { navigate, refresh } = useDashboard();
  const announce = useAnnounce();
  const name = useId();
  const [mode, setMode] = useState<Mode>('on-demand');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = () => {
    setBusy(true);
    setError(null);
    const permission =
      mode === 'all-sites' ? requestOrigins([...ALL_SITES_ORIGINS]) : Promise.resolve(true);
    void permission
      .then(async (granted) => {
        if (mode === 'all-sites') {
          if (!granted) {
            setError('Access was not granted. You can keep using on-demand mode, or try again.');
            return;
          }
          await send({ type: 'settings/update', patch: { monitorAllSites: true } });
          await send({ type: 'monitoring/sync' });
        }
        await send({ type: 'onboarding/complete' });
        announce('Setup complete.');
        refresh();
        navigate('overview');
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  const options: { id: Mode; title: string; body: string }[] = [
    {
      id: 'on-demand',
      title: 'Only when I click ShieldFix (recommended)',
      body: 'No site access needed. ShieldFix checks the current page when you open it from the toolbar.',
    },
    {
      id: 'all-sites',
      title: 'Automatically on every site',
      body: 'Warnings are caught as pages load. Requires permission to read and change all sites; processing stays on your device.',
    },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <LogoMark size={40} />
        <div>
          <h1 className="text-[22px] font-semibold tracking-[-0.01em]">Welcome to ShieldFix</h1>
          <p className="text-muted">Keep your privacy protection on — and keep websites working.</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((s) => (
          <Card key={s.title}>
            <s.icon size={18} className="text-accent" aria-hidden />
            <p className="mt-2 font-semibold">{s.title}</p>
            <p className="mt-1 text-muted">{s.body}</p>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <fieldset>
          <legend className="text-[14px] font-semibold">
            When should ShieldFix look for warnings?
          </legend>
          <p className="mt-1 text-muted">
            You can change this later, or watch individual sites from the toolbar popup.
          </p>
          <div className="mt-3 space-y-2">
            {options.map((o) => (
              <label
                key={o.id}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                  mode === o.id ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'
                }`}
              >
                <input
                  type="radio"
                  name={name}
                  value={o.id}
                  checked={mode === o.id}
                  onChange={() => setMode(o.id)}
                  className="mt-0.5 h-4 w-4 accent-[var(--sf-accent)]"
                />
                <span>
                  <span className="block font-medium">{o.title}</span>
                  <span className="mt-0.5 block text-muted">{o.body}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <div className="mt-3">
            <Alert tone="warn" role="alert">
              {error}
            </Alert>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-[12px] text-subtle">
            <ShieldCheck size={14} aria-hidden /> ShieldFix never turns off your protection.
          </p>
          <Button variant="primary" loading={busy} onClick={finish}>
            Finish setup
          </Button>
        </div>
      </Card>
    </div>
  );
}
