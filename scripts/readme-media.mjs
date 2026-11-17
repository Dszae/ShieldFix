#!/usr/bin/env node
/**
 * Generates the README media in docs/images/ from the real extension (E2E build):
 *   demo.gif            popup flow: detect -> review -> apply -> scroll
 *   auto-detect.gif     watched site: warning appears, in-page notice, one-click hide
 *   *.png               popup, dashboard, before/after, banner (also used as social preview)
 *
 * Pages are the local test fixtures, served under the reserved example.com domain via
 * Chromium's host resolver rules. Requires ffmpeg on PATH for the GIFs.
 *
 *   npm run build:e2e && node scripts/readme-media.mjs
 */
import { execFileSync, spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'docs/images');
const work = resolve(root, 'test-results/media');
const ext = resolve(root, 'dist-e2e');
const PORT = 4173;
const site = (host, page) => `http://${host}.example.com:${PORT}/${page}.html`;

/* ----------------------------------------------------------------- server */
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
  for (let i = 0; i < 50 && !(await up()); i++) await new Promise((r) => setTimeout(r, 100));
}

await rm(work, { recursive: true, force: true });
await mkdir(work, { recursive: true });
await mkdir(out, { recursive: true });

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  headless: true,
  deviceScaleFactor: 1,
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: join(work, 'video'), size: { width: 1280, height: 800 } },
  args: [
    `--disable-extensions-except=${ext}`,
    `--load-extension=${ext}`,
    '--host-resolver-rules=MAP *.example.com 127.0.0.1',
  ],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const icon = `data:image/png;base64,${(await readFile(resolve(root, 'public/icons/icon-32.png'))).toString('base64')}`;

  /* ------------------------------------------------- 1. demo.gif (popup) */
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 751 });
  const demoUrl = site('news', 'fullscreen-modal');
  await page.goto(demoUrl);
  const tabId = await tabIdOf(demoUrl);
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 368, height: 620 });
  const stage = await context.newPage();
  await stage.setViewportSize({ width: 1280, height: 800 });
  await stage.setContent(`<!doctype html><html><body style="margin:0;width:1280px;height:800px;overflow:hidden;background:#fff;font:13px system-ui,sans-serif">
    <div style="position:absolute;inset:0 0 auto 0;height:48px;background:#f1f3f4;border-bottom:1px solid #d5d8dc;display:flex;align-items:center;gap:14px;padding:0 16px;box-sizing:border-box">
      <span style="display:flex;gap:7px"><i style="width:12px;height:12px;border-radius:50%;background:#ff5f57"></i><i style="width:12px;height:12px;border-radius:50%;background:#febc2e"></i><i style="width:12px;height:12px;border-radius:50%;background:#28c840"></i></span>
      <span style="color:#80868b;font-size:18px;letter-spacing:6px">‹ › ⟳</span>
      <span style="flex:1;height:32px;border-radius:16px;background:#fff;border:1px solid #dadce0;display:flex;align-items:center;padding:0 14px;color:#3c4043;gap:8px">
        <span style="color:#5f6368">🔒</span><b style="font-weight:500">news.example.com</b><span style="color:#80868b">/city-council-approves-new-park</span></span>
      <span style="position:relative;width:32px;height:32px;display:grid;place-items:center;border-radius:8px" id="ext">
        <img src="${icon}" width="20" height="20"><b id="badge" style="display:none;position:absolute;right:-2px;bottom:-1px;font:700 10px system-ui;color:#fff;border-radius:6px;padding:1px 4px"></b></span>
    </div>
    <img id="page" style="position:absolute;top:49px;left:0;width:1280px;height:751px">
    <img id="popup" style="position:absolute;top:46px;left:900px;width:368px;border-radius:10px;box-shadow:0 18px 50px rgba(0,0,0,.28),0 2px 8px rgba(0,0,0,.12);display:none">
    <div id="ripple" style="position:absolute;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;background:rgba(15,118,110,.35);display:none"></div>
    <svg id="cursor" width="24" height="24" viewBox="0 0 24 24" style="position:absolute;left:640px;top:520px;filter:drop-shadow(0 1px 1px rgba(0,0,0,.35))">
      <path d="M3 2l7.5 19 2.6-7.6L21 10.8z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>
  </body></html>`);

  const frames = [];
  let n = 0;
  let cursor = { x: 640, y: 520 };
  const shot = async (p, locator) =>
    `data:image/png;base64,${(await (locator ?? p).screenshot()).toString('base64')}`;
  const set = (state) =>
    stage.evaluate((s) => {
      const $ = (id) => document.getElementById(id);
      if (s.page) $('page').src = s.page;
      if (s.popup !== undefined) {
        $('popup').style.display = s.popup ? 'block' : 'none';
        if (s.popup) $('popup').src = s.popup;
      }
      if (s.cursor)
        Object.assign($('cursor').style, { left: `${s.cursor.x}px`, top: `${s.cursor.y}px` });
      $('ripple').style.display = s.click ? 'block' : 'none';
      if (s.click)
        Object.assign($('ripple').style, {
          left: `${s.cursor.x + 3}px`,
          top: `${s.cursor.y + 3}px`,
        });
      if (s.badge !== undefined) {
        const b = $('badge');
        b.style.display = s.badge ? 'block' : 'none';
        b.textContent = s.badge ?? '';
        b.style.background = s.badge === '✓' ? '#15803D' : '#C2410C';
      }
      return Promise.all(Array.from(document.images).map((i) => i.decode().catch(() => null)));
    }, state);
  const frame = async (duration) => {
    const file = join(work, `f${String(++n).padStart(4, '0')}.png`);
    await stage.screenshot({ path: file });
    frames.push({ file, duration });
  };
  const move = async (to, steps = 12) => {
    const from = cursor;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      cursor = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
      await set({ cursor });
      await frame(0.04);
    }
  };
  const click = async () => {
    await set({ cursor, click: true });
    await frame(0.12);
    await set({ cursor, click: false });
  };
  const POPUP_X = 900;
  const POPUP_Y = 46;
  const center = async (locator) => {
    const b = await locator.boundingBox();
    return { x: POPUP_X + b.x + b.width / 2 - 4, y: POPUP_Y + b.y + b.height / 2 - 4 };
  };
  const popupRoot = popup.locator('#root');

  await set({ page: await shot(page), cursor, popup: null });
  await frame(1.4);
  await move({ x: 1241, y: 20 }, 16);
  await click();
  await popup.goto(extUrl(`popup.html?tabId=${tabId}`));
  await popup.getByText('Action required').waitFor();
  await sleep(450);
  await set({ popup: await shot(popup, popupRoot), badge: '!' });
  await frame(2.2);

  const review = popup.getByRole('button', { name: 'Review suggested fix' });
  await move(await center(review));
  await click();
  await review.click();
  await popup.getByRole('button', { name: 'Apply reversible fix' }).waitFor();
  await sleep(350);
  await set({ popup: await shot(popup, popupRoot) });
  await frame(2.6);

  const apply = popup.getByRole('button', { name: 'Apply reversible fix' });
  await move(await center(apply));
  await click();
  await apply.click();
  await popup.getByLabel('Page status').getByText('Fix applied', { exact: true }).waitFor();
  await sleep(450);
  await set({ popup: await shot(popup, popupRoot), page: await shot(page), badge: '✓' });
  await frame(2.6);

  await move({ x: 520, y: 430 }, 14);
  await set({ popup: null });
  await frame(0.5);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 45);
    await sleep(40);
    await set({ page: await shot(page) });
    await frame(0.06);
  }
  await frame(1.8);

  const list = frames
    .map((f) => `file '${f.file.replace(/\\/g, '/')}'\nduration ${f.duration}`)
    .join('\n');
  await writeFile(
    join(work, 'demo.txt'),
    `${list}\nfile '${frames.at(-1).file.replace(/\\/g, '/')}'\n`,
  );
  const gif = (input, output, extra = []) =>
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        ...input,
        '-vf',
        'fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle',
        ...extra,
        '-loop',
        '0',
        output,
      ],
      { stdio: 'inherit' },
    );
  gif(['-f', 'concat', '-safe', '0', '-i', join(work, 'demo.txt')], join(out, 'demo.gif'));

  // Before / after stills from the same page.
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(150);
  const after = await page.screenshot();
  await send({ type: 'tab/revertFix', tabId, forget: false });
  await sleep(150);
  const before = await page.screenshot();
  await stage.setViewportSize({ width: 1280, height: 440 });
  await stage.setContent(`<!doctype html><body style="margin:0;background:#0b1f1d;font:600 15px system-ui;color:#e6fffb;display:flex;gap:16px;padding:16px;box-sizing:border-box;width:1280px;height:440px">
    ${[
      ['Before — the site blocks the article', before],
      ['After — one click, fully reversible', after],
    ]
      .map(
        ([
          label,
          buf,
        ]) => `<figure style="margin:0;flex:1"><figcaption style="margin:0 0 10px 2px">${label}</figcaption>
      <img style="width:100%;border-radius:10px;display:block" src="data:image/png;base64,${buf.toString('base64')}"></figure>`,
      )
      .join('')}</body>`);
  await sleep(200);
  await stage.screenshot({ path: join(out, 'before-after.png') });

  /* ------------------------------------- 2. auto-detect.gif (monitoring) */
  await send({ type: 'site/update', hostname: 'recipes.example.com', patch: { monitor: true } });
  await send({ type: 'monitoring/sync' });
  const live = await context.newPage();
  await live.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      c.setAttribute('width', '24');
      c.setAttribute('height', '24');
      c.setAttribute('viewBox', '0 0 24 24');
      c.setAttribute(
        'style',
        'position:fixed;left:640px;top:420px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 1px 1px rgba(0,0,0,.35))',
      );
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M3 2l7.5 19 2.6-7.6L21 10.8z');
      p.setAttribute('fill', '#111');
      p.setAttribute('stroke', '#fff');
      p.setAttribute('stroke-width', '1.6');
      c.appendChild(p);
      document.documentElement.appendChild(c);
      addEventListener(
        'mousemove',
        (e) => Object.assign(c.style, { left: `${e.clientX}px`, top: `${e.clientY}px` }),
        true,
      );
    });
  });
  await live.goto(site('recipes', 'dynamic-overlay'));
  await live.mouse.move(640, 420);
  const notice = live.locator('shieldfix-notice');
  await notice.getByRole('button', { name: 'Hide warning' }).waitFor({ timeout: 15_000 });
  await sleep(1600);
  const btn = await notice.getByRole('button', { name: 'Hide warning' }).boundingBox();
  await live.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2, { steps: 25 });
  await sleep(300);
  await live.mouse.click(btn.x + btn.width / 2, btn.y + btn.height / 2);
  await notice.getByText('Warning hidden').waitFor();
  await sleep(1800);
  await live.screenshot({ path: join(out, 'in-page-notice.png') });
  await live.mouse.move(640, 400, { steps: 15 });
  await live.mouse.wheel(0, 260);
  await sleep(1500);
  const liveVideo = live.video();
  await live.close();
  const webm = await liveVideo.path();
  // Skip the blank frames recorded before the first paint.
  gif(['-ss', '0.6', '-i', webm], join(out, 'auto-detect.gif'));

  /* ----------------------------------------- 3. data for dashboard shots */
  for (const [host, name] of [
    ['tech', 'banner'],
    ['video', 'video-error'],
    ['shop', 'cookie-consent'],
    ['news', 'fullscreen-modal'],
  ]) {
    const p = await context.newPage();
    await p.goto(site(host, name));
    await sleep(name === 'video-error' ? 400 : 100);
    const t = await tabIdOf(site(host, name));
    const report = await send({ type: 'tab/scan', tabId: t, trigger: 'manual' });
    if (host === 'news' && report.ok && report.data.primaryCandidateId) {
      await send({
        type: 'tab/applyFix',
        tabId: t,
        candidateId: report.data.primaryCandidateId,
        remember: true,
      });
    }
    await p.close();
  }
  // A rule arriving through the real import path (validated, disabled, marked "Imported").
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

  /* ----------------------------------------------------- 4. screenshots */
  const popupShot = async (url, file, prepare) => {
    const p = await context.newPage();
    await p.setViewportSize({ width: 368, height: 640 });
    await p.goto(url);
    if (prepare) await prepare(p);
    await sleep(450);
    await p.locator('#root').screenshot({ path: join(out, file) });
    await p.close();
  };
  await page.reload();
  await sleep(300);
  await send({ type: 'tab/revertFix', tabId, forget: true });
  await page.reload();
  await sleep(300);
  for (const theme of ['light', 'dark']) {
    await send({ type: 'settings/update', patch: { theme } });
    await popupShot(extUrl(`popup.html?tabId=${tabId}`), `popup-${theme}.png`, (p) =>
      p.getByText('Action required').waitFor(),
    );
  }
  await send({ type: 'settings/update', patch: { theme: 'light', developerMode: true } });
  await popupShot(extUrl(`popup.html?tabId=${tabId}`), 'popup-review.png', async (p) => {
    await p.getByRole('button', { name: 'Review suggested fix' }).click();
    await p.getByRole('button', { name: 'Apply reversible fix' }).waitFor();
  });
  await popupShot(extUrl(`popup.html?tabId=${tabId}`), 'popup-diagnosis.png', async (p) => {
    await p.getByRole('button', { name: 'Diagnose' }).click();
    await p.getByRole('heading', { name: 'Diagnosis' }).waitFor();
  });
  await send({ type: 'settings/update', patch: { developerMode: false } });
  // The popup shots above undid the saved fix; re-enable its rule for the dashboard shots.
  const rules = await send({ type: 'rules/list' });
  for (const r of rules.data.filter((x) => x.domain === 'news.example.com')) {
    await send({ type: 'rules/setEnabled', id: r.id, enabled: true });
  }

  await helper.setViewportSize({ width: 1280, height: 760 });
  for (const [section, theme] of [
    ['overview', 'light'],
    ['overview', 'dark'],
    ['rules', 'light'],
    ['sites', 'light'],
    ['privacy', 'dark'],
  ]) {
    await send({ type: 'settings/update', patch: { theme } });
    await helper.goto(extUrl(`dashboard.html#/${section}`));
    await sleep(500);
    await helper.screenshot({ path: join(out, `dashboard-${section}-${theme}.png`) });
  }

  /* ------------------------------------------------- 5. banner (1280x640) */
  await send({ type: 'settings/update', patch: { theme: 'dark' } });
  const darkPopup = await readFile(join(out, 'popup-dark.png'));
  const logo = (await readFile(resolve(root, 'public/icons/icon-128.png'))).toString('base64');
  await stage.setViewportSize({ width: 1280, height: 640 });
  await stage.setContent(`<!doctype html><body style="margin:0;width:1280px;height:640px;overflow:hidden;background:#071a18;font-family:system-ui,'Segoe UI',sans-serif;color:#e6fffb;position:relative">
    <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(94,234,212,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(94,234,212,.06) 1px,transparent 1px);background-size:40px 40px"></div>
    <div style="position:absolute;left:84px;top:150px;width:640px">
      <div style="display:flex;align-items:center;gap:18px"><img src="data:image/png;base64,${logo}" width="72" height="72" style="border-radius:16px">
        <span style="font-size:58px;font-weight:700;letter-spacing:-1.5px">ShieldFix</span></div>
      <p style="font-size:30px;line-height:1.25;font-weight:600;margin:34px 0 14px;letter-spacing:-.4px">Keep Brave Shields up.<br>Keep websites working.</p>
      <p style="font-size:19px;line-height:1.5;color:#9fd8cf;margin:0 0 30px">Detects “ad blocker detected” walls and fixes them with one reversible click — without turning your protection off.</p>
      <div style="display:flex;gap:10px;font-size:15px;font-weight:600">${[
        '100% local',
        'No tracking',
        'Reversible',
        'Open source',
      ]
        .map(
          (t) =>
            `<span style="padding:7px 14px;border-radius:999px;border:1px solid rgba(94,234,212,.35);color:#7ff0de">${t}</span>`,
        )
        .join('')}</div>
    </div>
    <img src="data:image/png;base64,${darkPopup.toString('base64')}" style="position:absolute;right:96px;top:60px;width:368px;border-radius:14px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(94,234,212,.18)">
  </body>`);
  await sleep(300);
  await stage.screenshot({ path: join(out, 'banner.png') });
  console.log(`README media written to ${out}`);
} finally {
  await context.close();
  server?.kill();
}
