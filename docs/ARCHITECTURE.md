# Architecture

ShieldFix is a Manifest V3 extension written in TypeScript. Business logic is kept free of browser APIs so it can be
tested in isolation; browser access is confined to thin adapters.

```
 ┌──────────────── extension pages ────────────────┐        ┌──────────── web page (isolated world) ────────────┐
 │ popup.html  ─┐                                   │        │ content.js (IIFE, ~45 KB, no dependencies)          │
 │ dashboard.html ─┤ React + Tailwind (src/ui)     │        │  ContentController                                  │
 │               │  send() ── typed, validated ──┐ │        │   ├─ detection engine  (src/detection)              │
 └───────────────┴───────────────────────────────│─┘        │   ├─ FixSession        (src/fixer)                  │
                                                 ▼          │   ├─ MutationObserver (monitored sites only)        │
 ┌──────────── background.js (service worker, ES module) ───┐│   └─ Notice (shadow DOM)                            │
 │ router.ts   validates every message (Zod) + sender       ││        ▲ cs/* messages      │ content/* messages    │
 │   ├─ Repository (chrome.storage.local, validated)        │└────────│─────────────────────│───────────────────────┘
 │   ├─ TabStateStore (chrome.storage.session)              │         │                     │
 │   ├─ monitoring: registerContentScripts per permission   │◀────────┴─────────────────────┘
 │   └─ gateways.ts: tabs, scripting, permissions, action   │
 └──────────────────────────────────────────────────────────┘
```

## Components

| Component            | Location          | Responsibility                                                                            |
| -------------------- | ----------------- | ----------------------------------------------------------------------------------------- |
| Service worker       | `src/background/` | Lifecycle, message routing, storage coordination, monitoring registration, badge, history |
| Content script       | `src/content/`    | Scanning, mutation observation, applying/reverting fixes, in-page notice                  |
| Detection engine     | `src/detection/`  | Signatures, candidate discovery, scoring, false-positive vetoes, resource analysis        |
| Fixer                | `src/fixer/`      | Fix planning, reversible application, verification, re-assertion, stable selectors        |
| Compatibility engine | `src/compat/`     | Rule creation, versioning, expiry, host matching, import validation, selector safety      |
| Storage              | `src/storage/`    | `StorageArea` abstraction, validated `Repository`, write serialisation                    |
| Shared               | `src/shared/`     | Zod schemas, message protocol, envelopes, domain helpers, constants                       |
| UI                   | `src/ui/`         | Popup, dashboard, design-system components, hooks                                         |

## Message protocol

All messages use `{ type, ...payload }` and responses use an envelope: `{ ok: true, data }` or
`{ ok: false, error: { code, message } }`.

- **UI → background** (`UiRequestSchema`): `tab/state`, `tab/scan`, `tab/previewFix`, `tab/applyFix`, `tab/revertFix`,
  `sites/*`, `site/*`, `history/*`, `rules/*`, `settings/*`, `monitoring/sync`, `app/info`, `onboarding/complete`,
  `data/reset`, `brave/open`. Accepted only when `sender.url` is one of ShieldFix’s own pages.
- **Content → background** (`ContentRequestSchema`): `content/config`, `content/report`, `content/fixEvent`,
  `content/openPopup`. Accepted only from top-level frames; reports must match the sender’s hostname.
- **Background → content** (`ToContentSchema`): `cs/ping`, `cs/scan`, `cs/state`, `cs/previewFix`, `cs/applyFix`,
  `cs/revertFix`, `cs/configChanged`. The content script validates with a dependency-free mirror of the schema
  (`src/content/validate.ts`), checked against the Zod schema by unit tests.

## Detection pipeline

1. **Seeds** — text nodes mentioning ad blocking (bounded walk, 400k characters max), elements with anti-adblock
   class/id fragments, dialogs (`dialog[open]`, `role=dialog`, `aria-modal`), the topmost elements at five viewport
   points (`elementsFromPoint`), vendor signatures and user-enabled rules.
2. **Root resolution** — each seed climbs to the outermost fixed/sticky ancestor that is not an _app shell_ (an
   element containing `main`/`article` or very large content), else a large absolute container, a dialog, or a small
   inline block. Nested roots are merged.
3. **Scoring** — signals add up to a confidence score (capped 0–100):

| Signal                                                           |          Weight |
| ---------------------------------------------------------------- | --------------: |
| Strong warning phrase (first / each extra, max 2)                |          50 / 8 |
| Mention of ad blocking (no strong phrase)                        |              15 |
| Anti-adblock class or id                                         |              20 |
| Vendor signature                                                 |              30 |
| Covers ≥ 60 % of viewport / centred modal / edge banner          |    20 / 12 / 10 |
| z-index ≥ 1000 (positioned)                                      |               5 |
| Page scroll locked (overlays)                                    |              10 |
| Separate dimming backdrop                                        |               6 |
| Page content blurred (overlays)                                  |               5 |
| “I’ve disabled it” style button                                  |               8 |
| Inserted after page load                                         |               5 |
| Shown in a media player / video failed                           |         10 / 10 |
| Negated wording (“we don’t mind ad blockers”)                    |             −40 |
| Consent / subscription / sign-in wording without a strong phrase | −45 / −45 / −40 |
| Age verification                                                 |             −30 |
| Form (2+ fields)                                                 |             −15 |
| Long text (> 1500 chars) / prose inside an article               |       −30 / −30 |

4. **Vetoes** — password, payment, consent (alongside a warning), subscription, age-gate, form and main-content
   elements are never fixable, regardless of score or rules.
5. **Classification** — anti-adblock overlay / banner / inline notice, or consent dialog, sign-in dialog, subscription
   prompt, age gate, ordinary dialog. A warning’s own backdrop is folded into it.

### Confidence scoring

| Confidence | Level    | Behaviour                                         |
| ---------- | -------- | ------------------------------------------------- |
| 0–39 %     | none     | Nothing reported                                  |
| 40–69 %    | possible | Diagnostic only                                   |
| 70–89 %    | likely   | Reported; in-page notice on watched sites; no fix |
| 90–100 %   | high     | Reversible fix offered                            |

The thresholds and weights are initial engineering defaults, tuned so that the fixture suite (realistic walls,
banners, dynamic overlays, consent, login, subscription, ordinary modals, articles quoting warning phrases) is
classified correctly. **They are not measured accuracy rates on real websites**; validating them across a corpus of
real sites is the main open work item.

Page-level issues (no candidate element) can raise the level to _possible_: a failed video while ad resources were
blocked (45 %), or first-party resources that failed to load (40 %, only when load errors were observed directly).

## Fixes

`planFix()` turns a fixable candidate into actions: hide (or close a modal `<dialog>`), hide backdrops, and for overlays
only, restore scrolling (`overflow-y`), release a fixed-position body lock, remove blur, restore pointer events and remove
`inert`. `FixSession`:

- records each property’s previous value and priority before setting `!important` inline styles;
- verifies the warning is actually hidden and rolls back if not (the UI reports failure rather than success);
- re-asserts its own properties when the page undoes them (at most 50 times), using attribute-filtered observers;
- reverts exactly — only the properties it set, so page changes made meanwhile are preserved.

If the page inserts a _new_ warning while a fix is active, the fix is re-applied under the same approval at most
10 times. A user “Undo” suppresses automatic re-application for the rest of the page view.

## Monitoring and performance

On-demand mode (default) injects the content script only after a toolbar click (`activeTab`). Watched sites use a
dynamically registered content script (`scripting.registerContentScripts`) at `document_start`, which:

- records resource `error` events from the start (exact failed-resource data);
- scans once when idle (`requestIdleCallback`), then observes mutations for 120 s of visible time;
- pre-filters mutations cheaply, debounces (350 ms), throttles full scans to one per second and stops after 30;
- disconnects while the tab is hidden.

Measured results are recorded in [TESTING.md](TESTING.md#performance).

## Storage

`chrome.storage.local`: `settings`, `sites` (by hostname), `rules`, `ruleHistory` (≤ 5 previous versions per rule),
`history` (≤ 500 entries, retention 7–365 days), `onboarding`, `schemaVersion`. Every read is validated; invalid records
are dropped individually. Writes go through a mutex to prevent lost updates. `chrome.storage.session` holds the latest
report per tab (cleared on navigation).

## Design decisions and trade-offs

| Decision                                                  | Why / trade-off                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| No host permissions by default                            | Privacy and store policy. Trade-off: warnings are detected only after a toolbar click unless the user watches a site.    |
| Monitoring state derived from granted permissions         | Permission prompts can close the popup; deriving state from `permissions.onAdded/onRemoved` keeps stored state truthful. |
| Inline `!important` styles instead of removing nodes      | Fully reversible and keeps page scripts working. Trade-off: a page can fight back; bounded re-assertion handles it.      |
| Fixes hidden behind ≥ 90 % confidence + vetoes            | Avoids hiding legitimate content. Trade-off: some real warnings are reported without a fix.                              |
| Subscription offers are vetoed even in anti-adblock walls | ShieldFix must not interfere with paid access. Trade-off: “disable adblock or subscribe” walls need a Shields change.    |
| Approximate “site” for first/third-party labels           | Avoids bundling the Public Suffix List; only affects diagnostic labels, never security decisions.                        |
| Top frame only                                            | Keeps scans cheap and avoids `all_frames` access. Warnings inside cross-origin iframes are not analysed.                 |
| Background bundle unminified                              | Easier store review; size is irrelevant for a service worker.                                                            |

## Extending ShieldFix

The architecture anticipates these future capabilities without implementing them:

- **Community rules / cloud sync.** Rules already have `source`, `version`, `expiresAt` and validation. A future
  downloader must fetch signed rule files (verify a signature against a key bundled in the extension), import them
  disabled through `Repository.importRules`, never send browsing data, and be opt-in.
- **Issue reporting / aggregate statistics.** Must be opt-in, domain-only and user-initiated per report.
- **New signatures.** Add to `src/detection/signatures.ts` with positive and negative tests.
