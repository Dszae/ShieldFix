import { chromium, expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fixture } from './fixtures';

test.describe('release build', () => {
  test('installs cleanly, opens onboarding, and cannot touch pages without the user', async ({}, testInfo) => {
    const extensionPath = resolve('dist');
    const manifest = JSON.parse(readFileSync(resolve(extensionPath, 'manifest.json'), 'utf8'));
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.permissions).toEqual(['storage', 'activeTab', 'scripting']);
    expect(manifest.content_scripts).toBeUndefined();

    const executablePath = testInfo.project.use.launchOptions?.executablePath;
    const context = await chromium.launchPersistentContext('', {
      channel: executablePath ? undefined : 'chromium',
      executablePath,
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    const errors: string[] = [];
    context.on('weberror', (e) => errors.push(e.error().message));
    try {
      let [worker] = context.serviceWorkers();
      worker ??= await context.waitForEvent('serviceworker');
      const id = new URL(worker.url()).host;

      await expect
        .poll(() => context.pages().some((p) => p.url().includes(`${id}/dashboard.html#/welcome`)))
        .toBe(true);

      const page = await context.newPage();
      await page.goto(fixture('fullscreen-modal'));
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${id}/popup.html`);
      const target = await popup.evaluate(async () => {
        const tabs = await chrome.tabs.query({});
        return {
          visibleUrls: tabs.filter((t) => t.url?.startsWith('http')).length,
          ids: tabs.map((t) => t.id!),
        };
      });
      expect(target.visibleUrls).toBe(0);

      for (const tid of target.ids) {
        const res = await popup.evaluate(
          (t) => chrome.runtime.sendMessage({ type: 'tab/scan', tabId: t, trigger: 'manual' }),
          tid,
        );
        expect(res.ok).toBe(false);
      }
      await expect(page.locator('#adb-wall')).toBeVisible();
      expect(await page.locator('shieldfix-notice').count()).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
