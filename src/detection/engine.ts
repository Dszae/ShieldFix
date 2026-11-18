import { FIX_THRESHOLD, LIMITS, THRESHOLDS } from '../shared/constants';
import type { Classification, DetectionLevel, Signal, Veto } from '../shared/schemas';
import type { ContentRuleConfig } from '../shared/messages';
import {
  colorAlpha,
  describeElement,
  intersectArea,
  isRendered,
  zIndexOf,
  type LayoutProbe,
} from './layout';
import {
  AGE_GATE_RE,
  ANTI_ADBLOCK_ATTR_RE,
  ATTRIBUTE_SEED_SELECTOR,
  CONSENT_RE,
  CTA_RE,
  DIALOG_SEED_SELECTOR,
  LOGIN_RE,
  MENTION_RE,
  NEGATED_RE,
  SKIP_TEXT_PARENTS,
  STRONG_PHRASES,
  SUBSCRIPTION_RE,
  VENDOR_SIGNATURES,
  normalizeText,
} from './signatures';

export type Geometry = 'fullscreen' | 'modal' | 'banner' | 'inline';

export interface CandidateResult {
  el: Element;
  backdrops: Element[];
  geometry: Geometry;
  classification: Classification;
  confidence: number;
  level: DetectionLevel;
  signals: Signal[];
  vetoes: Veto[];
  fixable: boolean;
  fixBlockedReason: string | null;
  ruleId: string | null;
  descriptor: string;
}

export interface PageState {
  scrollLocked: boolean;
  blurred: Element[];
  inert: Element[];
  pointerBlocked: Element[];
  videoErrors: number;
}

export interface ScanResult {
  candidates: CandidateResult[];
  page: PageState;
  ordinaryDialogs: number;
  rulesSkipped: { id: string; reason: string }[];
}

export interface ScanOptions {
  doc: Document;
  probe: LayoutProbe;
  ignore?: (el: Element) => boolean;
  rules?: ContentRuleConfig[];
  lateInserted?: WeakSet<Element>;
}

interface SeedInfo {
  ruleIds: Set<string>;
  vendor: string | null;
}

export function levelFor(confidence: number): DetectionLevel {
  if (confidence >= THRESHOLDS.high) return 'high';
  if (confidence >= THRESHOLDS.likely) return 'likely';
  if (confidence >= THRESHOLDS.possible) return 'possible';
  return 'none';
}

export function isAntiAdblock(c: Classification): boolean {
  return c.startsWith('anti-adblock');
}

function addSeed(seeds: Map<Element, SeedInfo>, el: Element, patch?: Partial<SeedInfo>): void {
  let info = seeds.get(el);
  if (!info) {
    info = { ruleIds: new Set(), vendor: null };
    seeds.set(el, info);
  }
  if (patch?.vendor) info.vendor = patch.vendor;
  patch?.ruleIds?.forEach((id) => info.ruleIds.add(id));
}

function collectSeeds(
  opts: ScanOptions,
  rulesSkipped: ScanResult['rulesSkipped'],
): Map<Element, SeedInfo> {
  const { doc, probe } = opts;
  const ignore = opts.ignore ?? (() => false);
  const seeds = new Map<Element, SeedInfo>();
  const body = doc.body;
  if (!body) return seeds;

  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let chars = 0;
  let textSeeds = 0;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const data = (node as Text).data;
    chars += data.length;
    if (chars > LIMITS.maxScanTextChars || textSeeds > 200) break;
    if (data.length < 5) continue;
    const parent = node.parentElement;
    if (!parent || SKIP_TEXT_PARENTS.has(parent.tagName.toUpperCase())) continue;
    if (MENTION_RE.test(data) && !ignore(parent)) {
      addSeed(seeds, parent);
      textSeeds++;
    }
  }

  const attrMatches = Array.from(doc.querySelectorAll(ATTRIBUTE_SEED_SELECTOR)).slice(0, 100);
  for (const el of attrMatches) if (!ignore(el)) addSeed(seeds, el);

  const dialogs = Array.from(doc.querySelectorAll(DIALOG_SEED_SELECTOR)).slice(0, 50);
  for (const el of dialogs) if (!ignore(el)) addSeed(seeds, el);

  const { width: vw, height: vh } = probe.viewport();
  const points: [number, number][] = [
    [0.5, 0.5],
    [0.5, 0.25],
    [0.5, 0.75],
    [0.25, 0.5],
    [0.75, 0.5],
  ];
  for (const [fx, fy] of points) {
    const stack = probe.elementsAtPoint(vw * fx, vh * fy);
    const top = stack.find((el) => el !== doc.documentElement && el !== body && !ignore(el));
    if (top) addSeed(seeds, top);
  }

  for (const v of VENDOR_SIGNATURES) {
    for (const el of Array.from(doc.querySelectorAll(v.selector)).slice(0, 3)) {
      if (!ignore(el)) addSeed(seeds, el, { vendor: v.id });
    }
  }

  for (const rule of opts.rules ?? []) {
    let matches: Element[];
    try {
      matches = Array.from(doc.querySelectorAll(rule.selector));
    } catch {
      rulesSkipped.push({ id: rule.id, reason: 'Invalid selector.' });
      continue;
    }
    if (matches.length > LIMITS.maxRuleMatches) {
      rulesSkipped.push({ id: rule.id, reason: `Selector matched ${matches.length} elements.` });
      continue;
    }
    for (const el of matches) if (!ignore(el)) addSeed(seeds, el, { ruleIds: new Set([rule.id]) });
  }
  return seeds;
}

function isDialogLike(el: Element): boolean {
  return (
    el.tagName === 'DIALOG' ||
    el.getAttribute('role') === 'dialog' ||
    el.getAttribute('role') === 'alertdialog' ||
    el.getAttribute('aria-modal') === 'true'
  );
}

let textLengthMemo = new Map<Element, number>();
let shellMemo = new Map<Element, boolean>();

function textLength(el: Element): number {
  let n = textLengthMemo.get(el);
  if (n === undefined) {
    n = el.textContent?.length ?? 0;
    textLengthMemo.set(el, n);
  }
  return n;
}

function isContentShell(el: Element): boolean {
  let shell = shellMemo.get(el);
  if (shell === undefined) {
    shell =
      el.matches('main, article, [role="main"]') ||
      !!el.querySelector('main, article, [role="main"]') ||
      textLength(el) > 8000 ||
      el.getElementsByTagName('*').length > 1500;
    shellMemo.set(el, shell);
  }
  return shell;
}

function resolveRoot(seed: Element, opts: ScanOptions): Element | null {
  const { doc, probe } = opts;
  const html = doc.documentElement;
  const body = doc.body;
  const positioned: Element[] = [];
  let dialog: Element | null = null;
  let largeAbsolute: Element | null = null;
  const { width: vw, height: vh } = probe.viewport();

  let el: Element | null = seed;
  for (let depth = 0; el && el !== body && el !== html && depth < 25; depth++) {
    const pos = probe.style(el).position;
    if (pos === 'fixed' || pos === 'sticky') positioned.push(el);
    else if (pos === 'absolute' && !largeAbsolute) {
      const coverage = intersectArea(probe.rect(el), vw, vh) / Math.max(1, vw * vh);
      if (coverage >= 0.5) largeAbsolute = el;
    }
    if (!dialog && isDialogLike(el)) dialog = el;
    el = el.parentElement;
  }

  for (let i = positioned.length - 1; i >= 0; i--) {
    const candidate = positioned[i]!;
    if (isRendered(candidate, probe) && !isContentShell(candidate)) return candidate;
  }
  if (largeAbsolute && !isContentShell(largeAbsolute)) return largeAbsolute;
  if (dialog && !isContentShell(dialog)) return dialog;

  let root: Element = seed;
  for (let depth = 0; depth < 4; depth++) {
    const parent: Element | null = root.parentElement;
    if (!parent || parent === body || parent === html) break;
    if (textLength(parent) > 600 || isContentShell(parent)) break;
    root = parent;
  }
  return root === body || root === html ? null : root;
}

function geometryOf(el: Element, probe: LayoutProbe): { geometry: Geometry; z: number } {
  const s = probe.style(el);
  const pos = s.position;
  const r = probe.rect(el);
  const { width: vw, height: vh } = probe.viewport();
  const coverage = intersectArea(r, vw, vh) / Math.max(1, vw * vh);
  const fixedLike = pos === 'fixed' || pos === 'sticky';
  const z = zIndexOf(el, probe);
  if ((fixedLike || pos === 'absolute') && coverage >= 0.6) return { geometry: 'fullscreen', z };
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  const centered = Math.abs(cx - vw / 2) < vw * 0.2 && Math.abs(cy - vh / 2) < vh * 0.25;
  if (
    (pos === 'fixed' || (pos === 'absolute' && isDialogLike(el))) &&
    coverage >= 0.03 &&
    centered
  ) {
    return { geometry: 'modal', z };
  }
  if (
    fixedLike &&
    r.width >= vw * 0.6 &&
    r.height <= vh * 0.35 &&
    (r.y <= 8 || r.y + r.height >= vh - 8)
  ) {
    return { geometry: 'banner', z };
  }
  return { geometry: 'inline', z };
}

function attributeText(el: Element): string {
  return `${el.id} ${el.getAttribute('class') ?? ''}`;
}

function hasAntiAdblockAttribute(root: Element): boolean {
  if (ANTI_ADBLOCK_ATTR_RE.test(attributeText(root))) return true;
  const descendants = root.querySelectorAll('[class],[id]');
  const limit = Math.min(descendants.length, 80);
  for (let i = 0; i < limit; i++) {
    if (ANTI_ADBLOCK_ATTR_RE.test(attributeText(descendants[i]!))) return true;
  }
  return false;
}

function hasCallToAction(root: Element): boolean {
  const controls = Array.from(
    root.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"]'),
  ).slice(0, 20);
  return controls.some((c) => {
    const text = c instanceof HTMLInputElement ? c.value : (c.textContent ?? '');
    return CTA_RE.test(normalizeText(text));
  });
}

const FIELD_SELECTOR =
  'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="image"]):not([type="reset"]), select, textarea';
const PAYMENT_SELECTOR =
  'input[autocomplete^="cc-"], input[name*="cardnumber" i], input[name*="card-number" i], iframe[src*="stripe" i], iframe[src*="paypal" i], iframe[src*="braintree" i]';

function findBackdrops(root: Element, opts: ScanOptions): Element[] {
  const { doc, probe } = opts;
  const ignore = opts.ignore ?? (() => false);
  const { width: vw, height: vh } = probe.viewport();
  const pool = new Set<Element>();
  for (const el of Array.from(root.parentElement?.children ?? [])) pool.add(el);
  for (const el of Array.from(doc.body?.children ?? []).slice(0, 100)) pool.add(el);
  const result: Element[] = [];
  for (const el of pool) {
    if (result.length >= 3) break;
    if (el === root || el.contains(root) || root.contains(el) || ignore(el)) continue;
    const s = probe.style(el);
    if (s.position !== 'fixed') continue;
    if (!isRendered(el, probe)) continue;
    const coverage = intersectArea(probe.rect(el), vw, vh) / Math.max(1, vw * vh);
    if (coverage < 0.9) continue;
    if ((el.textContent?.trim().length ?? 0) > 40) continue;
    if (el.querySelector('a, button, input, select, textarea, iframe, video')) continue;
    if (el.getElementsByTagName('*').length > 20) continue;
    const alpha = colorAlpha(s.backgroundColor);
    const opacity = Number.parseFloat(s.opacity || '1');
    const hasBackdropFilter = !!s.backdropFilter && s.backdropFilter !== 'none';
    if (alpha < 0.05 && !hasBackdropFilter) continue;
    if (alpha >= 0.99 && opacity >= 0.99 && !hasBackdropFilter) continue;
    result.push(el);
  }
  return result;
}

interface ScoreContext {
  opts: ScanOptions;
  page: PageState;
  seed: SeedInfo;
}

function scoreRoot(root: Element, ctx: ScoreContext): CandidateResult {
  const { probe } = ctx.opts;
  const signals: Signal[] = [];
  const vetoes: Veto[] = [];
  const add = (id: string, label: string, weight: number) => signals.push({ id, label, weight });

  const text = normalizeText(probe.text(root, LIMITS.maxTextChars));
  const fullLength = textLength(root);
  const { geometry, z } = geometryOf(root, probe);
  const isOverlay = geometry === 'fullscreen' || geometry === 'modal';

  const strong = STRONG_PHRASES.filter((p) => p.re.test(text));
  if (strong.length > 0) {
    add('phrase-strong', strong[0]!.label, 50);
    strong.slice(1, 3).forEach((p) => add(`phrase-extra-${p.id}`, p.label, 8));
  }
  const mention = strong.length === 0 && MENTION_RE.test(text);
  if (mention) add('phrase-mention', 'Mentions ad blocking or privacy tools', 15);

  const attr = hasAntiAdblockAttribute(root);
  if (attr) add('attr-pattern', 'Anti-adblock class or id names', 20);

  const vendor = ctx.seed.vendor
    ? VENDOR_SIGNATURES.find((v) => v.id === ctx.seed.vendor)
    : undefined;
  if (vendor) add('vendor-signature', vendor.label, 30);

  if (geometry === 'fullscreen') add('geometry-fullscreen', 'Covers most of the screen', 20);
  else if (geometry === 'modal') add('geometry-modal', 'Centered modal window', 12);
  else if (geometry === 'banner') add('geometry-banner', 'Fixed banner at the screen edge', 10);

  if (geometry !== 'inline' && z >= 1000) add('high-z-index', 'Stacked above page content', 5);
  if (isOverlay && ctx.page.scrollLocked) add('scroll-lock', 'Page scrolling is disabled', 10);

  const backdrops = isOverlay ? findBackdrops(root, ctx.opts) : [];
  if (backdrops.length > 0) add('backdrop', 'Separate dimming backdrop', 6);
  if (isOverlay && ctx.page.blurred.length > 0) add('page-blur', 'Page content is blurred', 5);

  const anyEvidence = strong.length > 0 || mention || attr || !!vendor;
  if (anyEvidence && hasCallToAction(root)) add('cta', 'Buttons such as "I\'ve disabled it"', 8);
  if (geometry !== 'inline' && ctx.opts.lateInserted && isLate(root, ctx.opts.lateInserted)) {
    add('late-insert', 'Appeared after the page loaded', 5);
  }

  const media = root.querySelector('video, audio, iframe, canvas, object, embed');
  if (media && strong.length > 0) add('media-player', 'Shown in a media player', 10);
  const failedVideo = Array.from(root.querySelectorAll('video')).some((v) => v.error !== null);
  if (failedVideo) add('video-error', 'The video failed to load', 10);

  if (NEGATED_RE.test(text)) add('negated', 'Says ad blockers are fine', -40);

  const consent = CONSENT_RE.test(text);
  const login = LOGIN_RE.test(text);
  const subscription = SUBSCRIPTION_RE.test(text);
  const ageGate = AGE_GATE_RE.test(text);

  if (consent) {
    if (strong.length === 0) add('consent-language', 'Cookie / consent wording', -45);
    else vetoes.push({ id: 'consent-content', label: 'Contains consent choices' });
  }
  if (subscription) {
    if (strong.length === 0) add('subscription-language', 'Subscription or paywall wording', -45);
    vetoes.push({ id: 'subscription-prompt', label: 'Contains a subscription offer' });
  }
  if (login && strong.length === 0) add('login-language', 'Sign-in wording', -40);
  if (ageGate) {
    add('age-gate', 'Age verification wording', -30);
    vetoes.push({ id: 'age-gate', label: 'Age verification' });
  }
  if (root.querySelector('input[type="password"]')) {
    vetoes.push({ id: 'credential-field', label: 'Contains a password field' });
  }
  if (root.querySelector(PAYMENT_SELECTOR)) {
    vetoes.push({ id: 'payment-field', label: 'Contains payment fields' });
  }
  const fields = root.querySelectorAll(FIELD_SELECTOR).length;
  if (fields >= 2) {
    add('form-fields', 'Contains a form', -15);
    vetoes.push({ id: 'form', label: 'Contains a form' });
  }
  if (
    root.matches('main, article, [role="main"]') ||
    root.querySelector('main, article, [role="main"]')
  ) {
    vetoes.push({ id: 'main-content', label: 'Contains the main page content' });
  }
  if (fullLength > 1500) add('long-text', 'Long text (likely an article)', -30);
  if (geometry === 'inline' && !media && root.closest('article, main, [role="main"]')) {
    add('in-article', 'Part of the article text', -30);
  }

  let confidence = Math.max(
    0,
    Math.min(
      100,
      signals.reduce((sum, s) => sum + s.weight, 0),
    ),
  );

  let ruleId: string | null = null;
  const ruleConfig = (ctx.opts.rules ?? []).find((r) => ctx.seed.ruleIds.has(r.id));
  if (ruleConfig) {
    ruleId = ruleConfig.id;
    add('user-rule', 'Matches an enabled compatibility rule', 0);
    if (vetoes.length === 0)
      confidence = Math.max(confidence, Math.min(100, ruleConfig.confidence));
  }

  const evidence = anyEvidence || !!ruleId;
  let classification: Classification;
  if (evidence && confidence >= THRESHOLDS.possible && !subscription && !ageGate) {
    classification =
      geometry === 'banner'
        ? 'anti-adblock-banner'
        : isOverlay
          ? 'anti-adblock-overlay'
          : 'anti-adblock-inline';
  } else if (ageGate) classification = 'age-gate';
  else if (subscription) classification = 'subscription-prompt';
  else if (login || root.querySelector('input[type="password"]')) classification = 'login-dialog';
  else if (consent) classification = 'consent-dialog';
  else if ((isOverlay || isDialogLike(root)) && text.length > 0) classification = 'generic-dialog';
  else classification = 'unknown';

  const antiAdblock = isAntiAdblock(classification);
  if (!antiAdblock) confidence = Math.min(confidence, THRESHOLDS.possible - 1);

  let fixBlockedReason: string | null = null;
  if (!antiAdblock) fixBlockedReason = 'Not identified as an anti-adblock warning.';
  else if (vetoes.length > 0)
    fixBlockedReason = `Protected element: ${vetoes[0]!.label.toLowerCase()}.`;
  else if (confidence < FIX_THRESHOLD) {
    fixBlockedReason = `Confidence ${Math.round(confidence)}% is below the ${FIX_THRESHOLD}% required for a fix.`;
  } else if (geometry === 'inline' && fullLength > 1000) {
    fixBlockedReason = 'The element contains too much content to hide safely.';
  }

  return {
    el: root,
    backdrops,
    geometry,
    classification,
    confidence: Math.round(confidence),
    level: levelFor(confidence),
    signals,
    vetoes,
    fixable: fixBlockedReason === null,
    fixBlockedReason,
    ruleId,
    descriptor: describeElement(root),
  };
}

function isLate(el: Element, late: WeakSet<Element>): boolean {
  for (let cur: Element | null = el, i = 0; cur && i < 4; cur = cur.parentElement, i++) {
    if (late.has(cur)) return true;
  }
  return false;
}

export function readPageState(opts: ScanOptions): PageState {
  const { doc, probe } = opts;
  const ignore = opts.ignore ?? (() => false);
  const html = doc.documentElement;
  const body = doc.body;
  const { height: vh } = probe.viewport();
  let scrollLocked = false;
  const overflowLocked = (el: Element) => {
    const s = probe.style(el);
    return ['hidden', 'clip'].includes(s.overflowY) || ['hidden', 'clip'].includes(s.overflow);
  };
  if (body) {
    const docTaller = probe.documentHeight() > vh + 40;
    if ((overflowLocked(html) || overflowLocked(body)) && docTaller) scrollLocked = true;
    const bs = probe.style(body);
    if (bs.position === 'fixed' && Number.parseFloat(bs.top || '0') < 0) scrollLocked = true;
  }

  const blurred: Element[] = [];
  const pointerBlocked: Element[] = [];
  const layer: Element[] = [];
  for (const child of Array.from(body?.children ?? []).slice(0, 60)) {
    layer.push(child);
    for (const grandchild of Array.from(child.children).slice(0, 20)) layer.push(grandchild);
  }
  for (const el of [body, ...layer]) {
    if (!el || ignore(el)) continue;
    const s = probe.style(el);
    if (s.filter && s.filter !== 'none' && s.filter.includes('blur')) blurred.push(el);
    if (
      s.pointerEvents === 'none' &&
      (el === body || el.matches('main, #root, #app, #__next, [role="main"]'))
    ) {
      pointerBlocked.push(el);
    }
  }
  const inert = Array.from(doc.querySelectorAll('[inert]'))
    .filter((el) => !ignore(el))
    .slice(0, 20);
  const videoErrors = Array.from(doc.querySelectorAll('video')).filter(
    (v) => v.error !== null,
  ).length;
  return { scrollLocked, blurred, inert, pointerBlocked, videoErrors };
}

export function scanDocument(opts: ScanOptions): ScanResult {
  textLengthMemo = new Map();
  shellMemo = new Map();
  try {
    return runScan(opts);
  } finally {
    textLengthMemo = new Map();
    shellMemo = new Map();
  }
}

function runScan(opts: ScanOptions): ScanResult {
  const rulesSkipped: ScanResult['rulesSkipped'] = [];
  const page = readPageState(opts);
  const seeds = collectSeeds(opts, rulesSkipped);

  const roots = new Map<Element, SeedInfo>();
  for (const [seed, info] of seeds) {
    if (!seed.isConnected) continue;
    const root = resolveRoot(seed, opts);
    if (!root || !isRendered(root, opts.probe)) continue;
    const existing = roots.get(root);
    if (existing) {
      info.ruleIds.forEach((id) => existing.ruleIds.add(id));
      existing.vendor ??= info.vendor;
    } else {
      roots.set(root, { ruleIds: new Set(info.ruleIds), vendor: info.vendor });
    }
  }

  const rootList = Array.from(roots.keys());
  for (const inner of rootList) {
    const outer = rootList.find((o) => o !== inner && roots.has(o) && o.contains(inner));
    if (outer && roots.has(inner)) {
      const innerInfo = roots.get(inner)!;
      const outerInfo = roots.get(outer)!;
      innerInfo.ruleIds.forEach((id) => outerInfo.ruleIds.add(id));
      outerInfo.vendor ??= innerInfo.vendor;
      roots.delete(inner);
    }
  }

  const scored = Array.from(roots.entries())
    .slice(0, 60)
    .map(([root, seed]) => scoreRoot(root, { opts, page, seed }));

  const warningBackdrops = new Set(
    scored.filter((c) => isAntiAdblock(c.classification)).flatMap((c) => c.backdrops),
  );
  const candidates = scored
    .filter((c) => !warningBackdrops.has(c.el))
    .sort((a, b) => {
      const aa = isAntiAdblock(a.classification) ? 1 : 0;
      const bb = isAntiAdblock(b.classification) ? 1 : 0;
      return bb - aa || b.confidence - a.confidence;
    });

  const ordinaryDialogs = candidates.filter(
    (c) => !isAntiAdblock(c.classification) && c.classification !== 'unknown',
  ).length;

  return { candidates, page, ordinaryDialogs, rulesSkipped };
}
