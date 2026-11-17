import { useMemo, useRef, useState } from 'react';
import {
  Download,
  History as HistoryIcon,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from 'lucide-react';
import { checkSelectorSafety, isSyntacticallyValidSelector } from '../../../compat/selectorSafety';
import { isValidHostname, normalizeHostname } from '../../../shared/domain';
import type { ImportOutcome, RuleWithHistory } from '../../../shared/messages';
import type { RuleType } from '../../../shared/schemas';
import { errorMessage, send } from '../../lib/api';
import { dateTime } from '../../lib/format';
import { useAsync } from '../../lib/hooks';
import { useAnnounce } from '../../components/announcerContext';
import { Badge } from '../../components/Badge';
import { Button, IconButton } from '../../components/Button';
import { Card } from '../../components/Card';
import { ConfirmDialog, Modal } from '../../components/Dialog';
import { Alert, EmptyState, LoadingBlock } from '../../components/Feedback';
import { SelectField, TextArea, TextField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { Switch } from '../../components/Switch';
import { useDashboard } from '../context';

const DAY = 86_400_000;
const SOURCE_LABEL = { user: 'Yours', community: 'Imported', bundled: 'Built-in' } as const;
const TYPE_LABEL: Record<RuleType, string> = {
  'cosmetic-overlay': 'Overlay (hide + restore scrolling)',
  'cosmetic-hide': 'Hide element only',
};

interface Draft {
  id?: string;
  domain: string;
  selector: string;
  ruleType: RuleType;
  confidence: string;
  description: string;
  expiry: 'never' | '30' | '90' | '365' | 'keep';
  enabled: boolean;
  existingExpiry: number | null;
}

const EMPTY_DRAFT: Draft = {
  domain: '',
  selector: '',
  ruleType: 'cosmetic-overlay',
  confidence: '95',
  description: '',
  expiry: 'never',
  enabled: true,
  existingExpiry: null,
};

function validate(d: Draft): Partial<Record<'domain' | 'selector' | 'confidence', string>> {
  const errors: Partial<Record<'domain' | 'selector' | 'confidence', string>> = {};
  if (!isValidHostname(normalizeHostname(d.domain)))
    errors.domain = 'Enter a domain such as example.com.';
  const safety = checkSelectorSafety(d.selector);
  if (!safety.ok) errors.selector = safety.reason;
  else if (!isSyntacticallyValidSelector(d.selector.trim()))
    errors.selector = 'This is not a valid CSS selector.';
  const c = Number(d.confidence);
  if (!Number.isInteger(c) || c < 50 || c > 100)
    errors.confidence = 'Use a whole number from 50 to 100.';
  return errors;
}

function RuleEditor({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const announce = useAnnounce();
  const [d, setD] = useState<Draft>(draft ?? EMPTY_DRAFT);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const errors = validate(d);
  const show = (k: keyof typeof errors) => (touched ? errors[k] : null);

  const save = async () => {
    setTouched(true);
    if (Object.keys(errors).length > 0) return;
    setSaving(true);
    setError(null);
    const expiresAt =
      d.expiry === 'keep'
        ? d.existingExpiry
        : d.expiry === 'never'
          ? null
          : Date.now() + Number(d.expiry) * DAY;
    try {
      await send({
        type: 'rules/upsert',
        rule: {
          id: d.id,
          domain: d.domain,
          selector: d.selector.trim(),
          ruleType: d.ruleType,
          confidence: Number(d.confidence),
          description: d.description.trim(),
          enabled: d.enabled,
          expiresAt,
        },
      });
      announce(
        d.id ? 'Rule updated. The previous version was kept for rollback.' : 'Rule created.',
      );
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      width="max-w-lg"
      title={d.id ? 'Edit rule' : 'New compatibility rule'}
      description="A rule tells ShieldFix which element on a site is an anti-adblock warning. It only hides that element, and only when it passes the same safety checks as a detected warning."
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            {d.id ? 'Save new version' : 'Create rule'}
          </Button>
        </>
      }
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        noValidate
      >
        <TextField
          label="Domain"
          placeholder="example.com"
          value={d.domain}
          onChange={(e) => setD({ ...d, domain: e.target.value })}
          error={show('domain')}
          hint="Also applies to subdomains, such as www.example.com."
          autoFocus
        />
        <TextField
          label="CSS selector"
          placeholder=".adblock-wall"
          value={d.selector}
          onChange={(e) => setD({ ...d, selector: e.target.value })}
          error={show('selector')}
          hint="Must target a class, id or attribute. Rules cannot target html, body or main, and cannot contain code."
          className="font-mono"
          spellCheck={false}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Type"
            value={d.ruleType}
            onChange={(e) => setD({ ...d, ruleType: e.target.value as RuleType })}
          >
            {Object.entries(TYPE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </SelectField>
          <TextField
            label="Confidence (%)"
            type="number"
            min={50}
            max={100}
            value={d.confidence}
            onChange={(e) => setD({ ...d, confidence: e.target.value })}
            error={show('confidence')}
            hint="90 or more allows the fix."
          />
        </div>
        <SelectField
          label="Expires"
          value={d.expiry}
          onChange={(e) => setD({ ...d, expiry: e.target.value as Draft['expiry'] })}
        >
          {d.existingExpiry !== null && (
            <option value="keep">Keep current ({dateTime(d.existingExpiry)})</option>
          )}
          <option value="never">Never</option>
          <option value="30">In 30 days</option>
          <option value="90">In 90 days</option>
          <option value="365">In a year</option>
        </SelectField>
        <TextField
          label="Note (optional)"
          value={d.description}
          maxLength={200}
          onChange={(e) => setD({ ...d, description: e.target.value })}
        />
        <Switch
          checked={d.enabled}
          onChange={(v) => setD({ ...d, enabled: v })}
          label="Enabled"
          description="Disabled rules are kept but never applied."
        />
        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const announce = useAnnounce();
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [result, setResult] = useState<ImportOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setText('');
    setResult(null);
    setError(null);
    onClose();
  };

  const run = async () => {
    setError(null);
    setResult(null);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      setError('This is not valid JSON.');
      return;
    }
    setBusy(true);
    try {
      const outcome = await send({ type: 'rules/import', payload });
      setResult(outcome);
      announce(`Imported ${outcome.imported} rules. ${outcome.rejected.length} rejected.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={close}
      width="max-w-lg"
      title="Import rules"
      description="Paste or choose a ShieldFix rules file. Every rule is validated, and imported rules stay disabled until you review and enable them."
      footer={
        <>
          <Button onClick={close}>{result ? 'Done' : 'Cancel'}</Button>
          {!result && (
            <Button
              variant="primary"
              loading={busy}
              disabled={!text.trim()}
              onClick={() => void run()}
            >
              Import
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            aria-label="Choose a rules file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 512_000) {
                setError('The file is larger than 500 KB.');
                return;
              }
              setText(await file.text());
            }}
          />
          <Button
            size="sm"
            icon={<Upload size={13} aria-hidden />}
            onClick={() => fileRef.current?.click()}
          >
            Choose file…
          </Button>
        </div>
        <TextArea
          label="Rules JSON"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
        {error && (
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        )}
        {result && (
          <Alert
            tone={result.rejected.length ? 'warn' : 'ok'}
            role="status"
            title={`${result.imported} imported, ${result.duplicates} already present`}
          >
            {result.rejected.length > 0 && (
              <ul className="mt-1 list-disc pl-4">
                {result.rejected.slice(0, 8).map((r) => (
                  <li key={r.index}>
                    {r.index >= 0 ? `Rule ${r.index + 1}: ` : ''}
                    {r.reason}
                  </li>
                ))}
              </ul>
            )}
          </Alert>
        )}
      </div>
    </Modal>
  );
}

export function Rules() {
  const { version } = useDashboard();
  const announce = useAnnounce();
  const rules = useAsync(() => send({ type: 'rules/list' }), [version]);
  const [editing, setEditing] = useState<Draft | null | 'new'>(null);
  const [importing, setImporting] = useState(false);
  const [confirm, setConfirm] = useState<{
    kind: 'delete' | 'rollback';
    rule: RuleWithHistory;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, RuleWithHistory[]>();
    for (const r of rules.data ?? []) map.set(r.domain, [...(map.get(r.domain) ?? []), r]);
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rules.data]);

  const exportRules = async () => {
    try {
      const data = await send({ type: 'rules/export' });
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shieldfix-rules-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      announce(`Exported ${data.rules.length} rules.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const toggle = async (rule: RuleWithHistory, enabled: boolean) => {
    try {
      await send({ type: 'rules/setEnabled', id: rule.id, enabled });
      announce(`Rule ${enabled ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Compatibility rules"
        description="Site-specific rules identify anti-adblock warnings that ShieldFix may hide. Rules contain only a domain and a validated selector — never code — and stay on this device."
        action={
          <>
            <Button icon={<Upload size={14} aria-hidden />} onClick={() => setImporting(true)}>
              Import
            </Button>
            <Button
              icon={<Download size={14} aria-hidden />}
              disabled={!rules.data?.length}
              onClick={() => void exportRules()}
            >
              Export
            </Button>
            <Button
              variant="primary"
              icon={<Plus size={14} aria-hidden />}
              onClick={() => setEditing('new')}
            >
              New rule
            </Button>
          </>
        }
      />
      {error && (
        <div className="mb-4">
          <Alert tone="danger" role="alert">
            {error}
          </Alert>
        </div>
      )}
      {rules.status === 'loading' && !rules.data && <LoadingBlock />}
      {rules.status === 'error' && <Alert tone="danger">{rules.error}</Alert>}
      {rules.data && rules.data.length === 0 && (
        <Card>
          <EmptyState
            icon={<ListChecks size={18} aria-hidden />}
            title="No rules yet"
            action={
              <Button
                variant="primary"
                icon={<Plus size={14} aria-hidden />}
                onClick={() => setEditing('new')}
              >
                New rule
              </Button>
            }
          >
            When you apply a fix with “Always apply on this site”, ShieldFix saves a rule here. You
            can also write or import rules.
          </EmptyState>
        </Card>
      )}

      <div className="space-y-4">
        {grouped.map(([domain, list]) => (
          <Card key={domain} padded={false}>
            <h2 className="border-b border-line px-4 py-2.5 font-semibold">{domain}</h2>
            <ul className="divide-y divide-line">
              {list.map((rule) => (
                <li
                  key={rule.id}
                  className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto] md:items-center"
                >
                  <div className="min-w-0">
                    <code className="block truncate font-mono text-[12px]" title={rule.selector}>
                      {rule.selector}
                    </code>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <Badge tone={rule.source === 'user' ? 'accent' : 'info'}>
                        {SOURCE_LABEL[rule.source]}
                      </Badge>
                      <Badge>{TYPE_LABEL[rule.ruleType]}</Badge>
                      <Badge>v{rule.version}</Badge>
                      <Badge>{rule.confidence}%</Badge>
                      {rule.expired && <Badge tone="warn">Expired</Badge>}
                      {!rule.expired && rule.expiresAt && (
                        <Badge>Expires {dateTime(rule.expiresAt)}</Badge>
                      )}
                    </div>
                    {rule.description && (
                      <p className="mt-1.5 text-[12px] text-muted">{rule.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="mr-2">
                      <Switch
                        checked={rule.enabled}
                        onChange={(v) => void toggle(rule, v)}
                        label={<span className="sr-only">Enabled</span>}
                      />
                    </div>
                    <IconButton
                      label="Edit rule"
                      onClick={() =>
                        setEditing({
                          id: rule.id,
                          domain: rule.domain,
                          selector: rule.selector,
                          ruleType: rule.ruleType,
                          confidence: String(rule.confidence),
                          description: rule.description,
                          expiry: rule.expiresAt ? 'keep' : 'never',
                          enabled: rule.enabled,
                          existingExpiry: rule.expiresAt,
                        })
                      }
                    >
                      <Pencil size={15} aria-hidden />
                    </IconButton>
                    <IconButton
                      label={
                        rule.previousVersions
                          ? `Roll back to version ${rule.version - 1}`
                          : 'No earlier version'
                      }
                      disabled={!rule.previousVersions}
                      className="disabled:opacity-35"
                      onClick={() => setConfirm({ kind: 'rollback', rule })}
                    >
                      <HistoryIcon size={15} aria-hidden />
                    </IconButton>
                    <IconButton
                      label="Delete rule"
                      onClick={() => setConfirm({ kind: 'delete', rule })}
                    >
                      <Trash2 size={15} aria-hidden />
                    </IconButton>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {editing !== null && (
        <RuleEditor draft={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      <ConfirmDialog
        open={confirm?.kind === 'delete'}
        title="Delete this rule?"
        description="The rule and its earlier versions are removed. Pages that are already open keep any fix currently applied until reload."
        confirmLabel="Delete rule"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            await send({ type: 'rules/delete', id: confirm.rule.id });
            announce('Rule deleted.');
          } catch (err) {
            setError(errorMessage(err));
          }
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === 'rollback'}
        title="Roll back this rule?"
        description="The rule returns to its previous saved version."
        confirmLabel="Roll back"
        onCancel={() => setConfirm(null)}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            await send({ type: 'rules/rollback', id: confirm.rule.id });
            announce('Rule rolled back.');
          } catch (err) {
            setError(errorMessage(err));
          }
          setConfirm(null);
        }}
      />
    </>
  );
}
