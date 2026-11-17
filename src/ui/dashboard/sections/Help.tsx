import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '../../components/Card';
import { PageHeader } from '../../components/PageHeader';

const TOPICS: { q: string; a: ReactNode }[] = [
  {
    q: 'How does ShieldFix detect anti-adblock warnings?',
    a: (
      <>
        It combines several signals: warning wording (for example “disable your ad blocker”), class
        and id names used by anti-adblock scripts, whether the element covers the screen, whether
        scrolling is locked or content blurred, and buttons like “I’ve disabled it”. Signals add up
        to a confidence score. Cookie banners, sign-in and subscription dialogs lower the score or
        block a fix entirely.
      </>
    ),
  },
  {
    q: 'What do the confidence levels mean?',
    a: (
      <ul className="list-disc space-y-1 pl-5">
        <li>Below 40%: nothing is reported.</li>
        <li>40–69%: possible issue — diagnostics only.</li>
        <li>70–89%: likely an anti-adblock warning — no automatic fix.</li>
        <li>90% and above: high confidence — a reversible fix is offered.</li>
      </ul>
    ),
  },
  {
    q: 'What exactly does a fix change?',
    a: (
      <>
        It hides the warning (and its dimming backdrop) with an inline style, re-enables scrolling
        and removes blur from the page. Nothing is deleted. Ads and trackers stay blocked. Undo, or
        reloading the page, restores everything.
      </>
    ),
  },
  {
    q: 'The fix was applied but the article is still missing.',
    a: (
      <>
        Some sites remove or never load content when they detect privacy protection. A cosmetic fix
        cannot bring that back. Use the Brave Shields guidance in the popup to lower protection for
        that site only, then reload.
      </>
    ),
  },
  {
    q: 'ShieldFix says “Page access needed”.',
    a: (
      <>
        Without site access, ShieldFix can only inspect a page right after you click its toolbar
        button. Click the button while the page is open, or turn on “Watch this site” so pages are
        checked automatically.
      </>
    ),
  },
  {
    q: 'Why doesn’t ShieldFix turn off Brave Shields for me?',
    a: (
      <>
        Browsers do not let extensions read or change Shields. ShieldFix explains where the setting
        is instead, and it never weakens protection on its own.
      </>
    ),
  },
  {
    q: 'A normal dialog was detected as a warning.',
    a: (
      <>
        Fixes are only offered at 90% confidence and never for dialogs with sign-in, payment, form,
        consent, age or subscription content. If a wrong element was hidden, click Undo, then delete
        any rule saved for the site under Compatibility rules.
      </>
    ),
  },
  {
    q: 'The warning comes back after I hide it.',
    a: (
      <>
        Some pages re-create their warning. While a fix is active, ShieldFix re-applies it a limited
        number of times. If the page keeps fighting, lowering protection for that site in your
        browser is the reliable option.
      </>
    ),
  },
];

export function Help() {
  return (
    <>
      <PageHeader
        title="Help & troubleshooting"
        description="Answers to common questions. Everything here works offline."
      />
      <Card padded={false}>
        <ul className="divide-y divide-line">
          {TOPICS.map((t) => (
            <li key={t.q}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 font-medium hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                  {t.q}
                  <ChevronDown
                    size={16}
                    aria-hidden
                    className="flex-none text-subtle transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="px-4 pb-4 text-muted">{t.a}</div>
              </details>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}
