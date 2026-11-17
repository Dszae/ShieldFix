import { isSameSite, normalizeHostname } from '../shared/domain';
import type { BlockedResources, ResourceCategory } from '../shared/schemas';
import { isAdTrackingHost } from './adHosts';

/**
 * Failed / blocked resource analysis.
 *
 * Browsers do not expose to extensions *why* a request failed, so ShieldFix uses
 * two evidence sources:
 *  - `error-events`: when the content script runs at document_start on monitored
 *    sites, it records `error` events for scripts, stylesheets and images.
 *  - `heuristic`: for on-demand scans, it compares script elements with the
 *    Resource Timing buffer (blocked requests have no timing entry) and checks
 *    images that finished without decoding. This is approximate and is labelled
 *    as such in the UI.
 * Only hostnames are reported; URLs and paths are discarded.
 */

export type ResourceKind = 'script' | 'stylesheet' | 'image' | 'other';

export interface FailedResource {
  host: string;
  kind: ResourceKind;
}

const EXECUTABLE_SCRIPT_TYPES = new Set([
  '',
  'text/javascript',
  'application/javascript',
  'module',
  'text/ecmascript',
  'application/ecmascript',
]);

export class ResourceErrorRecorder {
  private readonly failures: FailedResource[] = [];
  private listener: ((e: Event) => void) | null = null;

  start(win: Window): void {
    if (this.listener) return;
    this.listener = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const failure = describeFailedElement(target, win.location.href);
      if (failure && this.failures.length < 500) this.failures.push(failure);
    };
    win.addEventListener('error', this.listener, true);
  }

  stop(win: Window): void {
    if (this.listener) win.removeEventListener('error', this.listener, true);
    this.listener = null;
  }

  get active(): boolean {
    return this.listener !== null;
  }

  snapshot(): FailedResource[] {
    return [...this.failures];
  }
}

function hostOf(url: string, base: string): string | null {
  try {
    const u = new URL(url, base);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return normalizeHostname(u.hostname);
  } catch {
    return null;
  }
}

function describeFailedElement(el: Element, base: string): FailedResource | null {
  if (el instanceof HTMLScriptElement && el.src) {
    const host = hostOf(el.src, base);
    return host ? { host, kind: 'script' } : null;
  }
  if (el instanceof HTMLLinkElement && el.href && /stylesheet/i.test(el.rel)) {
    const host = hostOf(el.href, base);
    return host ? { host, kind: 'stylesheet' } : null;
  }
  if (el instanceof HTMLImageElement && (el.currentSrc || el.src)) {
    const host = hostOf(el.currentSrc || el.src, base);
    return host ? { host, kind: 'image' } : null;
  }
  return null;
}

const RESOURCE_TIMING_DEFAULT_BUFFER = 250;

/** Heuristic for pages scanned after load (no error events captured). */
export function heuristicFailures(win: Window): { failures: FailedResource[]; reliable: boolean } {
  const doc = win.document;
  const base = win.location.href;
  const entries = win.performance?.getEntriesByType?.('resource') ?? [];
  const reliable = entries.length > 0 && entries.length < RESOURCE_TIMING_DEFAULT_BUFFER;
  const loaded = new Set(entries.map((e) => e.name));
  const failures: FailedResource[] = [];

  if (entries.length > 0) {
    const scripts = Array.from(doc.querySelectorAll<HTMLScriptElement>('script[src]')).slice(
      0,
      400,
    );
    for (const script of scripts) {
      const type = (script.getAttribute('type') ?? '').trim().toLowerCase();
      if (!EXECUTABLE_SCRIPT_TYPES.has(type)) continue; // consent-gated or data scripts
      let abs: string;
      try {
        abs = new URL(script.src, base).href;
      } catch {
        continue;
      }
      if (!/^https?:/.test(abs)) continue;
      if (!loaded.has(abs)) {
        const host = hostOf(abs, base);
        if (host) failures.push({ host, kind: 'script' });
      }
    }
  }

  const images = Array.from(doc.querySelectorAll('img')).slice(0, 400);
  for (const img of images) {
    const src = img.currentSrc || img.src;
    if (!src || img.loading === 'lazy') continue;
    if (img.complete && img.naturalWidth === 0) {
      const host = hostOf(src, base);
      if (host) failures.push({ host, kind: 'image' });
    }
  }
  return { failures, reliable };
}

export function summarizeFailures(
  failures: FailedResource[],
  pageHost: string,
  method: BlockedResources['method'],
  reliable: boolean,
): BlockedResources {
  const byHost = new Map<
    string,
    { count: number; kinds: Set<ResourceKind>; category: ResourceCategory }
  >();
  for (const f of failures) {
    let entry = byHost.get(f.host);
    if (!entry) {
      const category: ResourceCategory = isAdTrackingHost(f.host)
        ? 'ad-tracking'
        : isSameSite(f.host, pageHost)
          ? 'first-party'
          : 'third-party';
      entry = { count: 0, kinds: new Set(), category };
      byHost.set(f.host, entry);
    }
    entry.count++;
    entry.kinds.add(f.kind);
  }
  let adTracking = 0;
  let firstParty = 0;
  let otherThirdParty = 0;
  for (const e of byHost.values()) {
    if (e.category === 'ad-tracking') adTracking += e.count;
    else if (e.category === 'first-party') firstParty += e.count;
    else otherThirdParty += e.count;
  }
  const order: Record<ResourceCategory, number> = {
    'first-party': 0,
    'third-party': 1,
    'ad-tracking': 2,
  };
  const hosts = Array.from(byHost.entries())
    .map(([host, e]) => ({
      host,
      count: e.count,
      category: e.category,
      kinds: Array.from(e.kinds),
    }))
    .sort((a, b) => order[a.category] - order[b.category] || b.count - a.count)
    .slice(0, 25);
  return {
    method,
    reliable,
    total: failures.length,
    adTracking,
    firstParty,
    otherThirdParty,
    hosts,
  };
}
