/**
 * Detection signatures. Text is normalised (lower case, collapsed whitespace,
 * typographic apostrophes replaced) before matching.
 *
 * Text matching alone never produces a high-confidence result; it is combined
 * with structural, geometric and page-state signals in `scoring.ts`.
 */

export interface PhraseSignature {
  id: string;
  label: string;
  re: RegExp;
}

const AB = String.raw`ad[\s-]?block(?:er|ers|ing)?`;

export const STRONG_PHRASES: PhraseSignature[] = [
  {
    id: 'adblock-detected',
    label: '"Ad blocker detected" wording',
    re: new RegExp(
      String.raw`\b${AB}\b[^.!?]{0,40}\b(?:detected|is (?:on|enabled|active)|enabled|active)\b`,
    ),
  },
  {
    id: 'disable-adblock',
    label: 'Asks to disable an ad blocker',
    re: new RegExp(
      String.raw`\b(?:disable|turn off|deactivate|pause|switch off|remove|uninstall)\b[^.!?]{0,30}\b${AB}`,
    ),
  },
  {
    id: 'whitelist-site',
    label: 'Asks to whitelist / allowlist the site',
    re: /\b(?:whitelist|white-list|allowlist|allow-list)\b[^.!?]{0,40}\b(?:site|website|us|domain|page)\b|\badd (?:us|this (?:site|website)) to (?:your )?(?:whitelist|allowlist)/,
  },
  {
    id: 'using-adblock',
    label: '"You are using an ad blocker" wording',
    re: new RegExp(
      String.raw`\b(?:you(?:'re| are)|you seem to be|looks like you(?:'re| are)) (?:using|running) an? ${AB}`,
    ),
  },
  {
    id: 'we-noticed-adblock',
    label: '"We noticed an ad blocker" wording',
    re: new RegExp(
      String.raw`\bwe(?:'ve| have)? (?:noticed|detected|see|spotted)\b[^.!?]{0,40}\b${AB}`,
    ),
  },
  {
    id: 'adblock-to-continue',
    label: 'Content gated behind ad blocker removal',
    re: new RegExp(
      String.raw`\b${AB}\b[^.!?]{0,50}\b(?:to (?:continue|access|view|read|watch|play|keep reading))\b`,
    ),
  },
  {
    id: 'allow-ads',
    label: 'Asks to allow ads',
    re: /\b(?:please )?allow ads\b|\b(?:enable|turn on) ads\b/,
  },
  {
    id: 'lower-shields',
    label: 'Asks to lower browser privacy protection',
    re: /\b(?:disable|turn off|lower|drop|switch off)\b[^.!?]{0,30}\b(?:shields|tracker blocking|tracking protection|privacy protection|content blocker)\b/,
  },
  {
    id: 'adblock-detected-de',
    label: 'German ad blocker warning',
    re: /\b(?:werbe|ad)blocker\b[^.!?]{0,40}\b(?:erkannt|deaktivieren|ausschalten|deaktiviert)\b/,
  },
  {
    id: 'adblock-detected-fr',
    label: 'French ad blocker warning',
    re: /(?:bloqueur de (?:publicités?|pubs?)|adblock)[^.!?]{0,40}(?:détecté|désactiv)|désactiv\w*[^.!?]{0,30}(?:bloqueur|adblock)/,
  },
  {
    id: 'adblock-detected-es',
    label: 'Spanish ad blocker warning',
    re: /(?:bloqueador de (?:anuncios|publicidad)|adblock)[^.!?]{0,40}(?:detectado|desactiv)|desactiv\w*[^.!?]{0,30}(?:bloqueador|adblock)/,
  },
];

/** Weak mention: the text talks about ad blocking, but not necessarily as a warning. */
export const MENTION_RE =
  /ad[\s\u00a0_-]?block|werbeblock|bloqueur de pub|bloqueador de anuncios|whitelist|allowlist|allow ads|\bshields\b|tracking protection|content blocker/i;

/** Text the user is invited to click on anti-adblock walls. */
export const CTA_RE =
  /\b(?:i(?:'ve| have) (?:disabled|turned off|whitelisted|allowed)|i disabled|disabled (?:it|my)|allow ads|whitelist|allowlist|continue without|turn off|try again|refresh|reload|i understand|ok,? i(?:'ll| will)|how (?:do i|to) disable)\b/;

/** Negated or reassuring wording ("we don't mind ad blockers"). */
export const NEGATED_RE = new RegExp(
  String.raw`\b(?:don't|do not|doesn't|does not|no need to|won't|will not|never)\b(?: have to| need to| ask you to| mind| require you to)?[^.!?]{0,20}\b(?:disable|turn off|mind|block|ask)\b[^.!?]{0,30}${AB}|\b${AB}s? (?:are|is) (?:fine|ok|okay|welcome)\b`,
);

export const CONSENT_RE =
  /\b(?:cookies?|consent|gdpr|ccpa|accept all|reject all|necessary only|legitimate interests?|manage (?:cookies|preferences|options|settings)|privacy (?:settings|preferences|choices)|our partners|vendors)\b/;

export const LOGIN_RE =
  /\b(?:sign in|sign-in|log in|login|log-in|password|username|forgot (?:your )?password|create (?:an |a free )?account)\b/;

export const SUBSCRIPTION_RE =
  /\b(?:subscribe to (?:continue|read|keep reading|unlock)|subscribers? only|subscription required|become a (?:member|subscriber)|you(?:'ve| have) (?:reached|used) (?:your|all)|free articles?|article limit|already a subscriber|unlock (?:this|full) (?:article|story|access)|start (?:your )?(?:free )?trial|paywall)\b/;

export const AGE_GATE_RE =
  /\b(?:are you (?:over )?(?:18|21)|verify your age|age verification|date of birth|you must be (?:18|21))\b/;

/**
 * Class / id fragments used by anti-adblock scripts. The leading boundary avoids
 * matches like "head-block".
 */
export const ANTI_ADBLOCK_ATTR_RE =
  /(?:^|[^a-z])(?:anti[-_]?)?ad[-_]?block(?:er)?(?:[-_]?(?:notice|wall|modal|overlay|detect(?:ed|or)?|message|popup|warning|msg|alert))?(?:$|[^a-z])|(?:^|[^a-z])adb[-_](?:modal|overlay|notice|wall|popup|detect|message|warning)|blockadblock|detect[-_]?adblock|adblock[-_]?detect|(?:^|[^a-z])ab[-_](?:overlay|modal|wall)(?:$|[^a-z])/i;

/** Selectors for candidate discovery (attribute substring matches are cheap). */
export const ATTRIBUTE_SEED_SELECTOR = [
  '[class*="adblock" i]',
  '[id*="adblock" i]',
  '[class*="ad-block" i]',
  '[id*="ad-block" i]',
  '[class*="ad_block" i]',
  '[id*="ad_block" i]',
  '[class*="adb-" i]',
  '[id*="adb-" i]',
  '[class*="adb_" i]',
  '.fc-ab-root',
].join(',');

export const DIALOG_SEED_SELECTOR =
  'dialog[open],[role="dialog"],[role="alertdialog"],[aria-modal="true"]';

/**
 * Generic vendor signatures. These identify the anti-adblock component of widely
 * used ad-recovery products by their published root element. They are structural
 * hints only and are always combined with other signals.
 */
export const VENDOR_SIGNATURES: { id: string; label: string; selector: string }[] = [
  {
    id: 'vendor-funding-choices',
    label: 'Google Funding Choices ad-block message',
    selector: '.fc-ab-root',
  },
];

/** Elements whose text is never page content worth scanning. */
export const SKIP_TEXT_PARENTS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'SVG',
  'TEXTAREA',
]);

export function normalizeText(text: string): string {
  return text
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
