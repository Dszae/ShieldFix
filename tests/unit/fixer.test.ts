import { beforeEach, describe, expect, it } from 'vitest';
import { scanDocument } from '../../src/detection/engine';
import { FixSession, planFix } from '../../src/fixer/fixer';
import { $, FakeLayout, html } from './helpers/layout';

let layout: FakeLayout;

function plan() {
  const result = scanDocument({ doc: document, probe: layout.probe() });
  const candidate = result.candidates[0]!;
  return { candidate, actions: planFix(candidate, result.page, document) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  layout = new FakeLayout();
  html(`
    <div id="content" style="filter: blur(5px); color: red">Article</div>
    <div id="scrim" style="position:fixed;z-index:9998;background-color:rgba(0,0,0,0.5)"></div>
    <div id="wall" style="position:fixed;z-index:9999;display:block">
      <p>Ad blocker detected. Please disable your ad blocker to continue.</p><button>I've disabled it</button>
    </div>`);
  document.documentElement.style.overflowY = 'hidden';
  document.body.setAttribute('style', 'overflow-y: hidden; margin: 0');
  layout.fullscreen($('#wall')).fullscreen($('#scrim'));
});

describe('planFix', () => {
  it('plans hiding the overlay and backdrop, unlocking scroll and removing blur', () => {
    const { actions } = plan();
    const kinds = actions.map((a) => a.kind);
    expect(kinds.filter((k) => k === 'hide')).toHaveLength(2);
    expect(kinds).toContain('unlock-scroll');
    expect(kinds).toContain('remove-filter');
    expect(actions.find((a) => a.kind === 'remove-filter')!.el).toBe($('#content'));
  });
});

describe('FixSession', () => {
  it('applies changes and restores the exact original inline styles on revert', () => {
    const els = [$('#wall'), $('#scrim'), $('#content'), document.body, document.documentElement];
    const before = els.map((el) => el.style.cssText);
    const { actions } = plan();
    const session = new FixSession(window, actions);
    const verification = session.apply();

    expect(verification.overlayHidden).toBe(true);
    expect(verification.scrollRestored).toBe(true);
    expect($('#wall').style.getPropertyValue('display')).toBe('none');
    expect($('#wall').style.getPropertyPriority('display')).toBe('important');
    expect($('#content').style.getPropertyValue('filter')).toBe('none');
    expect(document.body.style.getPropertyValue('overflow-y')).toBe('auto');

    session.revert();
    expect(session.active).toBe(false);
    expect($('#wall').style.getPropertyValue('display')).toBe('block');
    expect($('#content').style.getPropertyValue('filter')).toBe('blur(5px)');
    expect(document.body.style.getPropertyValue('overflow-y')).toBe('hidden');
    expect(document.body.style.getPropertyValue('margin')).toBe('0px');
    expect($('#wall').style.getPropertyPriority('display')).toBe('');
    expect(els.map((el) => el.style.cssText)).toEqual(before);
  });

  it('removes a style attribute it created when reverting', () => {
    html(
      `<div id="w" class="adblock-overlay" style="position:fixed;z-index:9999"><p>Ad blocker detected. Disable your ad blocker.</p></div><div id="plain">x</div>`,
    );
    layout = new FakeLayout();
    layout.fullscreen($('#w'));
    const { actions } = plan();
    const session = new FixSession(window, actions);
    session.apply();
    session.revert();
    expect($('#w').getAttribute('style')).toContain('position');
    expect($('#w').style.getPropertyValue('display')).toBe('');
  });

  it('keeps unrelated style changes the page made while the fix was active', () => {
    const { actions } = plan();
    const session = new FixSession(window, actions);
    session.apply();
    $('#content').style.setProperty('color', 'blue');
    session.revert();
    expect($('#content').style.getPropertyValue('color')).toBe('blue');
    expect($('#content').style.getPropertyValue('filter')).toBe('blur(5px)');
  });

  it('re-asserts the fix when the page tries to undo it', async () => {
    const { actions } = plan();
    const session = new FixSession(window, actions);
    session.apply();
    $('#wall').style.setProperty('display', 'block', 'important');
    await flush();
    expect($('#wall').style.getPropertyValue('display')).toBe('none');
    expect(session.reassertions).toBeGreaterThan(0);
    session.revert();
  });

  it('is idempotent and does nothing when reverted twice', () => {
    const { actions } = plan();
    const session = new FixSession(window, actions);
    session.apply();
    session.apply();
    session.revert();
    session.revert();
    expect($('#wall').style.getPropertyValue('display')).toBe('block');
  });

  it('removes and restores the inert attribute', () => {
    html(`<main id="m" inert>Page</main>
      <div id="wall" style="position:fixed;z-index:9999"><p>Ad blocker detected. Disable your ad blocker.</p></div>`);
    layout = new FakeLayout();
    layout.fullscreen($('#wall'));
    const { actions } = plan();
    expect(actions.map((a) => a.kind)).toContain('remove-inert');
    const session = new FixSession(window, actions);
    session.apply();
    expect($('#m').hasAttribute('inert')).toBe(false);
    session.revert();
    expect($('#m').hasAttribute('inert')).toBe(true);
  });
});
