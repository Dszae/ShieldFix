# Chrome Web Store submission sheet

Copy-paste values for every field of the Chrome Web Store developer dashboard. Brave installs extensions from the
Chrome Web Store, so this one listing serves Brave, Chrome and other Chromium browsers.

## Before you start (one time)

1. Sign in at <https://chrome.google.com/webstore/devconsole> with the Google account that will own the listing.
2. Accept the developer agreement and pay the one-time registration fee.
3. Turn on 2-Step Verification for the account (required to publish).
4. Fill in the **Account** tab (publisher name, contact email — verify it).

## 1. Package

- **New item → upload** `release/shieldfix-<version>.zip` (`npm run package`), or the zip attached to the
  [GitHub release](https://github.com/Dszae/ShieldFix/releases/latest).
- Never upload `dist-e2e/` — it is a test build (the package script refuses to zip it).

## 2. Store listing tab

| Field              | Value                                                           |
| ------------------ | --------------------------------------------------------------- |
| Title              | from the package: `ShieldFix`                                   |
| Summary            | from the package (manifest description, ≤ 132 characters)       |
| Category           | Privacy & Security                                              |
| Language           | English                                                         |
| Store icon         | `public/icons/icon-128.png`                                     |
| Screenshots (1–5)  | `store-assets/screenshot-1.png` … `screenshot-5.png` (1280×800) |
| Small promo tile   | `store-assets/promo-small.png` (440×280)                        |
| Marquee promo tile | `store-assets/promo-marquee.png` (1400×560)                     |
| Homepage URL       | `https://github.com/Dszae/ShieldFix`                            |
| Support URL        | `https://github.com/Dszae/ShieldFix/issues`                     |

Regenerate the images with `npm run store-assets`.

**Description** (paste as-is):

```text
Websites increasingly answer ad and tracker blocking with full-screen "Ad blocker detected — please disable your ad blocker" walls, blurred articles and locked scrolling. ShieldFix lets you keep your protection on and still use the page.

WHAT IT DOES
• Detects anti-adblock walls, banners and video-player warnings, with a clear confidence score.
• Tells them apart from cookie banners, sign-in dialogs, subscription prompts and ordinary pop-ups — those are never touched.
• Offers the least invasive fix: hide the warning, restore scrolling and remove the blur. You review exactly what changes before anything happens.
• Fully reversible: one click on Undo (or a page reload) restores the page exactly. Nothing is deleted, and ads and trackers stay blocked.
• "Always apply on this site" saves a local rule you can review, edit, roll back, export or delete.
• Optional automatic detection for the sites you choose, with a small in-page notice.
• Explains how to adjust Brave Shields for a single site when a cosmetic fix is not enough. ShieldFix never changes your protection itself.

PRIVATE BY DESIGN
• No data collection, no analytics, no account, no network requests.
• No access to any website at install — ShieldFix only reads a page when you click its button, or on sites you choose to watch.
• Open source: https://github.com/Dszae/ShieldFix

WHAT IT DOES NOT DO
ShieldFix does not bypass paywalls, logins, subscription requirements or DRM, and it cannot restore content a site never loaded.
```

## 3. Privacy practices tab

**Single purpose description**

```text
ShieldFix detects anti-adblock warnings on web pages (messages asking the user to disable their ad blocker) and, with the user's approval, hides them with a reversible cosmetic change.
```

**Permission justifications**

| Permission       | Justification (paste)                                                                                                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `storage`        | Stores the user's settings, per-site preferences, compatibility rules and an optional local history on the device. Nothing is transmitted.                                                                                      |
| `activeTab`      | When the user clicks the toolbar button, ShieldFix scans the current tab for an anti-adblock warning and, if the user approves, hides it. No access to any other tab.                                                           |
| `scripting`      | Injects the detection script into the active tab after the user clicks the toolbar button, and registers it for sites the user explicitly chose to watch.                                                                       |
| Host permissions | Optional only, never requested at install. Requested at runtime when the user turns on "Watch this site" (that site only) or "Watch all sites", so warnings can be detected automatically as pages load. Revocable at any time. |

**Are you using remote code?** No, I am not using remote code.

**Data usage:** tick **none** of the data categories (ShieldFix collects no user data). Then tick all three
certifications (no selling to third parties; no use unrelated to the single purpose; no use for creditworthiness or
lending) — they are true for ShieldFix.

**Privacy policy URL:** `https://github.com/Dszae/ShieldFix/blob/main/PRIVACY.md`

## 4. Distribution tab

- Payments: **Free**
- Visibility: **Public**
- Regions: **All regions**

## 5. Test instructions (optional, helps reviewers)

```text
1. Open any news page that shows an "Ad blocker detected" wall while an ad blocker or Brave Shields is active.
2. Click the ShieldFix toolbar button. The popup reports the warning and its confidence.
3. Click "Review suggested fix" to see the planned changes, then "Apply reversible fix". The wall is hidden and scrolling restored.
4. Click "Undo fix" — the page is restored exactly.
On pages without a warning (or with only a cookie banner or login form) ShieldFix reports "No issue detected" and offers no fix.
No account or login is required.
```

## 6. Submit

Click **Submit for review**. Leave “publish automatically after review” on if you want it live as soon as it passes.

Notes:

- Extensions with broad (even optional) host permissions may receive an in-depth review, which can take longer.
- Answer reviewer questions using [PERMISSIONS.md](PERMISSIONS.md) and [PRIVACY.md](../PRIVACY.md).
- **Updates:** bump `version` in `package.json`, run `npm run package`, and upload the new zip on the item's
  **Package** tab. The version must increase with every upload.
- **Microsoft Edge Add-ons** (<https://partner.microsoft.com/dashboard/microsoftedge>) accepts the same zip and
  the same texts.
