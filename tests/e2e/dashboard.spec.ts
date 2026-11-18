import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

async function openDashboard(page: Page, extensionId: string, section: string) {
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/${section}`);
}

test.describe('dashboard', () => {
  test('onboarding completes in on-demand mode without requesting permissions', async ({ ext }) => {
    const page = ext.page;
    await openDashboard(page, ext.extensionId, 'welcome');
    await expect(page.getByRole('heading', { name: 'Welcome to ShieldFix' })).toBeVisible();
    await expect(page.getByLabel(/Only when I click ShieldFix/)).toBeChecked();
    await page.getByRole('button', { name: 'Finish setup' }).click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByText('Finish setting up ShieldFix')).toHaveCount(0);
    await expect(page.getByText('On demand', { exact: true })).toBeVisible();
  });

  test('navigation is accessible', async ({ ext }) => {
    const page = ext.page;
    await openDashboard(page, ext.extensionId, 'overview');
    const nav = page.getByRole('navigation', { name: 'Dashboard sections' });
    await nav.getByRole('link', { name: 'Help' }).click();
    await expect(page.getByRole('heading', { name: 'Help & troubleshooting' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Help' })).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveTitle('Help · ShieldFix');
    await page.getByText('What do the confidence levels mean?').click();
    await expect(page.getByText(/90% and above: high confidence/)).toBeVisible();
  });

  test('rules: validate, create, version, roll back, toggle, export, import and delete', async ({
    ext,
  }) => {
    const page = ext.page;
    await openDashboard(page, ext.extensionId, 'rules');
    await expect(page.getByText('No rules yet')).toBeVisible();

    await page.getByRole('button', { name: 'New rule' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'New compatibility rule' });
    await dialog.getByLabel('Domain').fill('news.example.com');
    await dialog.getByLabel('CSS selector').fill('div');
    await dialog.getByRole('button', { name: 'Create rule' }).click();
    await expect(
      dialog.getByText('Each selector must target an element by class, id or attribute.'),
    ).toBeVisible();
    await dialog.getByLabel('CSS selector').fill('body.adblock-active');
    await expect(dialog.getByText('Rules may not target <body> elements.')).toBeVisible();
    await dialog.getByLabel('CSS selector').fill('.adblock-wall');
    await dialog.getByRole('button', { name: 'Create rule' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('.adblock-wall')).toBeVisible();
    await expect(page.getByText('v1', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Edit rule' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit rule' });
    await edit.getByLabel('CSS selector').fill('#adb-overlay');
    await edit.getByRole('button', { name: 'Save new version' }).click();
    await expect(page.getByText('#adb-overlay')).toBeVisible();
    await expect(page.getByText('v2', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Roll back to version 1' }).click();
    await page
      .getByRole('dialog', { name: 'Roll back this rule?' })
      .getByRole('button', { name: 'Roll back' })
      .click();
    await expect(page.getByText('.adblock-wall')).toBeVisible();
    await expect(page.getByText('v1', { exact: true })).toBeVisible();

    const toggle = page.getByRole('switch', { name: 'Enabled' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export' }).click();
    expect((await download).suggestedFilename()).toMatch(
      /^shieldfix-rules-\d{4}-\d{2}-\d{2}\.json$/,
    );

    await page.getByRole('button', { name: 'Import' }).click();
    const imp = page.getByRole('dialog', { name: 'Import rules' });
    await imp.getByLabel('Rules JSON').fill(
      JSON.stringify({
        format: 'shieldfix-rules',
        formatVersion: 1,
        rules: [
          { domain: 'example.org', selector: '.anti-adblock', enabled: true },
          { domain: 'example.org', selector: 'html' },
        ],
      }),
    );
    await imp.getByRole('button', { name: 'Import' }).click();
    await expect(imp.getByText('1 imported, 0 already present')).toBeVisible();
    await expect(
      imp.getByText(/Rule 2: Each selector must target an element by class, id or attribute/),
    ).toBeVisible();
    await imp.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('.anti-adblock')).toBeVisible();
    await expect(page.getByText('Imported', { exact: true })).toBeVisible();
    const imported = await ext.data<{ selector: string; enabled: boolean }[]>({
      type: 'rules/list',
    });
    expect(imported.find((r) => r.selector === '.anti-adblock')!.enabled).toBe(false);

    await page.getByRole('button', { name: 'Delete rule' }).first().click();
    await page
      .getByRole('dialog', { name: 'Delete this rule?' })
      .getByRole('button', { name: 'Delete rule' })
      .click();
    await expect
      .poll(async () => (await ext.data<unknown[]>({ type: 'rules/list' })).length)
      .toBe(1);
  });

  test('settings persist and theme applies', async ({ ext }) => {
    const page = ext.page;
    await openDashboard(page, ext.extensionId, 'settings');
    await page.getByRole('radio', { name: 'Dark' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    const notice = page.getByRole('switch', { name: 'Show a notice on watched sites' });
    await notice.click();
    await expect(notice).toHaveAttribute('aria-checked', 'false');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(
      page.getByRole('switch', { name: 'Show a notice on watched sites' }),
    ).toHaveAttribute('aria-checked', 'false');
  });

  test('privacy: turning history off clears it, and all data can be deleted', async ({
    context,
    ext,
  }) => {
    const page0 = await context.newPage();
    await page0.goto('http://127.0.0.1:4173/fullscreen-modal.html');
    const tabId = await ext.tabIdFor('http://127.0.0.1:4173/fullscreen-modal.html');
    await ext.data({ type: 'tab/scan', tabId, trigger: 'manual' });
    await ext.data({ type: 'settings/update', patch: { theme: 'dark' } });
    expect((await ext.data<unknown[]>({ type: 'history/list' })).length).toBe(1);

    const page = ext.page;
    await openDashboard(page, ext.extensionId, 'history');
    await expect(page.getByText('127.0.0.1')).toBeVisible();
    await openDashboard(page, ext.extensionId, 'privacy');
    await page.getByRole('switch', { name: 'Keep a local history' }).click();
    await expect
      .poll(async () => (await ext.data<unknown[]>({ type: 'history/list' })).length)
      .toBe(0);

    await page.getByRole('button', { name: 'Delete all ShieldFix data' }).click();
    await page
      .getByRole('dialog', { name: 'Delete all ShieldFix data?' })
      .getByRole('button', { name: 'Delete everything' })
      .click();
    await expect
      .poll(async () => (await ext.data<{ theme: string }>({ type: 'settings/get' })).theme)
      .toBe('system');
    expect(await ext.data<unknown[]>({ type: 'sites/list' })).toEqual([]);
  });

  test('sites list shows detected sites and can remove them', async ({ context, ext }) => {
    const p = await context.newPage();
    await p.goto('http://127.0.0.1:4173/banner.html');
    const tabId = await ext.tabIdFor('http://127.0.0.1:4173/banner.html');
    await ext.data({ type: 'tab/scan', tabId, trigger: 'manual' });
    const page = ext.page;
    await openDashboard(page, ext.extensionId, 'sites');
    await expect(page.getByText('127.0.0.1', { exact: true })).toBeVisible();
    await expect(page.getByText(/1 detection/)).toBeVisible();
    await page.getByRole('button', { name: 'Remove 127.0.0.1' }).click();
    await page
      .getByRole('dialog', { name: 'Remove 127.0.0.1?' })
      .getByRole('button', { name: 'Remove site' })
      .click();
    await expect(page.getByText('No sites yet')).toBeVisible();
  });
});
