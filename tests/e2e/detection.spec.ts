import type { DetectionReport } from '../../src/shared/schemas';
import type { FixOutcome, RevertOutcome } from '../../src/shared/messages';
import { expect, openFixture, test } from './fixtures';

const anti = (r: DetectionReport) =>
  r.candidates.find((c) => c.id === r.primaryCandidateId) ?? null;

test.describe('anti-adblock warnings are detected and fixed reversibly', () => {
  test('1. full-screen modal: high confidence, fix hides wall + backdrop, restores scroll and blur, undo restores', async ({
    context,
    ext,
  }) => {
    const { page, tabId } = await openFixture(context, ext, 'fullscreen-modal');
    const report = await ext.data<DetectionReport>({ type: 'tab/scan', tabId, trigger: 'manual' });
    const primary = anti(report)!;
    expect(report.level).toBe('high');
    expect(primary.classification).toBe('anti-adblock-overlay');
    expect(primary.fixable).toBe(true);
    expect(report.page.scrollLocked).toBe(true);
    expect(report.page.blurredElements).toBeGreaterThan(0);
    expect(report.ordinaryDialogs).toBe(0);

    const preview = await ext.data<{ actions: { kind: string }[]; rememberSelector: string }>({
      type: 'tab/previewFix',
      tabId,
      candidateId: primary.id,
    });
    expect(preview.actions.map((a) => a.kind)).toEqual(
      expect.arrayContaining(['hide', 'unlock-scroll', 'remove-filter']),
    );
    expect(preview.rememberSelector).toBe('#adb-wall');

    const outcome = await ext.data<FixOutcome>({
      type: 'tab/applyFix',
      tabId,
      candidateId: primary.id,
      remember: false,
    });
    expect(outcome.applied).toBe(true);
    expect(outcome.verified).toEqual({ overlayHidden: true, scrollRestored: true });
    await expect(page.locator('#adb-wall')).toBeHidden();
    await expect(page.locator('#adb-backdrop')).toBeHidden();
    await expect(page.locator('#article-text')).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).toBe('auto');
    expect(
      await page.evaluate(() => getComputedStyle(document.getElementById('page-content')!).filter),
    ).toBe('none');
    await page.mouse.wheel(0, 600);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    expect(await ext.badge(tabId)).toBe('✓');

    const reverted = await ext.data<RevertOutcome>({ type: 'tab/revertFix', tabId, forget: false });
    expect(reverted.reverted).toBe(true);
    await expect(page.locator('#adb-wall')).toBeVisible();
    await expect(page.locator('#adb-backdrop')).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.body).overflowY)).toBe('hidden');
    expect(
      await page.evaluate(() => document.getElementById('adb-wall')!.getAttribute('style')),
    ).toBeNull();
  });

  test('2. small banner: detected as a banner and can be hidden', async ({ context, ext }) => {
    const { page, tabId } = await openFixture(context, ext, 'banner');
    const report = await ext.data<DetectionReport>({ type: 'tab/scan', tabId, trigger: 'manual' });
    const primary = anti(report)!;
    expect(primary.classification).toBe('anti-adblock-banner');
    expect(primary.fixable).toBe(true);
    const outcome = await ext.data<FixOutcome>({
      type: 'tab/applyFix',
      tabId,
      candidateId: primary.id,
      remember: false,
    });
    expect(outcome.applied).toBe(true);
    await expect(page.locator('#adblock-notice')).toBeHidden();
    expect(outcome.verified.scrollRestored).toBeNull();
  });

  test('3. dynamic overlay: not present before insertion, detected after', async ({
    context,
    ext,
  }) => {
    const { page, tabId } = await openFixture(context, ext, 'dynamic-overlay');
    const before = await ext.data<DetectionReport>({ type: 'tab/scan', tabId, trigger: 'manual' });
    expect(before.level).toBe('none');
    await page.waitForFunction(
      () => (window as unknown as { __wallInserted?: boolean }).__wallInserted === true,
    );
    const after = await ext.data<DetectionReport>({ type: 'tab/scan', tabId, trigger: 'manual' });
    expect(after.level).toBe('high');
    expect(anti(after)!.fixable).toBe(true);
  });
});

test.describe('ordinary page elements are never treated as anti-adblock warnings', () => {
  const cases: [string, string, string][] = [
    ['4. ordinary modal', 'ordinary-modal', '#newsletter'],
    ['5. cookie consent', 'cookie-consent', '#consent'],
    ['6. login dialog', 'login-dialog', '#login'],
    ['7. subscription prompt', 'subscription', '#paywall'],
    ['9. normal website', 'normal', '#article-text'],
    ['10. false-positive phrases', 'false-positive', '#article-text'],
  ];
  for (const [title, name, selector] of cases) {
    test(`${title}: no anti-adblock detection and no fix`, async ({ context, ext }) => {
      const { page, tabId } = await openFixture(context, ext, name);
      const report = await ext.data<DetectionReport>({
        type: 'tab/scan',
        tabId,
        trigger: 'manual',
      });
      expect(report.primaryCandidateId).toBeNull();
      expect(report.level).toBe('none');
      expect(report.candidates.every((c) => !c.fixable)).toBe(true);
      for (const c of report.candidates) {
        const res = await ext.send({
          type: 'tab/applyFix',
          tabId,
          candidateId: c.id,
          remember: false,
        });
        expect(res.ok).toBe(false);
      }
      await expect(page.locator(selector)).toBeVisible();
      expect(await ext.badge(tabId)).toBe('');
    });
  }

  test('ordinary dialogs are recognised and reported as left alone', async ({ context, ext }) => {
    for (const name of ['ordinary-modal', 'cookie-consent', 'login-dialog']) {
      const { tabId } = await openFixture(context, ext, name);
      const report = await ext.data<DetectionReport>({
        type: 'tab/scan',
        tabId,
        trigger: 'manual',
      });
      expect(report.ordinaryDialogs, name).toBeGreaterThan(0);
    }
  });
});

test('8. video player error: detected as a warning but no cosmetic fix is offered', async ({
  context,
  ext,
}) => {
  const { page, tabId } = await openFixture(context, ext, 'video-error');
  await page.waitForFunction(
    () => (document.getElementById('vid') as HTMLVideoElement).error !== null,
  );
  const report = await ext.data<DetectionReport>({ type: 'tab/scan', tabId, trigger: 'manual' });
  expect(report.page.videoErrors).toBe(1);
  const primary = anti(report);
  expect(primary).not.toBeNull();
  expect(primary!.classification).toBe('anti-adblock-inline');
  expect(['possible', 'likely']).toContain(report.level);
  expect(primary!.fixable).toBe(false);
});

test('unsupported pages are reported, not scanned', async ({ ext }) => {
  const tabId = await ext.page.evaluate(async () => (await chrome.tabs.getCurrent())!.id!);
  const res = await ext.send({ type: 'tab/scan', tabId, trigger: 'manual' });
  expect(res).toMatchObject({ ok: false, error: { code: 'unsupported-page' } });
});
