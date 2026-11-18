#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'store-assets');
const ext = resolve(root, 'dist-e2e');
const PORT = 4173;
const site = (host, page) => `http://${host}.example.com:${PORT}/${page}.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function up() {
  try {
    return (await fetch(`http://127.0.0.1:${PORT}/health`)).ok;
  } catch {
    return false;
  }
}
let server = null;
if (!(await up())) {
  server = spawn(process.execPath, [resolve(root, 'tests/e2e/server.mjs')], { stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await up()); i++) await sleep(100);
}

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  deviceScaleFactor: 1,
  viewport: { width: 1280, height: 800 },
  args: [
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    '--host-resolver-rules=MAP *.example.com 127.0.0.1',
  ],
});

const b64 = (buf) => `data:image/png;base64,${buf.toString('base64')}`;
const icon32 = b64(await readFile(resolve(root, 'public/icons/icon-32.png')));
const icon128 = b64(await readFile(resolve(root, 'public/icons/icon-128.png')));

function windowHtml({ host, path, page, popup, badge }) {
  const badgeHtml = badge
    ? `<b style="position:absolute;right:-2px;bottom:-1px;font:700 10px system-ui;color:#fff;border-radius:6px;padding:1px 4px;background:${badge === '✓' ? '#15803D' : '#C2410C'}">${badge}</b>`
    : '';
  return `<!doctype html><body style="margin:0;width:1280px;height:800px;overflow:hidden;background:#fff;font:13px system-ui,sans-serif">
    <div style="position:absolute;inset:0 0 auto 0;height:48px;background:#f1f3f4;border-bottom:1px solid #d5d8dc;display:flex;align-items:center;gap:14px;padding:0 16px;box-sizing:border-box">
      <span style="display:flex;gap:7px"><i style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></i><i style="width:12px;height:12px;border-radius:50%;background:#febc2e"></i><i style="width:12px;height:12px;border-radius:50%;background:#28c840"></i></span>
      <span style="color:#80868b;font-size:18px;letter-spacing:6px">‹ › ⟳</span>
      <span style="flex:1;height:32px;border-radius:16px;background:#fff;border:1px solid #dadce0;display:flex;align-items:center;padding:0 14px;color:#3c4043;gap:8px">
        <span>🔒</span><b style="font-weight:500">${host}</b><span style="color:#80868b">${path}</span></span>
      <span style="position:relative;width:32px;height:32px;display:grid;place-items:center"><img src="${icon32}" width="20" height="20">${badgeHtml}</span>
    </div>
    <img src="${page}" style="position:absolute;top:49px;left:0;width:1280px;height:751px">
    ${popup ? `<img src="${popup}" style="position:absolute;top:46px;left:900px;width:368px;border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.28),0 2px 8px rgba(0,0,0,.12)">` : ''}
  </body>`;
}

try {
  let [worker] = context.serviceWorkers();
  worker ??= await context.waitForEvent('serviceworker');
  const id = new URL(worker.url()).host;
  const extUrl = (p) => `chrome-extension://${id}/${p}`;
  const helper = await context.newPage();
  await helper.goto(extUrl('dashboard.html#/about'));
  const send = (m) => helper.evaluate((msg) => chrome.runtime.sendMessage(msg), m);
  const tabIdOf = (url) =>
    helper.evaluate(async (u) => (await chrome.tabs.query({ url: u }))[0].id, url);
  await send({ type: 'onboarding/complete' });
  await send({ type: 'settings/update', patch: { theme: 'light' } });

  const stage = await context.newPage();
  const render = async (html, file, size = { width: 1280, height: 800 }) => {
    await stage.setViewportSize(size);
    await stage.setContent(html);
    await stage.evaluate(() => Promise.all(Array.from(document.images).map((i) => i.decode())));
    await stage.screenshot({ path: join(out, file) });
  };

  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 751 });
  const url = site('news', 'fullscreen-modal');
  await page.goto(url);
  const tabId = await tabIdOf(url);
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 368, height: 620 });
  const popupShot = async () => b64(await popup.locator('#root').screenshot());
  const win = { host: 'news.example.com', path: '/city-council-approves-new-park' };

  await popup.goto(extUrl(`popup.html?tabId=${tabId}`));
  await popup.getByText('Action required').waitFor();
  await sleep(450);
  const blocked = b64(await page.screenshot());
  await render(
    windowHtml({ ...win, page: blocked, popup: await popupShot(), badge: '!' }),
    'screenshot-1.png',
  );

  await popup.getByRole('button', { name: 'Review suggested fix' }).click();
  await popup.getByRole('button', { name: 'Apply reversible fix' }).waitFor();
  await sleep(350);
  await render(
    windowHtml({ ...win, page: blocked, popup: await popupShot(), badge: '!' }),
    'screenshot-2.png',
  );

  await popup.getByRole('button', { name: 'Apply reversible fix' }).click();
  await popup.getByLabel('Page status').getByText('Fix applied', { exact: true }).waitFor();
  await sleep(450);
  await render(
    windowHtml({
      ...win,
      page: b64(await page.screenshot()),
      popup: await popupShot(),
      badge: '✓',
    }),
    'screenshot-3.png',
  );

  await send({ type: 'site/update', hostname: 'recipes.example.com', patch: { monitor: true } });
  await send({ type: 'monitoring/sync' });
  const live = await context.newPage();
  await live.setViewportSize({ width: 1280, height: 751 });
  await live.goto(site('recipes', 'dynamic-overlay'));
  await live
    .locator('shieldfix-notice')
    .getByRole('button', { name: 'Hide warning' })
    .waitFor({ timeout: 15_000 });
  await sleep(500);
  await render(
    windowHtml({
      host: 'recipes.example.com',
      path: '/weeknight-lemon-pasta',
      page: b64(await live.screenshot()),
      badge: '!',
    }),
    'screenshot-4.png',
  );

  await send({
    type: 'rules/import',
    payload: {
      format: 'shieldfix-rules',
      formatVersion: 1,
      rules: [
        {
          domain: 'video.example.com',
          selector: '.player-error',
          ruleType: 'cosmetic-hide',
          description: "Hides the player's ad-blocker message.",
        },
      ],
    },
  });
  await helper.setViewportSize({ width: 1280, height: 800 });
  await helper.goto(extUrl('dashboard.html#/rules'));
  await sleep(500);
  await helper.screenshot({ path: join(out, 'screenshot-5.png') });

  await send({ type: 'settings/update', patch: { theme: 'dark' } });
  await popup.goto(extUrl(`popup.html?tabId=${tabId}`));
  await popup.getByLabel('Page status').getByText('Fix applied', { exact: true }).waitFor();
  await sleep(450);
  const darkPopup = await popupShot();
  const grid =
    'background-image:linear-gradient(rgba(94,234,212,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(94,234,212,.06) 1px,transparent 1px);background-size:40px 40px';
  await render(
    `<!doctype html><body style="margin:0;width:440px;height:280px;overflow:hidden;background:#071a18;${grid};font-family:system-ui,'Segoe UI',sans-serif;color:#e6fffb;display:flex;flex-direction:column;justify-content:center;padding:0 34px;box-sizing:border-box">
      <div style="display:flex;align-items:center;gap:12px"><img src="${icon128}" width="48" height="48" style="border-radius:11px"><b style="font-size:34px;letter-spacing:-.8px">ShieldFix</b></div>
      <p style="margin:18px 0 0;font-size:21px;font-weight:600;line-height:1.25;letter-spacing:-.2px">Fix “Ad blocker detected” walls.<br><span style="color:#7ff0de">Keep your Shields up.</span></p>
    </body>`,
    'promo-small.png',
    { width: 440, height: 280 },
  );
  await render(
    `<!doctype html><body style="margin:0;width:1400px;height:560px;overflow:hidden;background:#071a18;${grid};font-family:system-ui,'Segoe UI',sans-serif;color:#e6fffb;position:relative">
      <div style="position:absolute;left:90px;top:120px;width:700px">
        <div style="display:flex;align-items:center;gap:16px"><img src="${icon128}" width="64" height="64" style="border-radius:14px"><b style="font-size:52px;letter-spacing:-1.4px">ShieldFix</b></div>
        <p style="font-size:32px;font-weight:600;line-height:1.25;margin:30px 0 12px;letter-spacing:-.4px">Fix “Ad blocker detected” walls<br>without turning your protection off.</p>
        <p style="font-size:20px;color:#9fd8cf;margin:0">One reversible click · 100% local · No tracking</p>
      </div>
      <img src="${darkPopup}" style="position:absolute;right:110px;top:40px;width:368px;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(94,234,212,.18)">
    </body>`,
    'promo-marquee.png',
    { width: 1400, height: 560 },
  );
  console.log(`Store assets written to ${out}`);
} finally {
  await context.close();
  server?.kill();
}
