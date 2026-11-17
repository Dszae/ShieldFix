/**
 * Hostname utilities. ShieldFix keys all site data by hostname (with a leading
 * "www." removed). Full URLs, paths and query strings are never stored.
 */

const HOSTNAME_RE = /^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]{2,63}$/;

/** Common multi-label public suffixes. Not a full Public Suffix List — see docs/ARCHITECTURE.md. */
const MULTI_PART_SUFFIXES = new Set([
  'co.uk',
  'org.uk',
  'ac.uk',
  'gov.uk',
  'me.uk',
  'com.au',
  'net.au',
  'org.au',
  'edu.au',
  'gov.au',
  'co.nz',
  'co.jp',
  'ne.jp',
  'or.jp',
  'co.kr',
  'co.in',
  'net.in',
  'org.in',
  'com.br',
  'com.mx',
  'com.ar',
  'com.tr',
  'com.cn',
  'com.hk',
  'com.sg',
  'com.tw',
  'co.za',
  'co.il',
  'com.pl',
  'com.ua',
]);

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

export function isValidHostname(value: string): boolean {
  if (IPV4_RE.test(value)) return value.split('.').every((n) => Number(n) <= 255);
  return HOSTNAME_RE.test(value);
}

/** Lower-case, strip a trailing dot and a leading "www.". */
export function normalizeHostname(hostname: string): string {
  let host = hostname.trim().toLowerCase();
  if (host.endsWith('.')) host = host.slice(0, -1);
  if (host.startsWith('www.')) host = host.slice(4);
  return host;
}

export interface UrlInfo {
  supported: boolean;
  hostname: string | null;
  reason: string | null;
}

const RESTRICTED_HOSTS = ['chromewebstore.google.com', 'chrome.google.com'];

/** Decide whether ShieldFix can work on a URL (http/https pages only). */
export function describeUrl(url: string | undefined | null): UrlInfo {
  if (!url) return { supported: false, hostname: null, reason: 'No page is open in this tab.' };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { supported: false, hostname: null, reason: 'This address could not be read.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      supported: false,
      hostname: null,
      reason: 'Browser pages and local files cannot be scanned by extensions.',
    };
  }
  const hostname = normalizeHostname(parsed.hostname);
  if (RESTRICTED_HOSTS.includes(hostname)) {
    return {
      supported: false,
      hostname,
      reason: 'The browser does not allow extensions to run on the extension store.',
    };
  }
  return { supported: true, hostname, reason: null };
}

/** True when `host` equals `domain` or is a subdomain of it. */
export function hostMatchesDomain(host: string, domain: string): boolean {
  const h = normalizeHostname(host);
  const d = normalizeHostname(domain);
  return h === d || h.endsWith(`.${d}`);
}

/** Match patterns covering a site and its subdomains, for permissions and content scripts. */
export function originPatternsFor(hostname: string): string[] {
  const host = normalizeHostname(hostname);
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return [`*://${host}/*`];
  return [`*://${host}/*`, `*://*.${host}/*`];
}

/** Approximate registrable domain ("site"), used only to label resources first/third-party. */
export function approximateSite(hostname: string): string {
  const labels = normalizeHostname(hostname).split('.');
  if (labels.length <= 2) return labels.join('.');
  if (/^\d+$/.test(labels[labels.length - 1] ?? '')) return labels.join('.'); // IPv4
  const lastTwo = labels.slice(-2).join('.');
  if (MULTI_PART_SUFFIXES.has(lastTwo)) return labels.slice(-3).join('.');
  return lastTwo;
}

export function isSameSite(a: string, b: string): boolean {
  return approximateSite(a) === approximateSite(b);
}
