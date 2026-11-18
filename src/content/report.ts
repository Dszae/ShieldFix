import { LIMITS } from '../shared/constants';
import type {
  BlockedResources,
  CandidateSummary,
  DetectionReport,
  FixState,
  PageIssue,
  ScanTrigger,
} from '../shared/schemas';
import {
  isAntiAdblock,
  levelFor,
  type CandidateResult,
  type ScanResult,
} from '../detection/engine';

export const EMPTY_FIX: FixState = {
  active: false,
  candidateId: null,
  appliedAt: null,
  auto: false,
  actions: [],
  reassertions: 0,
  reapplications: 0,
};

export function toSummary(c: CandidateResult, id: string): CandidateSummary {
  return {
    id,
    classification: c.classification,
    confidence: c.confidence,
    level: c.level,
    signals: c.signals.slice(0, 40),
    vetoes: c.vetoes.slice(0, 20),
    fixable: c.fixable,
    fixBlockedReason: c.fixBlockedReason,
    descriptor: c.descriptor,
    ruleId: c.ruleId,
    geometry: c.geometry,
  };
}

export interface BuildReportInput {
  hostname: string;
  trigger: ScanTrigger;
  scanMs: number;
  scan: ScanResult;
  idFor: (el: Element) => string;
  resources: BlockedResources;
  fix: FixState;
  fixedCandidate: CandidateSummary | null;
  monitoring: boolean;
  now: number;
}

export function pageIssuesFor(
  scan: ScanResult,
  resources: BlockedResources,
  hasPrimary: boolean,
): PageIssue[] {
  const issues: PageIssue[] = [];
  if (scan.page.videoErrors > 0 && resources.adTracking > 0) {
    issues.push({
      id: 'video-error-with-blocked-ads',
      label:
        'A video failed to load while advertising resources were blocked. Some players depend on ad scripts.',
      confidence: 45,
    });
  }
  if (resources.method === 'error-events' && resources.firstParty > 0) {
    issues.push({
      id: 'first-party-blocked',
      label: `${resources.firstParty} resource${resources.firstParty === 1 ? '' : 's'} from this site failed to load. The site may not work fully.`,
      confidence: 40,
    });
  }
  if (scan.page.scrollLocked && !hasPrimary) {
    issues.push({
      id: 'scroll-locked',
      label: 'Page scrolling is disabled, but no warning overlay was identified.',
      confidence: 20,
    });
  }
  return issues;
}

export function buildReport(input: BuildReportInput): DetectionReport {
  const relevant = input.scan.candidates.filter((c) => c.classification !== 'unknown');
  const summaries = relevant
    .slice(0, LIMITS.maxCandidatesReported)
    .map((c) => toSummary(c, input.idFor(c.el)));
  if (input.fixedCandidate && !summaries.some((s) => s.id === input.fixedCandidate!.id)) {
    summaries.unshift(input.fixedCandidate);
    if (summaries.length > LIMITS.maxCandidatesReported) summaries.pop();
  }
  const primary =
    input.fixedCandidate ??
    summaries.find((s) => isAntiAdblock(s.classification) && s.level !== 'none') ??
    null;
  const pageIssues = pageIssuesFor(input.scan, input.resources, primary !== null);
  const confidence = Math.max(primary?.confidence ?? 0, ...pageIssues.map((i) => i.confidence), 0);

  return {
    hostname: input.hostname,
    scannedAt: input.now,
    scanMs: Math.round(input.scanMs * 10) / 10,
    trigger: input.trigger,
    level: levelFor(confidence),
    confidence,
    primaryCandidateId: primary?.id ?? null,
    candidates: summaries,
    ordinaryDialogs: input.scan.ordinaryDialogs,
    pageIssues,
    page: {
      scrollLocked: input.scan.page.scrollLocked,
      blurredElements: input.scan.page.blurred.length,
      inertElements: input.scan.page.inert.length,
      videoErrors: input.scan.page.videoErrors,
      blockedResources: input.resources,
    },
    fix: input.fix,
    monitoring: input.monitoring,
  };
}
