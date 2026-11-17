import { describe, expect, it } from 'vitest';
import {
  ANTI_ADBLOCK_ATTR_RE,
  CONSENT_RE,
  LOGIN_RE,
  MENTION_RE,
  NEGATED_RE,
  STRONG_PHRASES,
  SUBSCRIPTION_RE,
  normalizeText,
} from '../../src/detection/signatures';

const strong = (text: string) =>
  STRONG_PHRASES.filter((p) => p.re.test(normalizeText(text))).map((p) => p.id);

describe('strong phrases', () => {
  it.each([
    ['Ad blocker detected', 'adblock-detected'],
    ['AdBlock Detected!', 'adblock-detected'],
    ['Please disable your ad blocker', 'disable-adblock'],
    ['Disable your ad-blocker to continue', 'disable-adblock'],
    ['Whitelist this website', 'whitelist-site'],
    ['Please add us to your allowlist', 'whitelist-site'],
    ['Turn off ad blocking', 'disable-adblock'],
    ['We noticed you’re using an ad blocker', 'we-noticed-adblock'],
    ["It looks like you're using an ad blocker", 'using-adblock'],
    ['Please allow ads on our site', 'allow-ads'],
    ['Turn off Shields to watch this video', 'lower-shields'],
    ['Werbeblocker erkannt', 'adblock-detected-de'],
    ['Bloqueur de publicités détecté', 'adblock-detected-fr'],
    ['Bloqueador de anuncios detectado', 'adblock-detected-es'],
  ])('"%s" matches %s', (text, id) => {
    expect(strong(text)).toContain(id);
  });

  it.each([
    'Block this user',
    'The roadblock ahead was cleared',
    'Download our adblock-friendly app', // mention, not a warning
    'Head-block design pattern',
  ])('"%s" is not a strong match', (text) => {
    expect(strong(text)).toEqual([]);
  });
});

describe('supporting patterns', () => {
  it('detects mentions', () => {
    expect(MENTION_RE.test('Using AdBlock?')).toBe(true);
    expect(MENTION_RE.test('Weather forecast')).toBe(false);
  });

  it('detects negated wording', () => {
    expect(NEGATED_RE.test(normalizeText("We don't mind ad blockers"))).toBe(true);
    expect(NEGATED_RE.test(normalizeText('You do not need to disable your ad blocker'))).toBe(true);
    expect(NEGATED_RE.test(normalizeText('Please disable your ad blocker'))).toBe(false);
  });

  it('detects consent, login and subscription wording', () => {
    expect(CONSENT_RE.test(normalizeText('We use cookies. Accept all'))).toBe(true);
    expect(LOGIN_RE.test(normalizeText('Sign in to your account'))).toBe(true);
    expect(SUBSCRIPTION_RE.test(normalizeText('Subscribe to continue reading'))).toBe(true);
    expect(SUBSCRIPTION_RE.test(normalizeText("You've reached your free article limit"))).toBe(
      true,
    );
  });

  it.each([
    'adblock-wall',
    'anti-adblock',
    'adb-modal',
    'ad_blocker_notice',
    'blockadblock',
    'detect-adblock',
  ])('attribute pattern matches %s', (cls) => expect(ANTI_ADBLOCK_ATTR_RE.test(cls)).toBe(true));
  it.each(['head-block', 'header', 'road-blocker', 'shadblock', 'badge'])(
    'attribute pattern ignores %s',
    (cls) => {
      expect(ANTI_ADBLOCK_ATTR_RE.test(cls)).toBe(false);
    },
  );
});
