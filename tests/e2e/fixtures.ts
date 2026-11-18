import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { resolve } from 'node:path';
import type { Envelope } from '../../src/shared/envelope';

export const FIXTURES = 'http://127.0.0.1:4173';
export const fixture = (name: string) => `${FIXTURES}/${name}.html`;

interface ExtensionFixtures {
  context: BrowserContext;
  extensionId: string;
  ext: ExtensionClient;
}

export class ExtensionClient {
  constructor(
    readonly page: Page,
    readonly extensionId: string,
  ) {}

  async send<T = unknown>(message: Record<string, unknown>): Promise<Envelope<T>> {
    return this.page.evaluate((m) => chrome.runtime.sendMessage(m), message) as Promise<
      Envelope<T>
    >;
  }

  async data<T = unknown>(message: Record<string, unknown>): Promise<T> {
    const res = await this.send<T>(message);
    if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
    return res.data;
  }

  async tabIdFor(url: string): Promise<number> {
    const id = await this.page.evaluate(async (u) => {
      const tabs = await chrome.tabs.query({ url: u });
      return tabs[0]?.id ?? null;
    }, url);
    if (id === null) throw new Error(`No tab for ${url}`);
    return id;
  }

  async badge(tabId: number): Promise<string> {
    return this.page.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), tabId);
  }
}

export const test = base.extend<ExtensionFixtures>({
  context: async ({}, use, testInfo) => {
    const extensionPath = resolve('dist-e2e');
    const executablePath = testInfo.project.use.launchOptions?.executablePath;
    const context = await chromium.launchPersistentContext('', {
      channel: executablePath ? undefined : 'chromium',
      executablePath,
      headless: !(executablePath && process.env.BRAVE_HEADED === '1'),
      viewport: { width: 1280, height: 800 },
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    worker ??= await context.waitForEvent('serviceworker', { timeout: 15_000 });
    await use(new URL(worker.url()).host);
  },
  ext: async ({ context, extensionId }, use) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/dashboard.html#/about`);
    await use(new ExtensionClient(page, extensionId));
  },
});

export { expect } from '@playwright/test';

export async function openFixture(context: BrowserContext, ext: ExtensionClient, name: string) {
  const page = await context.newPage();
  await page.goto(fixture(name));
  await page.waitForLoadState('load');
  const tabId = await ext.tabIdFor(fixture(name));
  return { page, tabId };
}
