# Contributing to ShieldFix

Thank you for helping make privacy-focused browsing more compatible! 🛡️

## Ways to help — no code required

- ⭐ **Star the repo** so more privacy-minded people find it.
- 🐞 **Report a [false positive](https://github.com/Dszae/ShieldFix/issues/new?template=false_positive.yml)** or a
  **[missed warning](https://github.com/Dszae/ShieldFix/issues/new?template=missed_warning.yml)** — real-world reports are
  what make detection better.
- 🌍 **Add warning phrases in your language** (see “Improving detection” below).
- 📝 **Improve the docs** — typos, clearer explanations, screenshots.
- 💬 **Answer questions** in [Discussions](https://github.com/Dszae/ShieldFix/discussions).

New here? Look for issues labelled
[good first issue](https://github.com/Dszae/ShieldFix/labels/good%20first%20issue).

## Ground rules

ShieldFix’s principles are non-negotiable and apply to every change:

1. **Privacy first.** No network requests, analytics, telemetry or remote code. Never store URLs or page content.
2. **User control.** Never change a page without explicit approval (or a saved, user-enabled preference). Every change
   must be reversible.
3. **No circumvention of access controls.** Do not add fixes for paywalls, subscription prompts, logins, DRM or consent
   dialogs. These are vetoed by design.
4. **No overstated claims.** UI text must not claim something worked unless it was verified.

## Getting started

```bash
npm install
npx playwright install chromium
npm run check        # typecheck, lint, format check, unit tests, build
npm run test:e2e     # browser tests
```

Load `dist/` as an unpacked extension (`brave://extensions` → Developer mode → Load unpacked) to try changes.
`npm run dev` rebuilds on save; reload the extension afterwards.

## Making changes

- Keep the layers separate: detection and fix logic (`src/detection`, `src/fixer`, `src/compat`) must not import browser
  APIs; browser access goes through `src/background/gateways.ts` or the content-script `Bridge`.
- All data crossing a boundary (messages, storage, imports) is validated with the schemas in `src/shared`.
- The content script must stay small and dependency-free (no Zod, no React). Message validation there lives in
  `src/content/validate.ts` and is kept in sync with `ToContentSchema` by a unit test.
- UI components must be keyboard accessible, labelled, and meet WCAG 2.2 AA contrast in both themes. Respect
  `prefers-reduced-motion`.
- Add or update tests with every behaviour change. Detection changes need both a unit test and, where layout matters, a
  fixture page plus Playwright test.

## Improving detection

When reporting a missed warning or a false positive, please include **only** what is needed: the site’s hostname, what
was shown, and the diagnosis output from the popup (signal list and confidence). Do not include personal information or
screenshots containing it.

When adding signatures:

- Prefer structural signals over new text patterns.
- Every new pattern needs positive **and** negative test cases (see `tests/unit/signatures.test.ts`).
- Re-run the full false-positive suite (`tests/e2e/detection.spec.ts`).

## README media

Screenshots and GIFs in `docs/images/` are generated from the real extension:

```bash
npm run media   # requires ffmpeg on PATH
```

## Commit and pull requests

- Keep pull requests focused, with a clear description of the user-visible effect.
- `npm run check` and `npm run test:e2e` must pass.
- Update `CHANGELOG.md` under “Unreleased” and any affected documentation.
