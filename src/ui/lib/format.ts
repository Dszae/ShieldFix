import type { Classification, DetectionLevel, HistoryEvent } from '../../shared/schemas';

export type Tone = 'neutral' | 'ok' | 'warn' | 'danger' | 'info' | 'accent';

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  'anti-adblock-overlay': 'Anti-adblock overlay',
  'anti-adblock-banner': 'Anti-adblock banner',
  'anti-adblock-inline': 'Anti-adblock notice',
  'consent-dialog': 'Cookie or consent dialog',
  'login-dialog': 'Sign-in dialog',
  'subscription-prompt': 'Subscription prompt',
  'age-gate': 'Age verification',
  'generic-dialog': 'Ordinary website dialog',
  unknown: 'Unclassified element',
};

export const LEVEL_LABEL: Record<DetectionLevel, string> = {
  none: 'No issue',
  possible: 'Possible issue',
  likely: 'Likely warning',
  high: 'High confidence',
};

export const LEVEL_TONE: Record<DetectionLevel, Tone> = {
  none: 'ok',
  possible: 'info',
  likely: 'warn',
  high: 'danger',
};

export const EVENT_LABEL: Record<HistoryEvent, string> = {
  detected: 'Detected',
  'fix-applied': 'Fix applied',
  'fix-auto-applied': 'Saved fix applied',
  'fix-reverted': 'Fix undone',
};

export function relativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const s = Math.round(diff / 1000);
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(ts).toLocaleDateString();
}

export function dateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n} ${n === 1 ? word : pluralWord}`;
}
