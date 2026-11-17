# Changelog

All notable changes to ShieldFix are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.0.0] — 2026-11-17

First release.

### Added

- Detection engine combining text, class/id, geometry, scroll-lock, blur, call-to-action, vendor and rule signals into
  a confidence score, with vetoes for consent, sign-in, payment, form, subscription and age-verification content.
- Reversible cosmetic fixes (hide warning and backdrop, restore scrolling, remove blur and `inert`), with verification,
  bounded re-assertion when pages undo them, and exact restoration on undo.
- Popup: page status, fix review and approval, undo, diagnosis, Brave Shields guidance, per-site watching and
  auto-apply switches.
- Dashboard: onboarding, overview, sites, local history, compatibility rules (create, edit with versioning, rollback,
  enable/disable, expiry, import/export), settings, privacy controls, help and about.
- Optional automatic detection per site or for all sites, with an accessible in-page notice.
- Failed/blocked resource diagnostics grouped by first party, third party and ad/tracking hosts.
- Light and dark themes, keyboard navigation, screen-reader announcements and reduced-motion support.
- Unit/integration tests (Vitest) and browser tests (Playwright) in Chromium and Brave.

[Unreleased]: https://github.com/Dszae/ShieldFix/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Dszae/ShieldFix/releases/tag/v1.0.0
