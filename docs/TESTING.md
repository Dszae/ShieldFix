# Testing

| Layer                | Tool                  | Command            | Scope                                                                     |
| -------------------- | --------------------- | ------------------ | ------------------------------------------------------------------------- |
| Unit + integration   | Vitest + happy-dom    | `npm test`         | Detection, scoring, safeguards, fixer, rules, storage, router, controller |
| Browser (end-to-end) | Playwright + Chromium | `npm run test:e2e` | The real extension loaded into a browser against fixture pages            |
| Browser in Brave     | Playwright + Brave    | see below          | Same suite in Brave, plus Brave-only checks                               |
| Static checks        | tsc, ESLint, Prettier | `npm run check`    | Types, lint (incl. security rules), formatting, unit tests, build         |

## Unit and integration tests (`tests/unit`)

happy-dom has no layout engine, so detection tests use `FakeLayout` (`tests/unit/helpers/layout.ts`) to assign element
rectangles explicitly; computed styles come from the DOM. Highlights:

- `engine.test.ts` — thresholds, every fixture category, vetoes, rules, app shells, media players, backdrops.
- `fixer.test.ts` — exact restoration of inline styles, re-assertion, idempotence, `inert`.
- `router.test.ts` — background integration with fake gateways: sender checks, injection, history de-duplication,
  remembering/forgetting fixes, monitoring from permission changes, settings regression.
- `controller.test.ts` — content-script flows: stable ids, privacy of reports, auto-apply, undo suppression,
  re-application, notice behaviour.
- `validate.test.ts` — the content script’s validator agrees with the Zod schema.
- `repository.test.ts` — versioning/rollback, history retention and caps, imports, concurrency.

## Browser tests (`tests/e2e`)

`npm run test:e2e` builds `dist/` and `dist-e2e/`, starts the fixture server (`tests/e2e/server.mjs`, 127.0.0.1:4173)
and runs Playwright. Each test gets a fresh browser profile with the extension loaded.

### Fixture pages (`tests/fixtures`)

| #   | Page                            | Expected result                                                                                    |
| --- | ------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | `fullscreen-modal.html`         | High confidence; fix hides wall and backdrop, restores scroll, removes blur; undo restores exactly |
| 2   | `banner.html`                   | Banner detected and hideable; no scroll changes                                                    |
| 3   | `dynamic-overlay.html`          | Nothing before insertion; detected after; caught automatically when watched                        |
| 4   | `ordinary-modal.html`           | Ordinary dialog; no detection, no fix                                                              |
| 5   | `cookie-consent.html`           | Consent dialog; no detection, no fix                                                               |
| 6   | `login-dialog.html`             | Sign-in dialog; no detection, no fix                                                               |
| 7   | `subscription.html`             | Subscription prompt; no detection, no fix                                                          |
| 8   | `video-error.html`              | Warning in a failed video player detected (possible/likely); no cosmetic fix                       |
| 9   | `normal.html`                   | No detection                                                                                       |
| 10  | `false-positive.html`           | Article quoting warning phrases; no detection                                                      |
| –   | `large-page.html`, `churn.html` | Performance                                                                                        |

For non-warning pages the tests also send forged fix requests for every element ShieldFix saw and assert they are
refused, and that the element stays visible.

### Specs

- `detection.spec.ts` — the ten scenarios above.
- `popup.spec.ts` — scan on open, review/apply/undo, remember + auto-apply after reload, diagnosis, Brave guidance,
  keyboard-only operation, unsupported pages, Brave detection and Shields settings (Brave project only).
- `monitoring.spec.ts` — in-page notice, keyboard dismissal, saved fix applied at load, silence on ordinary pages,
  turning monitoring off.
- `dashboard.spec.ts` — onboarding, navigation semantics, rules (validation, versioning, rollback, toggle, export,
  import, delete), settings persistence and theme, privacy deletion, sites.
- `performance.spec.ts` — scan timing and long tasks under DOM churn.
- `release.spec.ts` — the production `dist/` build: manifest permissions, clean install, onboarding, and no access to
  pages without a toolbar click.

### Running in Brave

```bash
BRAVE_PATH="C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe" npx playwright test --project=brave
# macOS: BRAVE_PATH="/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
# Linux: BRAVE_PATH=/usr/bin/brave-browser
```

Brave runs headless by default; set `BRAVE_HEADED=1` to watch. Each run uses a temporary profile.

### What automation cannot cover

These behaviours depend on browser UI that Playwright cannot drive and were designed around rather than tested
automatically:

- **The toolbar click itself** (and the `activeTab` grant it causes). Tests open `popup.html?tabId=…` in a tab and use
  the E2E build’s 127.0.0.1 host access instead. The release-build test confirms that without that grant ShieldFix
  cannot reach pages.
- **Permission prompts** (`chrome.permissions.request`). Monitoring state is derived from `permissions.onAdded/onRemoved`,
  which is unit-tested; the E2E build’s pre-granted host access exercises the registration path.
- **Brave Shields actually blocking requests.** Fixture pages simulate the _effects_ of blocking (warnings, failed
  video). Real-site behaviour should be checked manually before each release (see [RELEASE.md](RELEASE.md)).
- **`chrome.action.openPopup()`** from the in-page “Details” button; when the browser refuses, the notice tells the
  user to click the toolbar button, which is tested via the fallback path.

## Results (2026-11-17, Windows 11)

| Suite                                            | Result                                              |
| ------------------------------------------------ | --------------------------------------------------- |
| Unit + integration (Vitest 5.1)                  | 193 passed                                          |
| Browser, Playwright Chromium (Playwright 1.65.1) | 32 passed, 1 skipped (the Brave-only test)          |
| Browser, Brave 1.99.57                           | 33 passed (incl. release build and Brave-only test) |

### Performance

Measured by `performance.spec.ts` (median of 5 scans per run, headless, one developer laptop). Ranges cover the runs
made on 2026-11-17; expect variation on other hardware.

| Page                          |   Chromium |       Brave |
| ----------------------------- | ---------: | ----------: |
| Normal article                | 0.3–0.6 ms |  0.7–1.1 ms |
| Full-screen anti-adblock wall | 0.5–1.1 ms |  0.4–1.0 ms |
| Large page (~7,000 elements)  | 4.1–4.4 ms | 4.0–10.9 ms |

With monitoring active on a page inserting 200 nodes per second and animating styles, **no long tasks (> 50 ms)** were
recorded over 6 seconds in either browser, in every run.

Not yet measured: memory use over long sessions, and behaviour on heavy real-world sites. Both belong in the manual
release checks until automated.

Bundle sizes (production): content script 45 KB, popup 24 KB + dashboard 51 KB + shared UI chunk 229 KB + CSS 24 KB,
service worker 148 KB (unminified). Release archive: 164 KB.

Budgets asserted in CI are deliberately generous (50 ms / 150 ms) to avoid flakiness on slow runners.
