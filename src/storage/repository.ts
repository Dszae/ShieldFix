import { z } from 'zod';
import { LIMITS } from '../shared/constants';
import { normalizeHostname } from '../shared/domain';
import { ShieldFixError, type ImportOutcome, type RuleWithHistory } from '../shared/messages';
import {
  DEFAULT_SETTINGS,
  HistoryEntrySchema,
  OnboardingSchema,
  RuleSchema,
  SettingsSchema,
  SiteRecordSchema,
  type HistoryEntry,
  type Onboarding,
  type Rule,
  type RuleInput,
  type Settings,
  type SettingsPatch,
  type SitePatch,
  type SiteRecord,
} from '../shared/schemas';
import { createRule, isExpired, parseRulesImport, reviseRule } from '../compat/rules';
import { Mutex, type StorageArea } from './area';

export const SCHEMA_VERSION = 1;

const KEYS = {
  schemaVersion: 'schemaVersion',
  settings: 'settings',
  sites: 'sites',
  rules: 'rules',
  ruleHistory: 'ruleHistory',
  history: 'history',
  onboarding: 'onboarding',
} as const;

type Clock = () => number;

export class Repository {
  private readonly mutex = new Mutex();

  constructor(
    private readonly area: StorageArea,
    private readonly now: Clock = Date.now,
  ) {}

  async migrate(): Promise<void> {
    await this.mutex.run(async () => {
      const raw = await this.area.get([KEYS.schemaVersion]);
      const version = typeof raw[KEYS.schemaVersion] === 'number' ? raw[KEYS.schemaVersion] : 0;
      if (version === SCHEMA_VERSION) return;
      await this.area.set({ [KEYS.schemaVersion]: SCHEMA_VERSION });
    });
  }

  async resetAll(): Promise<void> {
    await this.mutex.run(async () => {
      await this.area.clear();
      await this.area.set({ [KEYS.schemaVersion]: SCHEMA_VERSION });
    });
  }

  async getSettings(): Promise<Settings> {
    const raw = await this.area.get([KEYS.settings]);
    const parsed = SettingsSchema.safeParse(raw[KEYS.settings] ?? {});
    return parsed.success ? parsed.data : { ...DEFAULT_SETTINGS };
  }

  async updateSettings(patch: SettingsPatch): Promise<Settings> {
    return this.mutex.run(async () => {
      const next = SettingsSchema.parse({ ...(await this.getSettings()), ...patch });
      await this.area.set({ [KEYS.settings]: next });
      if (patch.historyEnabled === false) await this.area.set({ [KEYS.history]: [] });
      return next;
    });
  }

  private async readSites(): Promise<Record<string, SiteRecord>> {
    const raw = (await this.area.get([KEYS.sites]))[KEYS.sites];
    const out: Record<string, SiteRecord> = {};
    if (raw && typeof raw === 'object') {
      for (const value of Object.values(raw as Record<string, unknown>)) {
        const parsed = SiteRecordSchema.safeParse(value);
        if (parsed.success) out[parsed.data.hostname] = parsed.data;
      }
    }
    return out;
  }

  async listSites(): Promise<SiteRecord[]> {
    const sites = await this.readSites();
    return Object.values(sites).sort(
      (a, b) => (b.lastScannedAt ?? b.updatedAt) - (a.lastScannedAt ?? a.updatedAt),
    );
  }

  async getSite(hostname: string): Promise<SiteRecord | null> {
    return (await this.readSites())[normalizeHostname(hostname)] ?? null;
  }

  private blankSite(hostname: string): SiteRecord {
    const now = this.now();
    return SiteRecordSchema.parse({ hostname, createdAt: now, updatedAt: now });
  }

  async updateSite(hostname: string, patch: SitePatch): Promise<SiteRecord> {
    return this.mutex.run(async () => {
      const host = normalizeHostname(hostname);
      const sites = await this.readSites();
      const next = SiteRecordSchema.parse({
        ...(sites[host] ?? this.blankSite(host)),
        ...patch,
        updatedAt: this.now(),
      });
      sites[host] = next;
      await this.area.set({ [KEYS.sites]: sites });
      return next;
    });
  }

  async recordScan(
    hostname: string,
    scan: { level: SiteRecord['lastLevel']; confidence: number; fixApplied?: boolean },
  ): Promise<void> {
    await this.mutex.run(async () => {
      const host = normalizeHostname(hostname);
      const settings = await this.getSettings();
      const sites = await this.readSites();
      const existing = sites[host];
      const detected = scan.level !== null && scan.level !== 'none';
      if (!existing && (!settings.historyEnabled || (!detected && !scan.fixApplied))) return;
      const base = existing ?? this.blankSite(host);
      sites[host] = SiteRecordSchema.parse({
        ...base,
        lastLevel: scan.level,
        lastConfidence: scan.confidence,
        lastScannedAt: this.now(),
        detections: base.detections + (detected && !scan.fixApplied ? 1 : 0),
        fixesApplied: base.fixesApplied + (scan.fixApplied ? 1 : 0),
      });
      await this.area.set({ [KEYS.sites]: sites });
    });
  }

  async removeSite(hostname: string): Promise<void> {
    await this.mutex.run(async () => {
      const sites = await this.readSites();
      delete sites[normalizeHostname(hostname)];
      await this.area.set({ [KEYS.sites]: sites });
    });
  }

  async resetSites(): Promise<void> {
    await this.mutex.run(() => this.area.set({ [KEYS.sites]: {} }));
  }

  private async readRules(): Promise<Rule[]> {
    const raw = (await this.area.get([KEYS.rules]))[KEYS.rules];
    if (!Array.isArray(raw)) return [];
    return raw.flatMap((r) => {
      const parsed = RuleSchema.safeParse(r);
      return parsed.success ? [parsed.data] : [];
    });
  }

  private async readRuleHistory(): Promise<Record<string, Rule[]>> {
    const raw = (await this.area.get([KEYS.ruleHistory]))[KEYS.ruleHistory];
    const out: Record<string, Rule[]> = {};
    if (raw && typeof raw === 'object') {
      for (const [id, versions] of Object.entries(raw as Record<string, unknown>)) {
        const parsed = z.array(RuleSchema).safeParse(versions);
        if (parsed.success) out[id] = parsed.data;
      }
    }
    return out;
  }

  async listRules(): Promise<RuleWithHistory[]> {
    const [rules, history] = await Promise.all([this.readRules(), this.readRuleHistory()]);
    const now = this.now();
    return rules.map((r) => ({
      ...r,
      previousVersions: history[r.id]?.length ?? 0,
      expired: isExpired(r, now),
    }));
  }

  async getRules(): Promise<Rule[]> {
    return this.readRules();
  }

  async upsertRule(input: RuleInput, source: Rule['source'] = 'user'): Promise<Rule> {
    return this.mutex.run(async () => {
      const rules = await this.readRules();
      const now = this.now();
      const index = input.id ? rules.findIndex((r) => r.id === input.id) : -1;
      if (index === -1) {
        if (rules.length >= LIMITS.maxRules) {
          throw new ShieldFixError('refused', `You can store at most ${LIMITS.maxRules} rules.`);
        }
        const rule = createRule({ ...input, id: undefined }, source, now);
        rules.push(rule);
        await this.area.set({ [KEYS.rules]: rules });
        return rule;
      }
      const existing = rules[index]!;
      const next = reviseRule(existing, input, now);
      rules[index] = next;
      const history = await this.readRuleHistory();
      history[existing.id] = [existing, ...(history[existing.id] ?? [])].slice(
        0,
        LIMITS.ruleHistoryDepth,
      );
      await this.area.set({ [KEYS.rules]: rules, [KEYS.ruleHistory]: history });
      return next;
    });
  }

  async setRuleEnabled(id: string, enabled: boolean): Promise<Rule> {
    return this.mutex.run(async () => {
      const rules = await this.readRules();
      const rule = rules.find((r) => r.id === id);
      if (!rule) throw new ShieldFixError('not-found', 'Rule not found.');
      rule.enabled = enabled;
      rule.updatedAt = this.now();
      await this.area.set({ [KEYS.rules]: rules });
      return rule;
    });
  }

  async rollbackRule(id: string): Promise<Rule> {
    return this.mutex.run(async () => {
      const rules = await this.readRules();
      const index = rules.findIndex((r) => r.id === id);
      if (index === -1) throw new ShieldFixError('not-found', 'Rule not found.');
      const history = await this.readRuleHistory();
      const [previous, ...rest] = history[id] ?? [];
      if (!previous) throw new ShieldFixError('refused', 'This rule has no earlier version.');
      const restored: Rule = { ...previous, updatedAt: this.now() };
      rules[index] = restored;
      history[id] = rest;
      await this.area.set({ [KEYS.rules]: rules, [KEYS.ruleHistory]: history });
      return restored;
    });
  }

  async deleteRule(id: string): Promise<void> {
    await this.mutex.run(async () => {
      const rules = await this.readRules();
      const history = await this.readRuleHistory();
      delete history[id];
      await this.area.set({
        [KEYS.rules]: rules.filter((r) => r.id !== id),
        [KEYS.ruleHistory]: history,
      });
    });
  }

  async purgeExpiredRules(): Promise<number> {
    return this.mutex.run(async () => {
      const rules = await this.readRules();
      const now = this.now();
      const kept = rules.filter((r) => !isExpired(r, now));
      if (kept.length !== rules.length) await this.area.set({ [KEYS.rules]: kept });
      return rules.length - kept.length;
    });
  }

  async importRules(payload: unknown): Promise<ImportOutcome> {
    const parsed = parseRulesImport(payload);
    return this.mutex.run(async () => {
      const rules = await this.readRules();
      const now = this.now();
      let imported = 0;
      let duplicates = 0;
      const rejected = [...parsed.rejected];
      for (const { index, rule: input } of parsed.accepted) {
        const rule = createRule(input, 'community', now);
        if (rules.some((r) => r.domain === rule.domain && r.selector === rule.selector)) {
          duplicates++;
          continue;
        }
        // Past the limit each remaining rule is reported, so the outcome
        // accounts for every rule in the file instead of dropping the rest.
        if (rules.length >= LIMITS.maxRules) {
          rejected.push({
            index,
            reason: `Not imported: you can store at most ${LIMITS.maxRules} rules.`,
          });
          continue;
        }
        rules.push(rule);
        imported++;
      }
      await this.area.set({ [KEYS.rules]: rules });
      rejected.sort((a, b) => a.index - b.index);
      return { imported, duplicates, rejected };
    });
  }

  async exportRules(): Promise<{
    format: 'shieldfix-rules';
    formatVersion: 1;
    exportedAt: number;
    rules: Rule[];
  }> {
    return {
      format: 'shieldfix-rules',
      formatVersion: 1,
      exportedAt: this.now(),
      rules: await this.readRules(),
    };
  }

  async listHistory(): Promise<HistoryEntry[]> {
    const raw = (await this.area.get([KEYS.history]))[KEYS.history];
    if (!Array.isArray(raw)) return [];
    const settings = await this.getSettings();
    const cutoff = this.now() - settings.historyRetentionDays * 86_400_000;
    return raw
      .flatMap((e) => {
        const parsed = HistoryEntrySchema.safeParse(e);
        return parsed.success ? [parsed.data] : [];
      })
      .filter((e) => e.at >= cutoff)
      .sort((a, b) => b.at - a.at);
  }

  async addHistory(entry: Omit<HistoryEntry, 'id' | 'at'>): Promise<HistoryEntry | null> {
    return this.mutex.run(async () => {
      const settings = await this.getSettings();
      if (!settings.historyEnabled) return null;
      const record = HistoryEntrySchema.parse({
        ...entry,
        id: `h-${this.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        at: this.now(),
      });
      const existing = await this.listHistory();
      const next = [record, ...existing].slice(0, LIMITS.historyMaxEntries);
      await this.area.set({ [KEYS.history]: next });
      return record;
    });
  }

  async clearHistory(): Promise<void> {
    await this.mutex.run(() => this.area.set({ [KEYS.history]: [] }));
  }

  async getOnboarding(): Promise<Onboarding> {
    const raw = (await this.area.get([KEYS.onboarding]))[KEYS.onboarding];
    const parsed = OnboardingSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : { completed: false, completedAt: null };
  }

  async completeOnboarding(): Promise<void> {
    await this.mutex.run(() =>
      this.area.set({ [KEYS.onboarding]: { completed: true, completedAt: this.now() } }),
    );
  }
}
