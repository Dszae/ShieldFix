#!/usr/bin/env node
/**
 * Renders the ShieldFix icon (vector source below) to PNG at every size the
 * manifest needs, using Playwright's Chromium. Run with `npm run icons`.
 * Small sizes use a simplified, heavier mark so they stay legible.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'public/icons');

const ACCENT = '#0F766E';
const SHIELD = 'M64 24 98 36v26c0 22-14.5 38.5-34 46-19.5-7.5-34-24-34-46V36Z';

function svg(size) {
  const small = size <= 32;
  const radius = small ? 26 : 30;
  const stroke = small ? 11 : 8;
  const check = small ? 13 : 9;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128">
    <rect width="128" height="128" rx="${radius}" fill="${ACCENT}"/>
    ${small ? '' : `<path d="${SHIELD}" fill="#ffffff" opacity="0.16"/>`}
    <path d="${SHIELD}" fill="none" stroke="#ffffff" stroke-width="${stroke}" stroke-linejoin="round"/>
    <path d="m48 65 11 11 22-23" fill="none" stroke="#ffffff" stroke-width="${check}" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

await mkdir(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const size of [16, 32, 48, 128]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(size)}</body></html>`,
  );
  await page
    .locator('svg')
    .screenshot({ path: resolve(out, `icon-${size}.png`), omitBackground: true });
}
await browser.close();
console.log(`Icons written to ${out}`);
