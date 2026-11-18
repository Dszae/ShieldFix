import type { CandidateSummary, DetectionReport } from '../../shared/schemas';
import { CLASSIFICATION_LABEL, type Tone } from '../lib/format';

export interface StatusView {
  tone: Tone;
  title: string;
  description: string;
  pill: string;
}

export function primaryOf(report: DetectionReport | null): CandidateSummary | null {
  if (!report?.primaryCandidateId) return null;
  return report.candidates.find((c) => c.id === report.primaryCandidateId) ?? null;
}

export function statusFor(report: DetectionReport | null, scanning: boolean): StatusView {
  if (!report) {
    return scanning
      ? {
          tone: 'neutral',
          title: 'Checking this page…',
          description: 'Looking for anti-adblock warnings and blocked content.',
          pill: 'Scanning',
        }
      : {
          tone: 'neutral',
          title: 'Not scanned yet',
          description: 'Run a diagnosis to check this page for compatibility problems.',
          pill: 'Idle',
        };
  }
  const primary = primaryOf(report);
  if (report.fix.active) {
    return {
      tone: 'ok',
      title: report.fix.auto ? 'Saved fix applied' : 'Fix applied',
      description:
        'ShieldFix is hiding an anti-adblock warning on this page. Nothing was deleted — undo restores it.',
      pill: 'Fixed',
    };
  }
  const kind = primary ? CLASSIFICATION_LABEL[primary.classification].toLowerCase() : 'issue';
  switch (report.level) {
    case 'high':
      return {
        tone: 'danger',
        title: primary?.fixable ? 'Action required' : 'Anti-adblock warning detected',
        description: primary?.fixable
          ? `This page shows an ${kind} because of your privacy protection. A reversible fix is available.`
          : `This page shows an ${kind}. No safe automatic fix is available — see the options below.`,
        pill: 'Issue detected',
      };
    case 'likely':
      return {
        tone: 'warn',
        title: 'Compatibility issue detected',
        description: `This page likely shows an ${kind}. Confidence is not high enough for an automatic fix.`,
        pill: 'Likely issue',
      };
    case 'possible':
      return {
        tone: 'info',
        title: 'Possible compatibility issue',
        description:
          report.pageIssues[0]?.label ??
          'Some signals suggest this page reacts to privacy protection. Open the diagnosis for details.',
        pill: 'Possible issue',
      };
    default:
      return {
        tone: 'ok',
        title: 'No issue detected',
        description:
          report.ordinaryDialogs > 0
            ? 'Dialogs on this page look like normal website dialogs, so ShieldFix leaves them alone.'
            : 'Nothing on this page appears to be reacting to your privacy protection.',
        pill: 'Protected',
      };
  }
}
