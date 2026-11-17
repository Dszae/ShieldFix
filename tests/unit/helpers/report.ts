import type { CandidateSummary, DetectionReport } from '../../../src/shared/schemas';

export function candidate(patch: Partial<CandidateSummary> = {}): CandidateSummary {
  return {
    id: 'c1',
    classification: 'anti-adblock-overlay',
    confidence: 96,
    level: 'high',
    signals: [{ id: 'phrase-strong', label: 'x', weight: 50 }],
    vetoes: [],
    fixable: true,
    fixBlockedReason: null,
    descriptor: 'div#wall',
    ruleId: null,
    geometry: 'fullscreen',
    ...patch,
  };
}

export function report(patch: Partial<DetectionReport> = {}): DetectionReport {
  return {
    hostname: 'example.com',
    scannedAt: 1,
    scanMs: 3,
    trigger: 'popup',
    level: 'high',
    confidence: 96,
    primaryCandidateId: 'c1',
    candidates: [candidate()],
    ordinaryDialogs: 0,
    pageIssues: [],
    page: {
      scrollLocked: true,
      blurredElements: 0,
      inertElements: 0,
      videoErrors: 0,
      blockedResources: {
        method: 'heuristic',
        reliable: true,
        total: 0,
        adTracking: 0,
        firstParty: 0,
        otherThirdParty: 0,
        hosts: [],
      },
    },
    fix: {
      active: false,
      candidateId: null,
      appliedAt: null,
      auto: false,
      actions: [],
      reassertions: 0,
      reapplications: 0,
    },
    monitoring: false,
    ...patch,
  };
}
