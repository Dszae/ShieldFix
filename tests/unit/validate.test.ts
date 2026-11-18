import { describe, expect, it } from 'vitest';
import { parseToContent } from '../../src/content/validate';
import { ToContentSchema } from '../../src/shared/messages';

const samples: unknown[] = [
  { type: 'cs/ping' },
  { type: 'cs/state' },
  { type: 'cs/revertFix' },
  { type: 'cs/configChanged' },
  { type: 'cs/scan', trigger: 'popup' },
  { type: 'cs/scan', trigger: 'mutation' },
  { type: 'cs/scan', trigger: 'evil' },
  { type: 'cs/scan' },
  { type: 'cs/applyFix', candidateId: 'c12' },
  { type: 'cs/applyFix', candidateId: 'c' },
  { type: 'cs/applyFix', candidateId: 'c1234567' },
  { type: 'cs/applyFix', candidateId: '<img>' },
  { type: 'cs/previewFix', candidateId: 'c3' },
  { type: 'cs/previewFix', candidateId: 3 },
  { type: 'cs/unknown' },
  { type: 'tab/scan', tabId: 1, trigger: 'popup' },
  null,
  'cs/ping',
  42,
  [],
];

describe('parseToContent', () => {
  it.each(samples.map((s) => [JSON.stringify(s), s]))(
    'agrees with ToContentSchema for %s',
    (_label, sample) => {
      const zod = ToContentSchema.safeParse(sample);
      const parsed = parseToContent(sample);
      expect(parsed !== null).toBe(zod.success);
      if (zod.success) expect(parsed).toEqual(zod.data);
    },
  );

  it('drops unexpected extra fields', () => {
    expect(parseToContent({ type: 'cs/ping', extra: 'x' })).toEqual({ type: 'cs/ping' });
  });
});
