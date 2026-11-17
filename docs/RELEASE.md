# Release process

## Versioning

ShieldFix uses semantic versioning. The version lives in `package.json` only; the build writes it into
`manifest.json`.

- **Patch** — fixes and new detection signatures that do not change behaviour elsewhere.
- **Minor** — new features, settings or permissions-neutral UI changes.
- **Major** — changes to stored data that need migration, or any change to requested permissions.

Any change to permissions requires updating [PERMISSIONS.md](PERMISSIONS.md), [PRIVACY.md](../PRIVACY.md) and the store
listing, and is a major version.

## Checklist

1. **Update** `version` in `package.json`, move “Unreleased” entries in `CHANGELOG.md` under the new version and date.
2. **Install cleanly:** `npm ci`.
3. **Audit dependencies:** `npm audit` — resolve anything high or critical.
4. **Static checks + unit tests:** `npm run check`.
5. **Browser tests:** `npm run test:e2e`, then the Brave project with `BRAVE_PATH` set (see [TESTING.md](TESTING.md)).
6. **Manual checks in Brave** with the production build loaded unpacked from `dist/`:
   - [ ] Install shows the welcome page; finishing setup in on-demand mode requests no permissions.
   - [ ] On a real site known to show an anti-adblock wall (with Shields up), the toolbar popup detects it, the fix
         review lists sensible changes, Apply hides it, Undo restores it.
   - [ ] On sites with cookie banners and sign-in dialogs, nothing is flagged as anti-adblock.
   - [ ] “Watch this site” shows the browser’s permission prompt for that site only; after granting, a reload is
         monitored; turning it off removes the permission.
   - [ ] “Open global Shields settings” opens `brave://settings/shields`.
   - [ ] Light and dark themes, keyboard-only use of the popup, and zoom at 200 % are usable.
   - [ ] Brave’s extension page shows no errors for ShieldFix.
7. **Package:** `npm run package` → `release/shieldfix-<version>.zip` and `.sha256`. The script refuses version
   mismatches and test builds.
8. **Store assets (if UI changed):** `npm run build:e2e && node scripts/store-assets.mjs` regenerates
   `store-assets/` (1280×800 screenshots plus popup/dashboard previews).
9. **Tag and publish:** tag `v<version>`, attach the zip and checksum to the release, and submit the zip to stores.

## Chrome Web Store submission notes

ShieldFix is prepared for, but has not been through, Chrome Web Store review. When submitting:

- **Single purpose:** “Detects anti-adblock warnings on web pages and offers reversible, user-approved cosmetic fixes.”
- **Permission justifications:** copy from [PERMISSIONS.md](PERMISSIONS.md).
- **Remote code:** “No, I am not using remote code.”
- **Data usage:** no data collected; certify compliance with the developer program policies only after reviewing them
  for the current submission.
- **Privacy policy URL:** host [PRIVACY.md](../PRIVACY.md) at a public URL.
- Listing text: see [STORE_LISTING.md](STORE_LISTING.md).

Store policies change; review the current Chrome Web Store program policies (in particular those on ad blockers and on
modifying third-party sites) before each submission. Brave installs extensions from the Chrome Web Store.
