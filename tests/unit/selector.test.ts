import { describe, expect, it } from 'vitest';
import { isStableToken, stableSelector } from '../../src/fixer/selector';
import { checkSelectorSafety, isSyntacticallyValidSelector } from '../../src/compat/selectorSafety';
import { $, html } from './helpers/layout';

describe('isStableToken', () => {
  it.each(['adblock-wall', 'modal', 'overlay_notice', 'AdbModal'])('accepts %s', (t) => {
    expect(isStableToken(t)).toBe(true);
  });
  it.each(['css-1x2y3z', 'sc-bdVaJa', 'a1b2c3d4', 'x', 'item-20231107', 'Modal__a1B2c', 'jsx-123'])(
    'rejects %s',
    (t) => {
      expect(isStableToken(t)).toBe(false);
    },
  );
});

describe('stableSelector', () => {
  it('prefers a unique stable id', () => {
    html(`<div id="adb-wall" class="modal"></div>`);
    expect(stableSelector($('#adb-wall'), document)).toBe('#adb-wall');
  });

  it('falls back to tag and classes', () => {
    html(`<div class="anti-adblock modal css-9z8y7x"></div><div class="modal"></div>`);
    expect(stableSelector($('.anti-adblock'), document)).toBe('div.anti-adblock.modal');
  });

  it('qualifies with a parent when needed for uniqueness', () => {
    html(
      `<section class="wrap"><div class="box"></div></section><aside><div class="box"></div></aside>`,
    );
    expect(stableSelector($('.wrap .box'), document)).toBe('section.wrap > div.box');
  });

  it('returns null when nothing stable identifies the element', () => {
    html(`<div><div class="css-1a2b3c"></div></div><div><div class="css-1a2b3c"></div></div>`);
    expect(stableSelector(document.querySelector('.css-1a2b3c')!, document)).toBeNull();
  });

  it('never targets body or html', () => {
    expect(stableSelector(document.body, document)).toBeNull();
  });

  it('produces selectors that pass rule validation', () => {
    html(`<div id="adb-wall"></div>`);
    const sel = stableSelector($('#adb-wall'), document)!;
    expect(checkSelectorSafety(sel).ok).toBe(true);
  });
});

describe('checkSelectorSafety', () => {
  it.each([
    '.adblock-wall',
    '#adb',
    'div.modal.overlay',
    '[data-adblock="true"]',
    'body > div.wall',
    '.a, .b',
    '.wall:not(.x)',
    '[data-x="a b"]',
    // Quoted attribute values are data: a colon or bracket in them is not a
    // pseudo-class or a bracket of the selector (Tailwind classes like md:hidden).
    'div[class*="md:hidden"]',
    '[data-state="modal:open"]',
    "[title='Disable adblock :(']",
    '[data-x="a[b"]',
  ])('accepts %s', (sel) => expect(checkSelectorSafety(sel)).toEqual({ ok: true }));
  it.each([
    ['', 'empty'],
    ['div', 'tag only'],
    ['*', 'universal'],
    ['body', 'body'],
    ['main.content', 'main'],
    ['html.adblock', 'html'],
    ['.a:has(.b)', ':has'],
    ['.a::before', 'pseudo-element'],
    ['.a{display:none}', 'braces'],
    ['.a; .b', 'semicolon'],
    ['.a, .b, .c, .d', 'too many parts'],
    ['.a[', 'unbalanced'],
    ['x'.repeat(201), 'too long'],
    ['.a\\:b', 'backslash'],
    ['[data-x="a:b"]:hover', 'pseudo-class after a quoted value'],
    ['[data-x="a"]::before', 'pseudo-element after a quoted value'],
    ['[data-x="a].b', 'unterminated quote'],
  ])('rejects %s (%s)', (sel) => {
    expect(checkSelectorSafety(sel).ok).toBe(false);
  });

  it('checks syntax against the DOM', () => {
    expect(isSyntacticallyValidSelector('.ok', document)).toBe(true);
    expect(isSyntacticallyValidSelector('.a >> .b', document)).toBe(false);
  });
});
