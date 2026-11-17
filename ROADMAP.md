# Roadmap

ShieldFix’s direction follows one rule: **privacy first, compatibility second, user control always.** Items move up
when they get 👍 reactions on their issue — the most-requested features are built first.

## Next

- **Store listings** — Chrome Web Store and Microsoft Edge Add-ons, after a policy review.
- **Real-world detection corpus** — validate and tune the confidence thresholds against reports from real sites
  (contributed as hostnames and diagnosis output only).
- **More languages** — broaden warning detection beyond English, German, French and Spanish.

## Later

- **Firefox support** (Manifest V3).
- **Opt-in community rule lists** — downloaded as signed files, validated, imported disabled, and never sending browsing
  data. See [ARCHITECTURE.md](docs/ARCHITECTURE.md#extending-shieldfix) for the design constraints.
- **Embedded players and iframes** — detect warnings inside same-origin frames.
- **Per-site rule sharing** — export a single site’s rules as a shareable file.

## Exploring

- Opt-in, domain-only issue reporting from inside the extension.
- Advanced developer diagnostics (live signal inspector).

## Never

- Collecting browsing history, analytics or telemetry.
- Turning protection off automatically.
- Bypassing paywalls, logins, subscriptions or DRM.
- Executing remote code.
