import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContentController, type Bridge } from '../../src/content/controller';
import type { ContentConfig } from '../../src/shared/messages';
import type { DetectionReport } from '../../src/shared/schemas';
import { $, FakeLayout, html } from './helpers/layout';

const WALL = `
  <main><p>${'Story text. '.repeat(40)}</p></main>
  <div id="wall" class="adblock-wall" style="position:fixed;z-index:99999;display:block">
    <h2>Ad blocker detected</h2><p>Please disable your ad blocker to continue.</p><button>I've disabled it</button>
  </div>`;

function makeBridge(config: Partial<ContentConfig> = {}) {
  const reports: DetectionReport[] = [];
  const events: string[] = [];
  const cfg: ContentConfig = {
    hostname: 'localhost',
    monitoring: false,
    autoFix: false,
    autoApplyRemembered: true,
    showInPageNotice: true,
    rules: [],
    ...config,
  };
  const bridge: Bridge = {
    getConfig: vi.fn(async () => cfg),
    report: (r) => reports.push(r),
    fixEvent: (e) => events.push(e),
    openPopup: async () => false,
  };
  return { bridge, reports, events, cfg };
}

let layout: FakeLayout;
let controller: ContentController | null = null;

beforeEach(() => {
  layout = new FakeLayout();
  html(WALL);
  document.body.style.overflowY = 'hidden';
  layout.fullscreen($('#wall'));
});

afterEach(() => {
  controller?.destroy();
  controller = null;
  document.querySelectorAll('shieldfix-notice').forEach((n) => n.remove());
});

const create = (bridge: Bridge) => {
  controller = new ContentController(window, bridge, layout.probe);
  return controller;
};

describe('ContentController', () => {
  it('scans and produces a validated, privacy-safe report', async () => {
    const { bridge } = makeBridge();
    const report = await create(bridge).scan('popup');
    expect(report.level).toBe('high');
    expect(report.primaryCandidateId).toMatch(/^c\d+$/);
    expect(report.hostname).toBe('localhost');
    expect(JSON.stringify(report)).not.toContain('Story text');
    expect(JSON.stringify(report)).not.toContain('disable your ad blocker to continue');
  });

  it('keeps candidate ids stable across scans', async () => {
    const c = create(makeBridge().bridge);
    const a = await c.scan('popup');
    const b = await c.scan('manual');
    expect(b.primaryCandidateId).toBe(a.primaryCandidateId);
  });

  it('previews, applies and reverts a fix', async () => {
    const c = create(makeBridge().bridge);
    const report = await c.scan('popup');
    const preview = c.previewFix(report.primaryCandidateId!);
    expect(preview.actions.map((a) => a.kind)).toContain('hide');
    expect(preview.selector).toBe('#wall');

    const result = await c.applyFix(report.primaryCandidateId!);
    expect(result.applied).toBe(true);
    expect(result.verified.overlayHidden).toBe(true);
    expect($('#wall').style.display).toBe('none');
    expect(result.report.fix.active).toBe(true);
    expect(result.report.level).toBe('high');

    const reverted = c.revertFix();
    expect(reverted.reverted).toBe(true);
    expect($('#wall').style.display).toBe('block');
    expect(reverted.report!.fix.active).toBe(false);
  });

  it('refuses unknown or stale candidates', async () => {
    const c = create(makeBridge().bridge);
    await expect(c.applyFix('c999')).rejects.toMatchObject({ code: 'stale' });
    const report = await c.scan('popup');
    $('#wall').remove();
    await expect(c.applyFix(report.primaryCandidateId!)).rejects.toMatchObject({ code: 'stale' });
  });

  it('refuses to fix candidates that are not fixable', async () => {
    html(
      `<div id="consent" role="dialog" style="position:fixed;z-index:9999">We use cookies. Accept all or manage preferences. Some content requires an ad blocker exception.</div>`,
    );
    layout = new FakeLayout();
    layout.set($('#consent'), [0, 600, 1280, 200]);
    const c = create(makeBridge().bridge);
    const report = await c.scan('popup');
    const id = report.candidates[0]!.id;
    await expect(c.applyFix(id)).rejects.toMatchObject({ code: 'refused' });
    expect($('#consent').style.display).toBe('');
  });

  it('auto-applies when an enabled rule matches, and not again after the user undoes it', async () => {
    const { bridge, events } = makeBridge({
      rules: [{ id: 'r-1', selector: '#wall', ruleType: 'cosmetic-overlay', confidence: 95 }],
    });
    const c = create(bridge);
    const report = await c.scan('popup');
    expect(report.fix.active).toBe(true);
    expect(report.fix.auto).toBe(true);
    expect(events).toEqual(['auto-applied']);
    c.revertFix();
    const again = await c.scan('manual');
    expect(again.fix.active).toBe(false);
  });

  it('does not auto-apply when the master switch is off', async () => {
    const { bridge } = makeBridge({ autoFix: true, autoApplyRemembered: false });
    const report = await create(bridge).scan('popup');
    expect(report.fix.active).toBe(false);
  });

  it('shows an in-page notice only for monitored scans', async () => {
    const c = create(makeBridge().bridge);
    await c.scan('popup');
    expect(document.querySelector('shieldfix-notice')).toBeNull();
    await c.scan('monitor');
    const host = document.querySelector('shieldfix-notice');
    expect(host).not.toBeNull();
    expect(host!.shadowRoot!.textContent).toContain('Ad-blocker warning detected');
    const report = await c.scan('manual');
    expect(report.candidates.every((x) => !x.descriptor.startsWith('shieldfix-notice'))).toBe(true);
  });

  it('re-applies under the same approval when the page inserts a new warning', async () => {
    const c = create(makeBridge().bridge);
    const report = await c.scan('popup');
    await c.applyFix(report.primaryCandidateId!);
    const second = document.createElement('div');
    second.id = 'wall2';
    second.className = 'adblock-wall';
    second.setAttribute('style', 'position:fixed;z-index:99999');
    second.innerHTML =
      '<p>Ad blocker detected. Please disable your ad blocker.</p><button>Refresh</button>';
    document.body.appendChild(second);
    layout.fullscreen(second);
    const after = await c.scan('mutation');
    expect(second.style.display).toBe('none');
    expect(after.fix.reapplications).toBe(1);
    c.revertFix();
    expect(second.style.display).toBe('');
  });

  it('stops monitoring and restores the page on destroy', async () => {
    const c = create(makeBridge().bridge);
    const report = await c.scan('popup');
    await c.applyFix(report.primaryCandidateId!);
    c.destroy();
    controller = null;
    expect($('#wall').style.display).toBe('block');
  });
});
