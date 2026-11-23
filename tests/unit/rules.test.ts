import { describe, expect, it } from 'vitest';
import {
  createRule,
  isExpired,
  parseRulesImport,
  reviseRule,
  rulesForHost,
  toContentRules,
} from '../../src/compat/rules';
import { RuleSchema } from '../../src/shared/schemas';

const NOW = 1_700_000_000_000;

describe('rule creation', () => {
  it('creates a validated, versioned rule', () => {
    const rule = createRule(
      { domain: 'WWW.Example.com', selector: ' .adblock-wall ', enabled: true },
      'user',
      NOW,
    );
    expect(RuleSchema.safeParse(rule).success).toBe(true);
    expect(rule).toMatchObject({
      domain: 'example.com',
      selector: '.adblock-wall',
      ruleType: 'cosmetic-overlay',
      confidence: 95,
      enabled: true,
      source: 'user',
      version: 1,
      expiresAt: null,
    });
    expect(rule.id).toMatch(/^r-[0-9a-f]{24}$/);
  });

  it('never enables non-user rules on creation', () => {
    expect(
      createRule({ domain: 'example.com', selector: '.x', enabled: true }, 'community', NOW)
        .enabled,
    ).toBe(false);
  });

  it('rejects unsafe selectors and invalid domains', () => {
    expect(() => createRule({ domain: 'example.com', selector: 'body' }, 'user', NOW)).toThrow();
    expect(() => createRule({ domain: 'not a domain', selector: '.x' }, 'user', NOW)).toThrow();
  });

  it('revises with an incremented version', () => {
    const r1 = createRule({ domain: 'example.com', selector: '.a' }, 'user', NOW);
    const r2 = reviseRule(r1, { domain: 'example.com', selector: '.b', enabled: true }, NOW + 1);
    expect(r2).toMatchObject({
      id: r1.id,
      version: 2,
      selector: '.b',
      createdAt: NOW,
      updatedAt: NOW + 1,
    });
  });
});

describe('matching and expiry', () => {
  const active = createRule({ domain: 'example.com', selector: '.a', enabled: true }, 'user', NOW);
  const disabled = createRule(
    { domain: 'example.com', selector: '.b', enabled: false },
    'user',
    NOW,
  );
  const expired = createRule(
    { domain: 'example.com', selector: '.c', enabled: true, expiresAt: NOW - 1 },
    'user',
    NOW,
  );
  const other = createRule({ domain: 'other.org', selector: '.d', enabled: true }, 'user', NOW);

  it('selects rules for a host and its subdomains, skipping expired ones', () => {
    expect(
      rulesForHost([active, disabled, expired, other], 'news.example.com', NOW).map(
        (r) => r.selector,
      ),
    ).toEqual(['.a', '.b']);
    expect(isExpired(expired, NOW)).toBe(true);
  });

  it('only sends enabled rules to the page', () => {
    expect(
      toContentRules([active, disabled, expired], 'example.com', NOW).map((r) => r.selector),
    ).toEqual(['.a']);
  });
});

describe('import', () => {
  it('validates every rule and forces them disabled', () => {
    const parsed = parseRulesImport({
      format: 'shieldfix-rules',
      formatVersion: 1,
      rules: [
        {
          domain: 'example.com',
          selector: '.adblock-wall',
          enabled: true,
          id: 'evil-id-123',
          source: 'user',
        },
        { domain: 'example.com', selector: 'body' },
        'not an object',
        { domain: 'bad domain', selector: '.x' },
      ],
    });
    expect(parsed.accepted).toHaveLength(1);
    expect(parsed.accepted[0]!.index).toBe(0);
    expect(parsed.accepted[0]!.rule).toMatchObject({ enabled: false, selector: '.adblock-wall' });
    expect(parsed.accepted[0]!.rule).not.toHaveProperty('id');
    expect(parsed.rejected.map((r) => r.index)).toEqual([1, 2, 3]);
  });

  it('rejects files in an unknown format', () => {
    expect(parseRulesImport({ rules: [] }).rejected[0]?.index).toBe(-1);
    expect(parseRulesImport(null).accepted).toEqual([]);
  });
});
