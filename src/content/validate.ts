import type { ToContent } from '../shared/messages';
import type { ScanTrigger } from '../shared/schemas';

const TRIGGERS: ReadonlySet<ScanTrigger> = new Set(['popup', 'manual', 'monitor', 'mutation']);
const CANDIDATE_ID = /^c\d{1,6}$/;

export function parseToContent(input: unknown): ToContent | null {
  if (!input || typeof input !== 'object') return null;
  const msg = input as Record<string, unknown>;
  switch (msg.type) {
    case 'cs/ping':
    case 'cs/state':
    case 'cs/revertFix':
    case 'cs/configChanged':
      return { type: msg.type };
    case 'cs/scan':
      return typeof msg.trigger === 'string' && TRIGGERS.has(msg.trigger as ScanTrigger)
        ? { type: 'cs/scan', trigger: msg.trigger as ScanTrigger }
        : null;
    case 'cs/previewFix':
    case 'cs/applyFix':
      return typeof msg.candidateId === 'string' && CANDIDATE_ID.test(msg.candidateId)
        ? { type: msg.type, candidateId: msg.candidateId }
        : null;
    default:
      return null;
  }
}
