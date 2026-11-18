import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRouter, type Sender } from '../../src/background/router';
import { TabStateStore } from '../../src/background/tabState';
import type {
  BadgeGateway,
  PermissionsGateway,
  ScriptsGateway,
  TabsGateway,
} from '../../src/background/gateways';
import { MemoryArea } from '../../src/storage/area';
import { Repository } from '../../src/storage/repository';
import { ShieldFixError, type Envelope } from '../../src/shared/messages';
import { report } from './helpers/report';

const EXT = 'abcdefghijklmnopabcdefghijklmnop';
const ORIGIN = `chrome-extension://${EXT}/`;
const ui: Sender = { id: EXT, url: `${ORIGIN}popup.html` };
const page = (tabId = 7, url = 'https://www.example.com/article'): Sender => ({
  id: EXT,
  url,
  frameId: 0,
  tab: { id: tabId },
});

function setup() {
  const repo = new Repository(new MemoryArea());
  const injected = new Set<number>();
  const contentCalls: { tabId: number; type: string }[] = [];
  const contentResponses: Record<string, unknown> = {};
  const urls = new Map<number, string>([[7, 'https://www.example.com/article']]);
  const granted = new Set<string>();
  let registered: string[] | null = null;

  const tabs: TabsGateway = {
    getUrl: async (tabId) => urls.get(tabId) ?? null,
    send: (async (tabId: number, message: { type: string }) => {
      if (!injected.has(tabId)) throw new ShieldFixError('no-access', 'not injected');
      contentCalls.push({ tabId, type: message.type });
      if (message.type === 'cs/ping') return { alive: true, monitoring: false };
      return contentResponses[message.type] ?? null;
    }) as TabsGateway['send'],
    inject: vi.fn(async (tabId: number) => {
      injected.add(tabId);
    }),
    create: vi.fn(async (url: string) => {
      if (url.startsWith('brave://')) throw new Error('not allowed');
    }),
  };
  const permissions: PermissionsGateway = {
    contains: async (origins) => origins.every((o) => granted.has(o)),
    grantedOrigins: async () => [...granted],
  };
  const scripts: ScriptsGateway = {
    registeredMatches: async () => registered,
    setMatches: vi.fn(async (m: string[]) => {
      registered = m.length ? m : null;
    }),
  };
  const badge: BadgeGateway & { states: string[] } = {
    states: [],
    async set(_tabId, state) {
      this.states.push(state);
    },
  };
  const router = createRouter({
    extensionId: EXT,
    extensionOrigin: ORIGIN,
    version: '1.0.0',
    repo,
    tabsState: new TabStateStore(new MemoryArea()),
    tabs,
    permissions,
    scripts,
    badge,
    action: { openPopup: async () => false },
  });
  return {
    router,
    repo,
    tabs,
    scripts,
    badge,
    granted,
    contentCalls,
    contentResponses,
    urls,
    getRegistered: () => registered,
  };
}

const data = <T>(env: Envelope<unknown>) => {
  if (!env.ok) throw new Error(`${env.error.code}: ${env.error.message}`);
  return env.data as T;
};

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
});

describe('message validation and sender checks', () => {
  it('rejects messages from other extensions', async () => {
    const res = await t.router.handle(
      { type: 'settings/get' },
      { id: 'other', url: 'chrome-extension://other/x.html' },
    );
    expect(res).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  });

  it('rejects UI-only requests coming from web pages', async () => {
    const res = await t.router.handle({ type: 'data/reset' }, page());
    expect(res).toMatchObject({ ok: false, error: { code: 'invalid-request' } });
  });

  it('rejects content messages from sub-frames', async () => {
    const res = await t.router.handle({ type: 'content/config' }, { ...page(), frameId: 3 });
    expect(res).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  });

  it('rejects malformed requests', async () => {
    expect((await t.router.handle({ type: 'tab/scan', tabId: -1, trigger: 'popup' }, ui)).ok).toBe(
      false,
    );
    expect((await t.router.handle({ type: 'nope' }, ui)).ok).toBe(false);
    expect((await t.router.handle(null, ui)).ok).toBe(false);
    expect((await t.router.handle({ type: 'settings/update', patch: { evil: true } }, ui)).ok).toBe(
      false,
    );
  });

  it('refuses reports for a different hostname than the sending page', async () => {
    const res = await t.router.handle(
      { type: 'content/report', report: report({ hostname: 'other.com' }) },
      page(),
    );
    expect(res).toMatchObject({ ok: false, error: { code: 'forbidden' } });
  });
});

describe('scanning', () => {
  it('injects the content script on demand, then scans and records history once per level', async () => {
    t.contentResponses['cs/scan'] = report();
    const first = await t.router.handle({ type: 'tab/scan', tabId: 7, trigger: 'popup' }, ui);
    expect(first.ok).toBe(true);
    expect(t.tabs.inject).toHaveBeenCalledWith(7);
    await t.router.handle({ type: 'tab/scan', tabId: 7, trigger: 'manual' }, ui);
    const history = data<unknown[]>(await t.router.handle({ type: 'history/list' }, ui));
    expect(history).toHaveLength(1);
    expect(t.badge.states).toContain('issue');
    const state = data<{ report: unknown; site: { detections: number } }>(
      await t.router.handle({ type: 'tab/state', tabId: 7 }, ui),
    );
    expect(state.report).not.toBeNull();
    expect(state.site.detections).toBe(1);
  });

  it('reports unsupported pages', async () => {
    t.urls.set(8, 'chrome://settings');
    const res = await t.router.handle({ type: 'tab/scan', tabId: 8, trigger: 'popup' }, ui);
    expect(res).toMatchObject({ ok: false, error: { code: 'unsupported-page' } });
  });

  it('clears tab state and badge on navigation', async () => {
    t.contentResponses['cs/scan'] = report();
    await t.router.handle({ type: 'tab/scan', tabId: 7, trigger: 'popup' }, ui);
    await t.router.onTabLoading(7);
    const state = data<{ report: unknown }>(
      await t.router.handle({ type: 'tab/state', tabId: 7 }, ui),
    );
    expect(state.report).toBeNull();
    expect(t.badge.states.at(-1)).toBe('clear');
  });
});

describe('fixes', () => {
  beforeEach(() => {
    t.contentResponses['cs/applyFix'] = {
      applied: true,
      verified: { overlayHidden: true, scrollRestored: true },
      message: 'The warning is hidden.',
      selector: '#adb-wall',
      report: report({
        fix: {
          active: true,
          candidateId: 'c1',
          appliedAt: 1,
          auto: false,
          actions: [],
          reassertions: 0,
          reapplications: 0,
        },
      }),
    };
    t.contentResponses['cs/revertFix'] = { reverted: true, message: 'Restored.', report: report() };
  });

  it('applies without remembering', async () => {
    const out = data<{ applied: boolean; ruleSaved: boolean }>(
      await t.router.handle(
        { type: 'tab/applyFix', tabId: 7, candidateId: 'c1', remember: false },
        ui,
      ),
    );
    expect(out).toMatchObject({ applied: true, ruleSaved: false });
    expect(await t.repo.getRules()).toEqual([]);
    expect(t.badge.states).toContain('fixed');
  });

  it('remembers a fix as an enabled user rule plus a site preference', async () => {
    const out = data<{ ruleSaved: boolean }>(
      await t.router.handle(
        { type: 'tab/applyFix', tabId: 7, candidateId: 'c1', remember: true },
        ui,
      ),
    );
    expect(out.ruleSaved).toBe(true);
    const rules = await t.repo.getRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({
      domain: 'example.com',
      selector: '#adb-wall',
      enabled: true,
      source: 'user',
    });
    expect((await t.repo.getSite('example.com'))!.autoFix).toBe(true);
    expect(t.contentCalls.map((c) => c.type)).toContain('cs/configChanged');
    await t.router.handle(
      { type: 'tab/applyFix', tabId: 7, candidateId: 'c1', remember: true },
      ui,
    );
    expect(await t.repo.getRules()).toHaveLength(1);
  });

  it('revert with forget disables saved rules and auto-fix for the site', async () => {
    await t.router.handle(
      { type: 'tab/applyFix', tabId: 7, candidateId: 'c1', remember: true },
      ui,
    );
    await t.router.handle({ type: 'tab/revertFix', tabId: 7, forget: true }, ui);
    expect((await t.repo.getRules())[0]!.enabled).toBe(false);
    expect((await t.repo.getSite('example.com'))!.autoFix).toBe(false);
    const events = data<{ event: string }[]>(
      await t.router.handle({ type: 'history/list' }, ui),
    ).map((h) => h.event);
    expect(events).toEqual(expect.arrayContaining(['fix-applied', 'fix-reverted']));
  });

  it('records auto-applied fixes reported by the content script', async () => {
    const res = await t.router.handle(
      {
        type: 'content/fixEvent',
        event: 'auto-applied',
        report: report({
          fix: {
            active: true,
            candidateId: 'c1',
            appliedAt: 1,
            auto: true,
            actions: [],
            reassertions: 0,
            reapplications: 0,
          },
        }),
      },
      page(),
    );
    expect(res.ok).toBe(true);
    const events = data<{ event: string }[]>(
      await t.router.handle({ type: 'history/list' }, ui),
    ).map((h) => h.event);
    expect(events).toEqual(['fix-auto-applied']);
  });
});

describe('monitoring', () => {
  it('stays on demand without permissions', async () => {
    await t.router.handle(
      { type: 'site/update', hostname: 'example.com', patch: { monitor: true } },
      ui,
    );
    const info = data<{ monitoringMode: string }>(
      await t.router.handle({ type: 'monitoring/sync' }, ui),
    );
    expect(info.monitoringMode).toBe('on-demand');
    expect(t.getRegistered()).toBeNull();
  });

  it('registers the content script for granted, monitored sites', async () => {
    t.granted.add('*://example.com/*').add('*://*.example.com/*');
    await t.router.onPermissionsChanged({ added: ['*://example.com/*', '*://*.example.com/*'] });
    expect((await t.repo.getSite('example.com'))!.monitor).toBe(true);
    expect(t.getRegistered()).toEqual(['*://example.com/*', '*://*.example.com/*']);
    const config = data<{ monitoring: boolean }>(
      await t.router.handle({ type: 'content/config' }, page()),
    );
    expect(config.monitoring).toBe(true);
  });

  it('unregisters when permission is revoked', async () => {
    t.granted.add('*://example.com/*').add('*://*.example.com/*');
    await t.router.onPermissionsChanged({ added: ['*://example.com/*'] });
    t.granted.clear();
    await t.router.onPermissionsChanged({ removed: ['*://example.com/*'] });
    expect((await t.repo.getSite('example.com'))!.monitor).toBe(false);
    expect(t.getRegistered()).toBeNull();
  });

  it('watches all sites only with both the setting and the permission', async () => {
    t.granted.add('http://*/*').add('https://*/*');
    await t.router.onPermissionsChanged({ added: ['http://*/*', 'https://*/*'] });
    expect((await t.repo.getSettings()).monitorAllSites).toBe(true);
    expect(t.getRegistered()).toEqual(['http://*/*', 'https://*/*']);
    await t.router.handle({ type: 'settings/update', patch: { monitorAllSites: false } }, ui);
    expect(t.getRegistered()).toBeNull();
  });
});

describe('settings', () => {
  it('updating one setting leaves all others unchanged (regression)', async () => {
    await t.router.handle({ type: 'settings/update', patch: { theme: 'dark' } }, ui);
    await t.router.handle({ type: 'settings/update', patch: { showInPageNotice: false } }, ui);
    const settings = data<{ theme: string; showInPageNotice: boolean }>(
      await t.router.handle({ type: 'settings/get' }, ui),
    );
    expect(settings).toMatchObject({ theme: 'dark', showInPageNotice: false });
  });
});

describe('content configuration', () => {
  it('sends only enabled, unexpired rules for the page host', async () => {
    await t.repo.upsertRule({ domain: 'example.com', selector: '.on', enabled: true });
    await t.repo.upsertRule({ domain: 'example.com', selector: '.off', enabled: false });
    await t.repo.upsertRule({ domain: 'other.com', selector: '.elsewhere', enabled: true });
    const config = data<{ rules: { selector: string }[]; hostname: string }>(
      await t.router.handle({ type: 'content/config' }, page()),
    );
    expect(config.hostname).toBe('example.com');
    expect(config.rules.map((r) => r.selector)).toEqual(['.on']);
  });
});

describe('brave settings', () => {
  it('falls back when a settings URL cannot be opened and reports what was opened', async () => {
    const res = data<{ opened: string }>(
      await t.router.handle({ type: 'brave/open', page: 'shields' }, ui),
    );
    expect(res.opened).toBe('chrome://settings/shields');
  });
});
