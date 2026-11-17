/** Confidence thresholds (initial engineering defaults — see docs/ARCHITECTURE.md). */
export const THRESHOLDS = {
  possible: 40,
  likely: 70,
  high: 90,
} as const;

/** A cosmetic fix is only offered at or above this confidence. */
export const FIX_THRESHOLD = THRESHOLDS.high;

export const LIMITS = {
  historyMaxEntries: 500,
  ruleHistoryDepth: 5,
  maxRules: 500,
  maxRuleMatches: 3,
  maxCandidatesReported: 10,
  maxTextChars: 4000,
  maxScanTextChars: 400_000,
  /** How long the monitor keeps observing DOM mutations after page load (ms). */
  observeWindowMs: 120_000,
  /** Minimum time between mutation-triggered rescans (ms). */
  rescanThrottleMs: 1_000,
  mutationDebounceMs: 350,
  maxMutationScans: 30,
  maxFixReassertions: 50,
  maxFixReapplications: 10,
} as const;

export const MONITOR_SCRIPT_ID = 'shieldfix-monitor';
export const CONTENT_SCRIPT_FILE = 'content.js';

/** Host patterns declared in manifest `optional_host_permissions`. */
export const ALL_SITES_ORIGINS = ['http://*/*', 'https://*/*'] as const;

export const NOTICE_HOST_ATTR = 'data-shieldfix-ui';
