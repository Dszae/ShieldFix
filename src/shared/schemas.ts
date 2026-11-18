import { z } from 'zod';
import { checkSelectorSafety } from '../compat/selectorSafety';
import { isValidHostname, normalizeHostname } from './domain';

export const DetectionLevelSchema = z.enum(['none', 'possible', 'likely', 'high']);
export type DetectionLevel = z.infer<typeof DetectionLevelSchema>;

export const ClassificationSchema = z.enum([
  'anti-adblock-overlay',
  'anti-adblock-banner',
  'anti-adblock-inline',
  'consent-dialog',
  'login-dialog',
  'subscription-prompt',
  'age-gate',
  'generic-dialog',
  'unknown',
]);
export type Classification = z.infer<typeof ClassificationSchema>;

export const SignalSchema = z.object({
  id: z.string().max(64),
  label: z.string().max(200),
  weight: z.number(),
});
export type Signal = z.infer<typeof SignalSchema>;

export const VetoSchema = z.object({
  id: z.string().max(64),
  label: z.string().max(200),
});
export type Veto = z.infer<typeof VetoSchema>;

export const CandidateSummarySchema = z.object({
  id: z.string().max(32),
  classification: ClassificationSchema,
  confidence: z.number().min(0).max(100),
  level: DetectionLevelSchema,
  signals: z.array(SignalSchema).max(40),
  vetoes: z.array(VetoSchema).max(20),
  fixable: z.boolean(),
  fixBlockedReason: z.string().max(300).nullable(),
  descriptor: z.string().max(200),
  ruleId: z.string().max(64).nullable(),
  geometry: z.enum(['fullscreen', 'modal', 'banner', 'inline']),
});
export type CandidateSummary = z.infer<typeof CandidateSummarySchema>;

export const ResourceCategorySchema = z.enum(['ad-tracking', 'first-party', 'third-party']);
export type ResourceCategory = z.infer<typeof ResourceCategorySchema>;

export const BlockedResourcesSchema = z.object({
  method: z.enum(['error-events', 'heuristic']),
  reliable: z.boolean(),
  total: z.number().int().min(0),
  adTracking: z.number().int().min(0),
  firstParty: z.number().int().min(0),
  otherThirdParty: z.number().int().min(0),
  hosts: z
    .array(
      z.object({
        host: z.string().max(253),
        count: z.number().int().min(0),
        category: ResourceCategorySchema,
        kinds: z.array(z.enum(['script', 'stylesheet', 'image', 'other'])).max(4),
      }),
    )
    .max(25),
});
export type BlockedResources = z.infer<typeof BlockedResourcesSchema>;

export const PageSignalsSchema = z.object({
  scrollLocked: z.boolean(),
  blurredElements: z.number().int().min(0),
  inertElements: z.number().int().min(0),
  videoErrors: z.number().int().min(0),
  blockedResources: BlockedResourcesSchema,
});
export type PageSignals = z.infer<typeof PageSignalsSchema>;

export const FixActionKindSchema = z.enum([
  'hide',
  'close-dialog',
  'unlock-scroll',
  'unfix-body',
  'remove-filter',
  'restore-pointer',
  'remove-inert',
]);
export type FixActionKind = z.infer<typeof FixActionKindSchema>;

export const FixActionSummarySchema = z.object({
  kind: FixActionKindSchema,
  description: z.string().max(300),
});
export type FixActionSummary = z.infer<typeof FixActionSummarySchema>;

export const FixStateSchema = z.object({
  active: z.boolean(),
  candidateId: z.string().nullable(),
  appliedAt: z.number().nullable(),
  auto: z.boolean(),
  actions: z.array(FixActionSummarySchema).max(30),
  reassertions: z.number().int().min(0),
  reapplications: z.number().int().min(0),
});
export type FixState = z.infer<typeof FixStateSchema>;

export const ScanTriggerSchema = z.enum(['popup', 'manual', 'monitor', 'mutation']);
export type ScanTrigger = z.infer<typeof ScanTriggerSchema>;

export const PageIssueSchema = z.object({
  id: z.enum(['video-error-with-blocked-ads', 'first-party-blocked', 'scroll-locked']),
  label: z.string().max(300),
  confidence: z.number().min(0).max(100),
});
export type PageIssue = z.infer<typeof PageIssueSchema>;

export const DetectionReportSchema = z.object({
  hostname: z.string().max(253),
  scannedAt: z.number(),
  scanMs: z.number().min(0),
  trigger: ScanTriggerSchema,
  level: DetectionLevelSchema,
  confidence: z.number().min(0).max(100),
  primaryCandidateId: z.string().nullable(),
  candidates: z.array(CandidateSummarySchema).max(10),
  ordinaryDialogs: z.number().int().min(0),
  pageIssues: z.array(PageIssueSchema).max(5),
  page: PageSignalsSchema,
  fix: FixStateSchema,
  monitoring: z.boolean(),
});
export type DetectionReport = z.infer<typeof DetectionReportSchema>;

export const DomainSchema = z
  .string()
  .transform((v) => normalizeHostname(v))
  .refine(isValidHostname, { message: 'Enter a valid domain such as example.com.' });

export const SelectorSchema = z
  .string()
  .transform((v) => v.trim())
  .superRefine((value, ctx) => {
    const result = checkSelectorSafety(value);
    if (!result.ok) ctx.addIssue({ code: 'custom', message: result.reason });
  });

export const RuleTypeSchema = z.enum(['cosmetic-overlay', 'cosmetic-hide']);
export type RuleType = z.infer<typeof RuleTypeSchema>;

export const RuleSourceSchema = z.enum(['user', 'community', 'bundled']);
export type RuleSource = z.infer<typeof RuleSourceSchema>;

export const RuleIdSchema = z.string().regex(/^[a-z0-9-]{8,64}$/, 'Invalid rule id.');

export const RuleSchema = z.object({
  id: RuleIdSchema,
  domain: DomainSchema,
  ruleType: RuleTypeSchema,
  selector: SelectorSchema,
  confidence: z.number().int().min(0).max(100),
  enabled: z.boolean(),
  source: RuleSourceSchema,
  version: z.number().int().min(1),
  description: z.string().max(200).default(''),
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0),
  expiresAt: z.number().int().min(0).nullable().default(null),
});
export type Rule = z.infer<typeof RuleSchema>;

export const RuleInputSchema = z.object({
  id: RuleIdSchema.optional(),
  domain: DomainSchema,
  ruleType: RuleTypeSchema.default('cosmetic-overlay'),
  selector: SelectorSchema,
  confidence: z.number().int().min(0).max(100).default(95),
  enabled: z.boolean().default(false),
  description: z.string().max(200).default(''),
  expiresAt: z.number().int().min(0).nullable().default(null),
});
export type RuleInput = z.input<typeof RuleInputSchema>;

export const RulesExportSchema = z.object({
  format: z.literal('shieldfix-rules'),
  formatVersion: z.literal(1),
  exportedAt: z.number().optional(),
  rules: z.array(z.unknown()).max(500),
});

export const ThemeSchema = z.enum(['system', 'light', 'dark']);
export type Theme = z.infer<typeof ThemeSchema>;

const SETTINGS_FIELDS = {
  theme: ThemeSchema,
  scanOnPopupOpen: z.boolean(),
  showInPageNotice: z.boolean(),
  autoApplyRemembered: z.boolean(),
  historyEnabled: z.boolean(),
  historyRetentionDays: z.number().int().min(1).max(365),
  developerMode: z.boolean(),
  monitorAllSites: z.boolean(),
};

export const SettingsSchema = z.object({
  theme: SETTINGS_FIELDS.theme.default('system'),
  scanOnPopupOpen: SETTINGS_FIELDS.scanOnPopupOpen.default(true),
  showInPageNotice: SETTINGS_FIELDS.showInPageNotice.default(true),
  autoApplyRemembered: SETTINGS_FIELDS.autoApplyRemembered.default(true),
  historyEnabled: SETTINGS_FIELDS.historyEnabled.default(true),
  historyRetentionDays: SETTINGS_FIELDS.historyRetentionDays.default(30),
  developerMode: SETTINGS_FIELDS.developerMode.default(false),
  monitorAllSites: SETTINGS_FIELDS.monitorAllSites.default(false),
});
export type Settings = z.infer<typeof SettingsSchema>;
export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

export const SettingsPatchSchema = z.object(SETTINGS_FIELDS).partial().strict();
export type SettingsPatch = z.infer<typeof SettingsPatchSchema>;

export const SiteRecordSchema = z.object({
  hostname: DomainSchema,
  monitor: z.boolean().default(false),
  autoFix: z.boolean().default(false),
  createdAt: z.number().int().min(0),
  updatedAt: z.number().int().min(0),
  lastLevel: DetectionLevelSchema.nullable().default(null),
  lastConfidence: z.number().min(0).max(100).nullable().default(null),
  lastScannedAt: z.number().int().min(0).nullable().default(null),
  detections: z.number().int().min(0).default(0),
  fixesApplied: z.number().int().min(0).default(0),
});
export type SiteRecord = z.infer<typeof SiteRecordSchema>;

export const SitePatchSchema = z
  .object({
    monitor: z.boolean(),
    autoFix: z.boolean(),
  })
  .partial()
  .strict();
export type SitePatch = z.infer<typeof SitePatchSchema>;

export const HistoryEventSchema = z.enum([
  'detected',
  'fix-applied',
  'fix-auto-applied',
  'fix-reverted',
]);
export type HistoryEvent = z.infer<typeof HistoryEventSchema>;

export const HistoryEntrySchema = z.object({
  id: z.string().max(64),
  hostname: DomainSchema,
  at: z.number().int().min(0),
  event: HistoryEventSchema,
  level: DetectionLevelSchema,
  confidence: z.number().min(0).max(100),
  signals: z.array(z.string().max(64)).max(40),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;

export const OnboardingSchema = z.object({
  completed: z.boolean().default(false),
  completedAt: z.number().nullable().default(null),
});
export type Onboarding = z.infer<typeof OnboardingSchema>;
