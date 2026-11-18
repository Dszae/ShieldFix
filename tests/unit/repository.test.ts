import { beforeEach, describe, expect, it } from 'vitest';
import { MemoryArea } from '../../src/storage/area';
import { Repository, SCHEMA_VERSION } from '../../src/storage/repository';
import { DEFAULT_SETTINGS } from '../../src/shared/schemas';
import { ShieldFixError } from '../../src/shared/messages';

let area: MemoryArea;
let now: number;
let repo: Repository;

beforeEach(() => {
  area = new MemoryArea();
  now = 1_700_000_000_000;
  repo = new Repository(area, () => now);
});

describe('settings', () => {
  it('returns defaults and persists validated patches', async () => {
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
    const next = await repo.updateSettings({ theme: 'dark', developerMode: true });
    expect(next.theme).toBe('dark');
    expect((await repo.getSettings()).developerMode).toBe(true);
  });

  it('rejects invalid values', async () => {
    await expect(repo.updateSettings({ historyRetentionDays: 9999 })).rejects.toThrow();
  });

  it('recovers from corrupt stored settings', async () => {
    await area.set({ settings: { theme: 42 } });
    expect(await repo.getSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('clears history when history is disabled', async () => {
    await repo.addHistory({
      hostname: 'a.com',
      event: 'detected',
      level: 'high',
      confidence: 95,
      signals: [],
    });
    await repo.updateSettings({ historyEnabled: false });
    expect(await repo.listHistory()).toEqual([]);
    expect(
      await repo.addHistory({
        hostname: 'a.com',
        event: 'detected',
        level: 'high',
        confidence: 95,
        signals: [],
      }),
    ).toBeNull();
  });
});

describe('sites', () => {
  it('creates, updates and removes site preferences', async () => {
    await repo.updateSite('WWW.Example.com', { monitor: true });
    const site = await repo.getSite('example.com');
    expect(site).toMatchObject({ hostname: 'example.com', monitor: true, autoFix: false });
    await repo.removeSite('example.com');
    expect(await repo.getSite('example.com')).toBeNull();
  });

  it('records detections only when something was found or a preference exists', async () => {
    await repo.recordScan('clean.com', { level: 'none', confidence: 0 });
    expect(await repo.getSite('clean.com')).toBeNull();
    await repo.recordScan('warn.com', { level: 'high', confidence: 96 });
    expect(await repo.getSite('warn.com')).toMatchObject({
      detections: 1,
      lastLevel: 'high',
      lastConfidence: 96,
    });
    await repo.recordScan('warn.com', { level: 'high', confidence: 96, fixApplied: true });
    expect(await repo.getSite('warn.com')).toMatchObject({ detections: 1, fixesApplied: 1 });
  });

  it('does not create site records when history is disabled', async () => {
    await repo.updateSettings({ historyEnabled: false });
    await repo.recordScan('warn.com', { level: 'high', confidence: 96 });
    expect(await repo.getSite('warn.com')).toBeNull();
  });
});

describe('rules', () => {
  it('versions edits and rolls back', async () => {
    const r1 = await repo.upsertRule({ domain: 'example.com', selector: '.a', enabled: true });
    now += 1000;
    const r2 = await repo.upsertRule({
      id: r1.id,
      domain: 'example.com',
      selector: '.b',
      enabled: true,
    });
    expect(r2.version).toBe(2);
    const listed = await repo.listRules();
    expect(listed[0]).toMatchObject({ selector: '.b', previousVersions: 1 });
    const restored = await repo.rollbackRule(r1.id);
    expect(restored).toMatchObject({ selector: '.a', version: 1 });
    expect((await repo.listRules())[0]!.previousVersions).toBe(0);
    await expect(repo.rollbackRule(r1.id)).rejects.toBeInstanceOf(ShieldFixError);
  });

  it('keeps at most five previous versions', async () => {
    const r = await repo.upsertRule({ domain: 'example.com', selector: '.v0' });
    for (let i = 1; i <= 8; i++)
      await repo.upsertRule({ id: r.id, domain: 'example.com', selector: `.v${i}` });
    expect((await repo.listRules())[0]!.previousVersions).toBe(5);
  });

  it('enables, disables and deletes', async () => {
    const r = await repo.upsertRule({ domain: 'example.com', selector: '.a' });
    expect((await repo.setRuleEnabled(r.id, true)).enabled).toBe(true);
    await repo.deleteRule(r.id);
    expect(await repo.listRules()).toEqual([]);
    await expect(repo.setRuleEnabled(r.id, true)).rejects.toBeInstanceOf(ShieldFixError);
  });

  it('purges expired rules', async () => {
    await repo.upsertRule({ domain: 'example.com', selector: '.a', expiresAt: now + 10 });
    await repo.upsertRule({ domain: 'example.com', selector: '.b' });
    now += 100;
    expect((await repo.listRules()).find((r) => r.selector === '.a')!.expired).toBe(true);
    expect(await repo.purgeExpiredRules()).toBe(1);
    expect((await repo.listRules()).map((r) => r.selector)).toEqual(['.b']);
  });

  it('imports rules disabled and skips duplicates', async () => {
    await repo.upsertRule({ domain: 'example.com', selector: '.existing', enabled: true });
    const result = await repo.importRules({
      format: 'shieldfix-rules',
      formatVersion: 1,
      rules: [
        { domain: 'example.com', selector: '.existing' },
        { domain: 'example.com', selector: '.new', enabled: true },
        { domain: 'example.com', selector: 'html' },
      ],
    });
    expect(result).toMatchObject({ imported: 1, duplicates: 1 });
    expect(result.rejected).toHaveLength(1);
    const imported = (await repo.listRules()).find((r) => r.selector === '.new')!;
    expect(imported).toMatchObject({ enabled: false, source: 'community' });
  });

  it('round-trips through export and import', async () => {
    await repo.upsertRule({ domain: 'example.com', selector: '.a', enabled: true });
    const exported = await repo.exportRules();
    const fresh = new Repository(new MemoryArea(), () => now);
    expect((await fresh.importRules(JSON.parse(JSON.stringify(exported)))).imported).toBe(1);
  });

  it('drops invalid stored rules instead of failing', async () => {
    await area.set({ rules: [{ nonsense: true }] });
    expect(await repo.listRules()).toEqual([]);
  });
});

describe('history', () => {
  it('stores newest first, applies retention and caps size', async () => {
    await repo.addHistory({
      hostname: 'old.com',
      event: 'detected',
      level: 'likely',
      confidence: 75,
      signals: ['phrase-strong'],
    });
    now += 31 * 86_400_000;
    await repo.addHistory({
      hostname: 'new.com',
      event: 'fix-applied',
      level: 'high',
      confidence: 95,
      signals: [],
    });
    const list = await repo.listHistory();
    expect(list.map((h) => h.hostname)).toEqual(['new.com']);
    for (let i = 0; i < 520; i++) {
      await repo.addHistory({
        hostname: 'x.com',
        event: 'detected',
        level: 'possible',
        confidence: 41,
        signals: [],
      });
    }
    expect((await repo.listHistory()).length).toBe(500);
  });
});

describe('concurrency and lifecycle', () => {
  it('serialises concurrent writes without losing updates', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        repo.upsertRule({ domain: 'example.com', selector: `.r${i}` }),
      ),
    );
    expect((await repo.listRules()).length).toBe(20);
  });

  it('migrates and resets', async () => {
    await repo.migrate();
    expect(area.raw('schemaVersion')).toBe(SCHEMA_VERSION);
    await repo.updateSettings({ theme: 'dark' });
    await repo.resetAll();
    expect((await repo.getSettings()).theme).toBe('system');
    expect(area.raw('schemaVersion')).toBe(SCHEMA_VERSION);
  });

  it('tracks onboarding', async () => {
    expect((await repo.getOnboarding()).completed).toBe(false);
    await repo.completeOnboarding();
    expect(await repo.getOnboarding()).toEqual({ completed: true, completedAt: now });
  });
});
