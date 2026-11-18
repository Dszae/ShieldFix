#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const e2e = args.has('--e2e');
const watch = args.has('--watch');
const outDir = resolve(root, e2e ? 'dist-e2e' : 'dist');
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

const shared = {
  configFile: false,
  root,
  logLevel: 'warn',
  mode: 'production',
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
};

const common = {
  outDir,
  emptyOutDir: false,
  target: 'chrome120',
  minify: true,
  sourcemap: false,
  reportCompressedSize: false,
  modulePreload: false,
  watch: watch ? {} : null,
};

async function buildPages() {
  await build({
    ...shared,
    root: resolve(root, 'src/ui'),
    publicDir: resolve(root, 'public'),
    base: './',
    plugins: [react(), tailwindcss()],
    build: {
      ...common,
      rolldownOptions: {
        input: {
          popup: resolve(root, 'src/ui/popup.html'),
          dashboard: resolve(root, 'src/ui/dashboard.html'),
        },
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/shared-[hash].js',
          assetFileNames: (info) =>
            (info.names?.[0] ?? '').endsWith('.css')
              ? 'assets/styles-[hash][extname]'
              : 'assets/[name]-[hash][extname]',
        },
      },
    },
  });
}

async function buildScript(entry, fileName, format) {
  await build({
    ...shared,
    publicDir: false,
    build: {
      ...common,
      copyPublicDir: false,
      lib: {
        entry: resolve(root, entry),
        formats: [format],
        name: format === 'iife' ? 'ShieldFixContent' : undefined,
        fileName: () => fileName,
      },
    },
  });
}

async function writeManifest() {
  const manifest = JSON.parse(await readFile(resolve(root, 'src/manifest.json'), 'utf8'));
  manifest.version = pkg.version;
  if (e2e) {
    manifest.name = 'ShieldFix (E2E test build)';
    manifest.host_permissions = ['*://127.0.0.1/*', '*://*.example.com/*'];
  }
  await mkdir(outDir, { recursive: true });
  await writeFile(resolve(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

const started = Date.now();
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await buildPages();
await buildScript('src/background/index.ts', 'background.js', 'es');
await buildScript('src/content/index.ts', 'content.js', 'iife');
await writeManifest();
console.log(
  `ShieldFix ${pkg.version} built to ${outDir} in ${Date.now() - started} ms${watch ? ' (watching for changes)' : ''}`,
);
