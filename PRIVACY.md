# ShieldFix Privacy Policy

_Effective for ShieldFix 1.0.0._

ShieldFix is designed to work without collecting any information about you. This page explains, in plain language,
what the extension processes and stores.

## Summary

- **No data leaves your device.** ShieldFix makes no network requests of its own: no analytics, telemetry, crash
  reporting, advertising or remote configuration.
- **No account** is needed and nothing is synchronised between devices.
- **No browsing history is collected.** Page addresses (URLs), page content and anything you type are never stored.
- **Everything is optional and deletable** from the Privacy page of the dashboard.

## What ShieldFix processes on the page

When ShieldFix scans a page (when you click its toolbar button, or automatically on sites you chose to watch), the
content script reads the page’s structure, visible text and styles **in memory, on your device**, to decide whether an
anti-adblock warning is present. This text is not stored and is not sent anywhere — including to other parts of the
extension. The results passed inside the extension contain only:

- the site’s hostname (for example `news.example.com`);
- detection results: signal identifiers (such as `phrase-strong`), confidence scores and a short structural description
  of the detected element (such as `div#adb-wall`);
- counts of failed resource loads grouped by hostname, and whether each host belongs to the site, a third party or a
  known ad/tracking service.

## What ShieldFix stores (locally, in the browser’s extension storage)

| Data                | Contents                                                                                           | Kept until                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Settings            | Your choices on the Settings and Privacy pages                                                     | You change them or delete all data                                 |
| Site preferences    | Hostname, “watch this site” and “apply fixes automatically” switches, counters and the last result | You remove the site or delete all data                             |
| Compatibility rules | Domain, CSS selector, type, confidence, version history, optional expiry                           | You delete the rule, it expires, or you delete all data            |
| Diagnostic history  | Hostname, time, event (detected / fix applied / undone), confidence, signal identifiers            | The retention period you choose (default 30 days); off at any time |
| Per-tab state       | The latest scan result for each open tab                                                           | The tab navigates or closes, or the browser exits (memory only)    |

Site summaries and history entries are only created for sites where something was detected or where you saved a
preference. Turning history off deletes the existing history and stops creating site summaries.

## Permissions

ShieldFix asks for the minimum access it needs. Access to websites is requested only when you turn on automatic
detection for a site or for all sites, and can be revoked at any time. See [docs/PERMISSIONS.md](docs/PERMISSIONS.md).

## Exporting and deleting data

- **Export:** compatibility rules can be exported as JSON from the Rules page.
- **Delete:** the Privacy page offers “Delete all ShieldFix data” and “Revoke all site access”. Uninstalling the
  extension also removes all of its stored data.

## Third parties

ShieldFix does not share, sell or transfer data to anyone. It contains no third-party code that communicates over the
network.

## Changes

If a future version changes what is processed (for example, optional community rule downloads), this policy will be
updated first and any new data use will be opt-in.

## Contact

Questions about privacy can be raised through the project’s issue tracker. Security-sensitive reports should follow
[SECURITY.md](SECURITY.md).
