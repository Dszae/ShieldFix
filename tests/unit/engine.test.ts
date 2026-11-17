import { beforeEach, describe, expect, it } from 'vitest';
import { levelFor, scanDocument, isAntiAdblock } from '../../src/detection/engine';
import { $, FakeLayout, html } from './helpers/layout';

let layout: FakeLayout;
const scan = (rules = [] as Parameters<typeof scanDocument>[0]['rules']) =>
  scanDocument({ doc: document, probe: layout.probe(), rules });
const top = (result: ReturnType<typeof scan>) => result.candidates[0];

beforeEach(() => {
  layout = new FakeLayout();
});

describe('levels', () => {
  it('maps confidence to the documented thresholds', () => {
    expect(levelFor(0)).toBe('none');
    expect(levelFor(39)).toBe('none');
    expect(levelFor(40)).toBe('possible');
    expect(levelFor(69)).toBe('possible');
    expect(levelFor(70)).toBe('likely');
    expect(levelFor(89)).toBe('likely');
    expect(levelFor(90)).toBe('high');
    expect(levelFor(100)).toBe('high');
  });
});

describe('anti-adblock detection', () => {
  it('detects a full-screen anti-adblock modal with high confidence and offers a fix', () => {
    html(`
      <main><article><p>${'Article text. '.repeat(50)}</p></article></main>
      <div id="wall" style="position:fixed;z-index:99999;background:rgba(0,0,0,.7)">
        <div class="box">
          <h2>Ad blocker detected</h2>
          <p>Please disable your ad blocker to continue reading.</p>
          <button>I've disabled my ad blocker</button>
        </div>
      </div>`);
    document.body.style.overflowY = 'hidden';
    layout.fullscreen($('#wall'));
    const result = scan();
    const c = top(result)!;
    expect(c.el).toBe($('#wall'));
    expect(c.classification).toBe('anti-adblock-overlay');
    expect(c.geometry).toBe('fullscreen');
    expect(c.confidence).toBeGreaterThanOrEqual(90);
    expect(c.level).toBe('high');
    expect(c.fixable).toBe(true);
    expect(c.signals.map((s) => s.id)).toEqual(
      expect.arrayContaining([
        'phrase-strong',
        'geometry-fullscreen',
        'scroll-lock',
        'cta',
        'high-z-index',
      ]),
    );
    expect(result.page.scrollLocked).toBe(true);
  });

  it('detects a fixed banner and classifies it as a banner', () => {
    html(`<div id="bar" class="adblock-notice" style="position:fixed;z-index:5000">
      We noticed you're using an ad blocker. Please whitelist our site. <button>Whitelist</button></div>`);
    layout.set($('#bar'), [0, 720, 1280, 80]);
    const c = top(scan())!;
    expect(c.classification).toBe('anti-adblock-banner');
    expect(c.signals.map((s) => s.id)).toContain('attr-pattern');
    expect(c.confidence).toBeGreaterThanOrEqual(90);
    expect(c.fixable).toBe(true);
  });

  it('finds a separate dimming backdrop', () => {
    html(`
      <div id="scrim" style="position:fixed;z-index:9998;background-color:rgba(0,0,0,0.6)"></div>
      <div id="modal" style="position:fixed;z-index:9999">
        <p>Adblock detected! Please turn off your adblocker to access this content.</p>
        <button>Refresh</button>
      </div>`);
    layout.fullscreen($('#scrim')).set($('#modal'), [440, 250, 400, 300]);
    layout.topAt = $('#scrim'); // the scrim is also discovered on its own
    const result = scan();
    const c = top(result)!;
    expect(c.el).toBe($('#modal'));
    expect(c.geometry).toBe('modal');
    expect(c.backdrops).toEqual([$('#scrim')]);
    // ...but it is reported as part of the warning, not as an ordinary dialog.
    expect(result.candidates.some((x) => x.el === $('#scrim'))).toBe(false);
    expect(result.ordinaryDialogs).toBe(0);
  });

  it('recognises a vendor signature', () => {
    html(
      `<div class="fc-ab-root" style="position:fixed;z-index:2147483647"><p>It looks like you're using an ad blocker.</p></div>`,
    );
    layout.fullscreen($('.fc-ab-root'));
    const c = top(scan())!;
    expect(c.signals.map((s) => s.id)).toContain('vendor-signature');
    expect(c.level).toBe('high');
  });

  it('ignores elements that are not rendered', () => {
    html(
      `<div id="wall" style="position:fixed;display:none">Ad blocker detected. Disable your ad blocker.</div>`,
    );
    layout.fullscreen($('#wall'));
    expect(scan().candidates.filter((c) => isAntiAdblock(c.classification))).toHaveLength(0);
  });
});

describe('false-positive safeguards', () => {
  it('does not treat a cookie consent dialog as anti-adblock', () => {
    html(`<div id="consent" role="dialog" style="position:fixed;z-index:9999">
      <p>We use cookies to improve your experience. Manage preferences or accept all.</p>
      <button>Accept all</button><button>Reject all</button></div>`);
    layout.set($('#consent'), [0, 600, 1280, 200]);
    const c = top(scan())!;
    expect(isAntiAdblock(c.classification)).toBe(false);
    expect(c.classification).toBe('consent-dialog');
    expect(c.fixable).toBe(false);
  });

  it('never offers a fix for a login dialog, even with an anti-adblock phrase', () => {
    html(`<div id="login" role="dialog" aria-modal="true" style="position:fixed;z-index:9999">
      <p>Ad blocker detected. Sign in to continue.</p>
      <input type="email" name="email"><input type="password" name="password"><button>Log in</button></div>`);
    layout.set($('#login'), [440, 200, 400, 400]);
    const c = top(scan())!;
    expect(c.vetoes.map((v) => v.id)).toContain('credential-field');
    expect(c.fixable).toBe(false);
  });

  it('classifies a plain login dialog as a login dialog', () => {
    html(
      `<div id="login" role="dialog" style="position:fixed;z-index:10"><h2>Sign in</h2><input type="password"></div>`,
    );
    layout.set($('#login'), [440, 200, 400, 400]);
    expect(top(scan())!.classification).toBe('login-dialog');
  });

  it('does not offer a fix for subscription prompts', () => {
    html(`<div id="pay" style="position:fixed;z-index:9999">
      <p>You've reached your free article limit. Subscribe to continue reading.</p><button>Subscribe</button></div>`);
    layout.fullscreen($('#pay'));
    layout.topAt = $('#pay'); // discovered by hit-testing the viewport, as in a real browser
    const c = top(scan())!;
    expect(c.classification).toBe('subscription-prompt');
    expect(c.fixable).toBe(false);
  });

  it('refuses a fix when an anti-adblock wall also offers a subscription', () => {
    html(`<div id="wall" style="position:fixed;z-index:9999">
      <p>Ad blocker detected. Please disable your ad blocker or subscribe to continue reading.</p></div>`);
    layout.fullscreen($('#wall'));
    const c = top(scan())!;
    expect(c.vetoes.map((v) => v.id)).toContain('subscription-prompt');
    expect(c.fixable).toBe(false);
  });

  it('does not flag an article that discusses ad blockers', () => {
    html(`<main><article>
      <h1>Why do sites say "Ad blocker detected"?</h1>
      <p id="para">Many publishers ask you to disable your ad blocker or whitelist their site. We explain why.</p>
      <p>${'More article content about the advertising industry. '.repeat(10)}</p>
    </article></main>`);
    const result = scan();
    const anti = result.candidates.filter(
      (c) => isAntiAdblock(c.classification) && c.level !== 'none',
    );
    expect(anti).toHaveLength(0);
  });

  it('respects negated wording', () => {
    html(
      `<div id="note" style="position:fixed;z-index:9999">We don't mind ad blockers. Enjoy the site!</div>`,
    );
    layout.set($('#note'), [0, 760, 1280, 40]);
    const c = top(scan());
    expect(c === undefined || c.level === 'none' || !isAntiAdblock(c.classification)).toBe(true);
  });

  it('treats an ordinary modal as a generic dialog with no fix', () => {
    html(
      `<dialog id="dlg" open style="position:fixed;z-index:100"><h2>Newsletter</h2><p>Get our weekly digest.</p><button>Close</button></dialog>`,
    );
    layout.set($('#dlg'), [440, 250, 400, 300]);
    const result = scan();
    expect(top(result)!.classification).toBe('generic-dialog');
    expect(result.ordinaryDialogs).toBe(1);
    expect(top(result)!.fixable).toBe(false);
  });

  it('does not treat a positioned app shell containing the page as an overlay', () => {
    html(`<div id="app" style="position:fixed;z-index:1"><main><p>${'Content. '.repeat(30)}</p>
      <div id="notice">Please disable your ad blocker to support us.</div></main></div>`);
    layout.fullscreen($('#app'));
    const result = scan();
    expect(result.candidates.some((c) => c.el === $('#app'))).toBe(false);
  });

  it('vetoes fixes for elements containing payment fields', () => {
    html(`<div id="wall" style="position:fixed;z-index:9999"><p>Ad blocker detected. Disable your ad blocker.</p>
      <input autocomplete="cc-number"></div>`);
    layout.fullscreen($('#wall'));
    expect(top(scan())!.vetoes.map((v) => v.id)).toContain('payment-field');
  });
});

describe('media players', () => {
  it('detects a warning shown in a video player inside the article, without offering a fix', () => {
    html(`<main><h1>Highlights</h1>
      <div class="player" id="player"><video src="x.mp4"></video>
        <div class="player-error"><p>This video can't play because an ad blocker is enabled.</p>
        <p>Please disable your ad blocker to watch this video.</p></div></div></main>`);
    const c = scan().candidates.find((x) => isAntiAdblock(x.classification))!;
    expect(c.classification).toBe('anti-adblock-inline');
    expect(c.signals.map((s) => s.id)).toContain('media-player');
    expect(c.signals.map((s) => s.id)).not.toContain('in-article');
    expect(c.level).not.toBe('none');
    expect(c.fixable).toBe(false);
  });
});

describe('compatibility rules', () => {
  it('raises confidence for elements matching an enabled user rule', () => {
    html(
      `<div id="custom-wall" style="position:fixed;z-index:9999"><p>Support us: please help.</p></div>`,
    );
    layout.fullscreen($('#custom-wall'));
    const c = top(
      scan([{ id: 'r-1', selector: '#custom-wall', ruleType: 'cosmetic-overlay', confidence: 95 }]),
    )!;
    expect(c.ruleId).toBe('r-1');
    expect(c.confidence).toBe(95);
    expect(c.fixable).toBe(true);
  });

  it('does not let a rule override safety vetoes', () => {
    html(`<div id="login-wall" style="position:fixed;z-index:9999"><input type="password"></div>`);
    layout.fullscreen($('#login-wall'));
    const c = top(
      scan([{ id: 'r-2', selector: '#login-wall', ruleType: 'cosmetic-overlay', confidence: 99 }]),
    )!;
    expect(c.fixable).toBe(false);
  });

  it('skips rules that match too many elements', () => {
    html(`<p class="x">a</p><p class="x">b</p><p class="x">c</p><p class="x">d</p>`);
    const result = scan([{ id: 'r-3', selector: '.x', ruleType: 'cosmetic-hide', confidence: 95 }]);
    expect(result.rulesSkipped[0]?.id).toBe('r-3');
  });
});

describe('page state', () => {
  it('detects blurred content and inert regions', () => {
    html(`<div id="content" style="filter: blur(4px)">Text</div><div id="side" inert>Side</div>`);
    const result = scan();
    expect(result.page.blurred).toContain($('#content'));
    expect(result.page.inert).toContain($('#side'));
  });

  it('does not report scroll lock when the document fits the viewport', () => {
    html(`<p>Short</p>`);
    document.body.style.overflowY = 'hidden';
    layout.docHeight = 600;
    expect(scan().page.scrollLocked).toBe(false);
  });
});
