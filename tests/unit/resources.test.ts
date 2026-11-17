import { describe, expect, it } from 'vitest';
import { summarizeFailures } from '../../src/detection/resources';
import { pageIssuesFor } from '../../src/content/report';
import type { ScanResult } from '../../src/detection/engine';

describe('summarizeFailures', () => {
  it('groups by host and classifies first-party, third-party and ad/tracking resources', () => {
    const s = summarizeFailures(
      [
        { host: 'securepubads.g.doubleclick.net', kind: 'script' },
        { host: 'securepubads.g.doubleclick.net', kind: 'image' },
        { host: 'static.example.com', kind: 'script' },
        { host: 'cdn.thirdparty.io', kind: 'stylesheet' },
      ],
      'example.com',
      'error-events',
      true,
    );
    expect(s).toMatchObject({ total: 4, adTracking: 2, firstParty: 1, otherThirdParty: 1 });
    expect(s.hosts[0]).toMatchObject({ host: 'static.example.com', category: 'first-party' });
    expect(s.hosts.find((h) => h.host.includes('doubleclick'))!.kinds.sort()).toEqual([
      'image',
      'script',
    ]);
  });
});

describe('pageIssuesFor', () => {
  const scan = (patch: Partial<ScanResult['page']> = {}): ScanResult => ({
    candidates: [],
    ordinaryDialogs: 0,
    rulesSkipped: [],
    page: {
      scrollLocked: false,
      blurred: [],
      inert: [],
      pointerBlocked: [],
      videoErrors: 0,
      ...patch,
    },
  });
  const res = (patch = {}) => ({
    method: 'error-events' as const,
    reliable: true,
    total: 0,
    adTracking: 0,
    firstParty: 0,
    otherThirdParty: 0,
    hosts: [],
    ...patch,
  });

  it('flags video errors with blocked ad resources as a possible issue', () => {
    const issues = pageIssuesFor(scan({ videoErrors: 1 }), res({ adTracking: 2, total: 2 }), false);
    expect(issues.map((i) => i.id)).toContain('video-error-with-blocked-ads');
  });

  it('only flags first-party failures when they were observed directly', () => {
    expect(pageIssuesFor(scan(), res({ firstParty: 1 }), false).map((i) => i.id)).toContain(
      'first-party-blocked',
    );
    expect(pageIssuesFor(scan(), res({ firstParty: 1, method: 'heuristic' }), false)).toEqual([]);
  });
});
