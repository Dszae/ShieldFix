import type { AppInfo } from '../../src/shared/messages';
import { expect, fixture, test } from './fixtures';

test.describe('automatic monitoring', () => {
  test.beforeEach(async ({ ext }) => {
    await ext.data({ type: 'site/update', hostname: '127.0.0.1', patch: { monitor: true } });
    const info = await ext.data<AppInfo>({ type: 'monitoring/sync' });
    expect(info.monitoringMode).toBe('selected-sites');
    expect(info.monitoredHosts).toEqual(['127.0.0.1']);
  });

  test('detects a dynamically inserted overlay and offers a fix in the page', async ({
    context,
    ext,
  }) => {
    const page = await context.newPage();
    await page.goto(fixture('dynamic-overlay'));
    const notice = page.locator('shieldfix-notice');
    await expect(notice.getByText('Ad-blocker warning detected')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('#dyn-wall')).toBeVisible(); // nothing changes without approval

    await notice.getByRole('button', { name: 'Hide warning' }).click();
    await expect(page.locator('#dyn-wall')).toBeHidden();
    await expect(notice.getByText('Warning hidden')).toBeVisible();
    const tabId = await ext.tabIdFor(fixture('dynamic-overlay'));
    await expect.poll(() => ext.badge(tabId)).toBe('✓');

    await notice.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#dyn-wall')).toBeVisible();

    const history = await ext.data<{ hostname: string; event: string }[]>({ type: 'history/list' });
    expect(history.map((h) => h.event)).toEqual(
      expect.arrayContaining(['detected', 'fix-applied', 'fix-reverted']),
    );
    expect(history.every((h) => h.hostname === '127.0.0.1')).toBe(true);
    // History holds no URLs or page text.
    expect(JSON.stringify(history)).not.toContain('dynamic-overlay');
    expect(JSON.stringify(history)).not.toContain('adblocker');
  });

  test('the notice can be dismissed with the keyboard', async ({ context }) => {
    const page = await context.newPage();
    await page.goto(fixture('dynamic-overlay'));
    const notice = page.locator('shieldfix-notice');
    await expect(notice.getByText('Ad-blocker warning detected')).toBeVisible({ timeout: 10_000 });
    await notice.getByRole('button', { name: 'Hide warning' }).focus();
    await page.keyboard.press('Escape');
    await expect(notice).toHaveCount(0);
    await expect(page.locator('#dyn-wall')).toBeVisible();
  });

  test('applies a saved fix automatically as the page loads', async ({ context, ext }) => {
    await ext.data({
      type: 'rules/upsert',
      rule: { domain: '127.0.0.1', selector: '#adb-wall', enabled: true },
    });
    const page = await context.newPage();
    await page.goto(fixture('fullscreen-modal'));
    await expect(page.locator('#adb-wall')).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('shieldfix-notice').getByText('Saved fix applied')).toBeVisible();
    const history = await ext.data<{ event: string }[]>({ type: 'history/list' });
    expect(history.map((h) => h.event)).toContain('fix-auto-applied');
  });

  test('stays silent on ordinary pages', async ({ context }) => {
    for (const name of ['cookie-consent', 'login-dialog', 'false-positive']) {
      const page = await context.newPage();
      await page.goto(fixture(name));
      await page.waitForTimeout(1500);
      await expect(page.locator('shieldfix-notice'), name).toHaveCount(0);
      await page.close();
    }
  });

  test('stops when monitoring is turned off', async ({ context, ext }) => {
    await ext.data({ type: 'site/update', hostname: '127.0.0.1', patch: { monitor: false } });
    const info = await ext.data<AppInfo>({ type: 'monitoring/sync' });
    expect(info.monitoringMode).toBe('on-demand');
    const page = await context.newPage();
    await page.goto(fixture('dynamic-overlay'));
    await page.waitForFunction(
      () => (window as unknown as { __wallInserted?: boolean }).__wallInserted === true,
    );
    await page.waitForTimeout(1500);
    await expect(page.locator('shieldfix-notice')).toHaveCount(0);
  });
});
