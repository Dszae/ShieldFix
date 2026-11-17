import { z } from 'zod';
import { LIMITS } from '../shared/constants';
import { hostMatchesDomain } from '../shared/domain';
import {
  RuleInputSchema,
  RuleSchema,
  RulesExportSchema,
  type Rule,
  type RuleInput,
  type RuleSource,
} from '../shared/schemas';
import type { ContentRuleConfig } from '../shared/messages';

/**
 * Compatibility rule engine (pure functions; persistence lives in the repository).
 *
 * Rules are declarative: a domain, a validated CSS selector and a cosmetic rule
 * type. They never contain code. Imported and community rules always arrive
 * disabled and must be enabled by the user.
 */

export function newRuleId(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `r-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function isExpired(rule: Rule, now: number): boolean {
  return rule.expiresAt !== null && rule.expiresAt <= now;
}

export function createRule(input: RuleInput, source: RuleSource, now: number): Rule {
  const parsed = RuleInputSchema.parse(input);
  return RuleSchema.parse({
    id: parsed.id ?? newRuleId(),
    domain: parsed.domain,
    ruleType: parsed.ruleType,
    selector: parsed.selector,
    confidence: parsed.confidence,
    enabled: source === 'user' ? parsed.enabled : false,
    source,
    version: 1,
    description: parsed.description,
    createdAt: now,
    updatedAt: now,
    expiresAt: parsed.expiresAt,
  });
}

/** Produces the next version of a rule. The caller archives the previous one. */
export function reviseRule(existing: Rule, input: RuleInput, now: number): Rule {
  const parsed = RuleInputSchema.parse(input);
  return RuleSchema.parse({
    ...existing,
    domain: parsed.domain,
    ruleType: parsed.ruleType,
    selector: parsed.selector,
    confidence: parsed.confidence,
    enabled: parsed.enabled,
    description: parsed.description,
    expiresAt: parsed.expiresAt,
    version: existing.version + 1,
    updatedAt: now,
  });
}

export function rulesForHost(rules: Rule[], host: string, now: number): Rule[] {
  return rules.filter((r) => !isExpired(r, now) && hostMatchesDomain(host, r.domain));
}

export function toContentRules(rules: Rule[], host: string, now: number): ContentRuleConfig[] {
  return rulesForHost(rules, host, now)
    .filter((r) => r.enabled)
    .map((r) => ({
      id: r.id,
      selector: r.selector,
      ruleType: r.ruleType,
      confidence: r.confidence,
    }));
}

export interface ParsedImport {
  accepted: RuleInput[];
  rejected: { index: number; reason: string }[];
}

/** Validate an exported rules file. Every rule is re-validated individually. */
export function parseRulesImport(payload: unknown): ParsedImport {
  const envelope = RulesExportSchema.safeParse(payload);
  if (!envelope.success) {
    return {
      accepted: [],
      rejected: [
        {
          index: -1,
          reason: 'Not a ShieldFix rules file (expected format "shieldfix-rules", version 1).',
        },
      ],
    };
  }
  const accepted: RuleInput[] = [];
  const rejected: ParsedImport['rejected'] = [];
  envelope.data.rules.slice(0, LIMITS.maxRules).forEach((raw, index) => {
    const candidate = z
      .object({
        domain: z.unknown(),
        ruleType: z.unknown().optional(),
        selector: z.unknown(),
        confidence: z.unknown().optional(),
        description: z.unknown().optional(),
        expiresAt: z.unknown().optional(),
      })
      .safeParse(raw);
    if (!candidate.success) {
      rejected.push({ index, reason: 'Rule is not an object.' });
      return;
    }
    // Imported rules never carry their enabled state or id across.
    const result = RuleInputSchema.safeParse({ ...candidate.data, enabled: false });
    if (result.success) accepted.push(result.data);
    else rejected.push({ index, reason: result.error.issues.map((i) => i.message).join('; ') });
  });
  return { accepted, rejected };
}
