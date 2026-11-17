#!/usr/bin/env node
/**
 * Captures store-listing screenshots (1280x800) and UI previews from the real
 * extension (E2E build) using the local fixture pages.
 *
 *   npm run build:e2e && node tests/e2e/server.mjs &   (or let this script start it)
 *   node scripts/store-assets.mjs
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'store-assets');
const ext = resolve(root, 'dist-e2e');
const BASE = 'http://127.0.0.1:4173';

async function serverUp() {
  try {
    return (await fetch(`${BASE}/health`)).ok;
  } catch {
    return false;
  }
}

let server = null;
if (!(await serverUp())) {
  server = spawn(process.execPath, [resolve(root, 'tests/e2e/server.mjs')], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await serverUp()); i++) await new Promise((r) => setTimeout(r, 100));
}

await mkdir(out, { recursive: true });
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
});

try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const extUrl = (p) => `chrome-extension://${id}/${p}`;

  const helper = await context.newPage();
  await helper.goto(extUrl('dashboard.html#/about'));
  const send = (m) => helper.evaluate((msg) => chrome.runtime.sendMessage(msg), m);
  await send({ type: 'onboarding/complete' });

  const page = await context.newPage();
  await page.goto(`${BASE}/fullscreen-modal.html`);
  const tabId = await helper.evaluate(
    async (u) => (await chrome.tabs.query({ url: u }))[0].id,
    `${BASE}/fullscreen-modal.html`,
  );

  // Popup previews in both themes.
  for (const theme of ['light', 'dark']) {
    await send({ type: 'settings/update', patch: { theme } });
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 368, height: 640 });
    await popup.goto(extUrl(`popup.html?tabId=${tabId}`));
    await popup.getByText('Action required').waitFor();
    await popup.waitForTimeout(400); // let enter animations finish
    await popup.screenshot({ path: resolve(out, `popup-detected-${theme}.png`), fullPage: true });
    await popup.getByRole('button', { name: 'Review suggested fix' }).click();
    await popup.getByRole('button', { name: 'Apply reversible fix' }).waitFor();
    await popup.waitForTimeout(300);
    await popup.screenshot({ path: resolve(out, `popup-review-${theme}.png`), fullPage: true });
    await popup.getByRole('button', { name: 'Back' }).click();
    await popup.getByRole('button', { name: 'Diagnose' }).click();
    await popup.getByRole('heading', { name: 'Diagnosis' }).waitFor();
    await popup.waitForTimeout(300);
    await popup.screenshot({ path: resolve(out, `popup-diagnosis-${theme}.png`), fullPage: true });
    await popup.close();
  }

  // Dashboard previews.
  await send({
    type: 'rules/upsert',
    rule: {
      domain: 'news.example.com',
      selector: '#adb-wall',
      enabled: true,
      description: 'Saved from a fix you approved.',
    },
  });
  await send({
    type: 'rules/upsert',
    rule: {
      domain: 'video.example.org',
      selector: '.adblock-overlay',
      ruleType: 'cosmetic-overlay',
      enabled: false,
    },
  });
  for (const theme of ['light', 'dark']) {
    await send({ type: 'settings/update', patch: { theme } });
    for (const section of ['overview', 'rules', 'privacy']) {
      await helper.goto(extUrl(`dashboard.html#/${section}`));
      await helper.waitForTimeout(400);
      await helper.screenshot({ path: resolve(out, `dashboard-${section}-${theme}.png`) });
    }
  }

  // Store screenshot: the page with the popup composited at the toolbar position.
  await send({ type: 'settings/update', patch: { theme: 'light' } });
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 368, height: 560 });
  await popup.goto(extUrl(`popup.html?tabId=${tabId}`));
  await popup.getByText('Action required').waitFor();
  await popup.waitForTimeout(400);
  const shot = (await popup.screenshot({ fullPage: true })).toString('base64');
  await page.bringToFront();
  await page.evaluate((b64) => {
    const img = document.createElement('img');
    img.src = `data:image/png;base64,${b64}`;
    img.setAttribute(
      'style',
      'position:fixed;top:12px;right:16px;z-index:2147483647;border-radius:12px;box-shadow:0 16px 48px rgba(0,0,0,.35);width:368px',
    );
    document.documentElement.appendChild(img);
  }, shot);
  await page.waitForTimeout(300);
  await page.screenshot({ path: resolve(out, 'store-1-detect.png') });
  await helper.goto(extUrl('dashboard.html#/rules'));
  await helper.waitForTimeout(400);
  await helper.screenshot({ path: resolve(out, 'store-2-rules.png') });
  await helper.goto(extUrl('dashboard.html#/privacy'));
  await helper.waitForTimeout(400);
  await helper.screenshot({ path: resolve(out, 'store-3-privacy.png') });
  console.log(`Screenshots written to ${out}`);
} finally {
  await context.close();
  server?.kill();
}
