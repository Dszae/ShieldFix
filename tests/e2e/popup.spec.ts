import { expect, openFixture, test } from './fixtures';

/**
 * The popup is opened as a tab with ?tabId= pointing at the fixture page. In real
 * use the toolbar button opens it and grants activeTab; the E2E build instead has
 * host access to 127.0.0.1 (see docs/TESTING.md).
 */
test.describe('popup', () => {
  test('scans on open, reviews and applies a fix, then undoes it', async ({ context, ext }) => {
    const { page, tabId } = await openFixture(context, ext, 'fullscreen-modal');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${ext.extensionId}/popup.html?tabId=${tabId}`);

    await expect(popup.getByRole('heading', { name: '127.0.0.1' })).toBeVisible();
    await expect(popup.getByLabel('Page status').getByText('Action required')).toBeVisible();
    await expect(popup.getByText(/Confidence \d+%/)).toBeVisible();

    await popup.getByRole('button', { name: 'Review suggested fix' }).click();
    await expect(popup.getByRole('heading', { name: 'Review suggested fix' })).toBeVisible();
    const changes = popup.getByRole('list', { name: 'Proposed changes' });
    await expect(changes.getByText(/Hide the overlay div#adb-wall/)).toBeVisible();
    await expect(changes.getByText(/Restore scrolling/).first()).toBeVisible();
    // Nothing is changed before approval.
    await expect(page.locator('#adb-wall')).toBeVisible();

    await popup.getByRole('button', { name: 'Apply reversible fix' }).click();
    await expect(
      popup.getByRole('status').filter({ hasText: 'The warning is hidden.' }).first(),
    ).toBeVisible();
    await expect(
      popup.getByLabel('Page status').getByText('Fix applied', { exact: true }),
    ).toBeVisible();
    await expect(page.locator('#adb-wall')).toBeHidden();

    await popup.getByRole('button', { name: 'Undo fix' }).click();
    await expect(
      popup.getByRole('status').filter({ hasText: 'The page has been restored' }).first(),
    ).toBeVisible();
    await expect(page.locator('#adb-wall')).toBeVisible();
  });

  test('remembers a fix for the site and applies it automatically after reload', async ({
    context,
    ext,
  }) => {
    const { page, tabId } = await openFixture(context, ext, 'fullscreen-modal');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${ext.extensionId}/popup.html?tabId=${tabId}`);
    await popup.getByRole('button', { name: 'Review suggested fix' }).click();
    await popup.getByLabel('Always apply on 127.0.0.1').check();
    await expect(popup.locator('code', { hasText: '#adb-wall' })).toBeVisible();
    await popup.getByRole('button', { name: 'Apply reversible fix' }).click();
    await expect(page.locator('#adb-wall')).toBeHidden();

    const rules = await ext.data<{ selector: string; enabled: boolean; domain: string }[]>({
      type: 'rules/list',
    });
    expect(rules).toEqual([
      expect.objectContaining({ selector: '#adb-wall', enabled: true, domain: '127.0.0.1' }),
    ]);

    await page.reload();
    await expect(page.locator('#adb-wall')).toBeVisible(); // reload restores the page
    await popup.reload();
    await expect(popup.getByLabel('Page status').getByText('Saved fix applied')).toBeVisible();
    await expect(page.locator('#adb-wall')).toBeHidden();

    // "Undo and stop fixing this site" disables the rule.
    await popup.getByRole('button', { name: 'Undo and stop fixing this site' }).click();
    await expect(page.locator('#adb-wall')).toBeVisible();
    const after = await ext.data<{ enabled: boolean }[]>({ type: 'rules/list' });
    expect(after[0]!.enabled).toBe(false);
  });

  test('shows a calm status and diagnostics on a normal page', async ({ context, ext }) => {
    const { tabId } = await openFixture(context, ext, 'cookie-consent');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${ext.extensionId}/popup.html?tabId=${tabId}`);
    const status = popup.getByLabel('Page status');
    await expect(status.getByText('No issue detected')).toBeVisible();
    await expect(status.getByText(/look like normal website dialogs/)).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Review suggested fix' })).toHaveCount(0);

    await popup.getByRole('button', { name: 'Diagnose' }).click();
    await expect(popup.getByRole('heading', { name: 'Diagnosis' })).toBeVisible();
    await expect(popup.getByText('Not detected')).toBeVisible();
    await expect(popup.getByText('Cookie or consent dialog')).toBeVisible();
    await popup.getByRole('button', { name: 'Back' }).click();
    await expect(popup.getByLabel('Page status').getByText('No issue detected')).toBeVisible();
  });

  test('explains Brave Shields without pretending to change them', async ({ context, ext }) => {
    const { tabId } = await openFixture(context, ext, 'video-error');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${ext.extensionId}/popup.html?tabId=${tabId}`);
    await popup.getByRole('button', { name: 'Brave Shields' }).click();
    await expect(
      popup.getByText(/cannot change (Brave Shields|your ad blocker) for you/),
    ).toBeVisible();
    await expect(popup.getByText(/127\.0\.0\.1/)).toBeVisible();
  });

  test('is fully keyboard operable', async ({ context, ext }) => {
    const { page, tabId } = await openFixture(context, ext, 'banner');
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${ext.extensionId}/popup.html?tabId=${tabId}`);
    await expect(popup.getByRole('button', { name: 'Review suggested fix' })).toBeVisible();
    const target = popup.getByRole('button', { name: 'Review suggested fix' });
    for (
      let i = 0;
      i < 10 && !(await target.evaluate((el) => el === document.activeElement));
      i++
    ) {
      await popup.keyboard.press('Tab');
    }
    await expect(target).toBeFocused();
    await popup.keyboard.press('Enter');
    const apply = popup.getByRole('button', { name: 'Apply reversible fix' });
    await expect(apply).toBeVisible();
    await apply.focus();
    await popup.keyboard.press('Enter');
    await expect(page.locator('#adblock-notice')).toBeHidden();
  });

  test('reports unsupported pages clearly', async ({ context, ext }) => {
    const tabId = await ext.page.evaluate(async () => (await chrome.tabs.getCurrent())!.id!);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${ext.extensionId}/popup.html?tabId=${tabId}`);
    await expect(popup.getByText('ShieldFix can’t run on this page')).toBeVisible();
  });
});

test.describe('Brave integration', () => {
  test('identifies Brave and opens the real Shields settings page', async ({
    context,
    ext,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'brave', 'Brave-only: run with BRAVE_PATH set');
    const isBrave = await ext.page.evaluate(
      () =>
        (navigator as Navigator & { brave?: { isBrave(): Promise<boolean> } }).brave?.isBrave() ??
        false,
    );
    expect(isBrave).toBe(true);

    await ext.page.goto(`chrome-extension://${ext.extensionId}/dashboard.html#/about`);
    await expect(ext.page.getByText('Brave', { exact: true })).toBeVisible();

    const opened = context.waitForEvent('page');
    const res = await ext.data<{ opened: string }>({ type: 'brave/open', page: 'shields' });
    expect(res.opened).toBe('brave://settings/shields');
    const tab = await opened;
    await expect.poll(() => tab.url()).toContain('settings/shields');
  });
});
