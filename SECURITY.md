# Security Policy

## Supported versions

Only the latest released version of ShieldFix receives security fixes.

## Reporting a vulnerability

Please report vulnerabilities **privately** using the repository’s “Report a vulnerability” button (GitHub private
security advisories). Do not open a public issue for security problems.

Include, where possible: the ShieldFix version, browser and version, a minimal page or steps that reproduce the issue,
and the impact you observed. You should receive an acknowledgement within a few days. Please allow time for a fix to be
released before disclosure.

## Security design

ShieldFix runs on arbitrary, untrusted web pages, so it is built defensively:

- **No remote code.** No `eval`, `new Function`, remote scripts or dynamically fetched code. The extension pages use a
  strict Content Security Policy (`script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none';
frame-ancestors 'none'`). ESLint forbids `eval`, `innerHTML`, `outerHTML` and `insertAdjacentHTML`.
- **No network access.** The extension makes no requests of its own.
- **Validated messaging.** Every message to the service worker is validated with Zod and checked against its sender:
  requests that change data or act on tabs are accepted only from ShieldFix’s own extension pages; content-script
  messages are accepted only from top-level frames, and a page may only report on its own hostname. The content script
  accepts messages only from the extension itself and never listens to page `postMessage` traffic.
- **Untrusted page content.** Page text is analysed in memory and never stored, rendered as HTML or sent anywhere.
  The in-page notice is built with DOM APIs inside a shadow root.
- **Safe rules.** Rules are declarative (domain + selector). Selectors are restricted to a safe character set and
  pseudo-class allow-list, must target a class/id/attribute, cannot target `html`/`head`/`body`/`main`, are length-limited,
  and are skipped at runtime if they match more than three elements. Rules can only _hide_ elements, and only when the
  element passes the same vetoes as detected warnings (no password, payment, consent, subscription or form content).
  Imported rules are validated individually and arrive disabled.
- **Least privilege.** No host permissions at install; site access is optional and requested per site. See
  [docs/PERMISSIONS.md](docs/PERMISSIONS.md).
- **Reversible changes.** Fixes only set inline styles (or close a modal dialog / remove `inert`) and record previous
  values for exact restoration. Nothing is removed from the DOM.

## Supply chain

Dependencies are pinned to exact versions with a lockfile; CI installs with `npm ci`. GitHub Actions are pinned to
commit SHAs. Run `npm audit` before each release (see [docs/RELEASE.md](docs/RELEASE.md)).
