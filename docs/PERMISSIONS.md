# Permissions

ShieldFix requests the minimum access needed. At install it can read **no** website.

## Required permissions

| Permission  | Why it is needed                                                                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`   | Saves settings, site preferences, compatibility rules and the optional diagnostic history on the device (`chrome.storage.local`), and per-tab scan results in memory (`storage.session`). |
| `activeTab` | When you click the ShieldFix toolbar button, grants temporary access to **that tab only** so the page can be scanned and fixed. Access ends when the tab navigates.                       |
| `scripting` | Injects the content script into the active tab after a toolbar click, and registers it for sites you chose to watch.                                                                      |

## Optional permissions (requested only when you turn a feature on)

| Permission                                                           | Requested when                                                              | Why                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------ |
| Host access to one site (`*://example.com/*`, `*://*.example.com/*`) | You switch on **Watch this site**                                           | Run detection automatically as that site’s pages load. |
| Host access to all sites (`http://*/*`, `https://*/*`)               | You switch on **Watch all sites** (Settings) or choose it during onboarding | Run detection automatically on every site.             |

Optional access can be revoked from the dashboard (**Privacy → Revoke all site access**, or per site on the **Sites**
page) or from the browser’s extension settings. ShieldFix follows whatever access is actually granted: if you revoke
access in the browser, automatic detection for those sites stops immediately.

## Permissions ShieldFix does not use

- `tabs` — not needed; `activeTab` and host access already reveal the URL of tabs ShieldFix may work on.
- `notifications` — detection is communicated through the toolbar badge and an optional in-page notice.
- `webRequest` / `declarativeNetRequest` — ShieldFix never blocks or unblocks network requests.
- `cookies`, `history`, `webNavigation`, `<all_urls>` at install — not needed.

## Content Security Policy

```
script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
```

No remote code, no `eval`, no inline scripts, and extension pages cannot be framed. ShieldFix exposes no
`web_accessible_resources`.

## Test build

`npm run build:e2e` produces `dist-e2e/`, which additionally declares
`host_permissions: ["*://127.0.0.1/*", "*://*.example.com/*"]` so that automated tests (and the README media script,
which maps the reserved `example.com` domain to the local fixture server) can scan fixture pages without a toolbar
click. It is renamed “ShieldFix (E2E test build)” and
`scripts/package.mjs` refuses to package it.
