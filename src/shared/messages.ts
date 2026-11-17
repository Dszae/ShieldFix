import { z } from 'zod';
import {
  DetectionReportSchema,
  DomainSchema,
  FixActionSummarySchema,
  RuleIdSchema,
  RuleInputSchema,
  ScanTriggerSchema,
  SettingsPatchSchema,
  SitePatchSchema,
  type DetectionReport,
  type FixActionSummary,
  type HistoryEntry,
  type Rule,
  type Settings,
  type SiteRecord,
} from './schemas';
import type { UrlInfo } from './domain';
import { errorEnvelope, fail, type Envelope } from './envelope';

/* ------------------------------------------------------------------ */
/* Extension pages (popup, dashboard) -> background                    */
/* ------------------------------------------------------------------ */

const TabId = z.number().int().min(0);
const CandidateId = z.string().regex(/^c\d{1,6}$/);

export const UiRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tab/state'), tabId: TabId }),
  z.object({ type: z.literal('tab/scan'), tabId: TabId, trigger: z.enum(['popup', 'manual']) }),
  z.object({ type: z.literal('tab/previewFix'), tabId: TabId, candidateId: CandidateId }),
  z.object({
    type: z.literal('tab/applyFix'),
    tabId: TabId,
    candidateId: CandidateId,
    remember: z.boolean(),
  }),
  z.object({ type: z.literal('tab/revertFix'), tabId: TabId, forget: z.boolean() }),
  z.object({ type: z.literal('sites/list') }),
  z.object({ type: z.literal('site/update'), hostname: DomainSchema, patch: SitePatchSchema }),
  z.object({ type: z.literal('site/remove'), hostname: DomainSchema }),
  z.object({ type: z.literal('sites/reset') }),
  z.object({ type: z.literal('history/list') }),
  z.object({ type: z.literal('history/clear') }),
  z.object({ type: z.literal('rules/list') }),
  z.object({ type: z.literal('rules/upsert'), rule: RuleInputSchema }),
  z.object({ type: z.literal('rules/delete'), id: RuleIdSchema }),
  z.object({ type: z.literal('rules/setEnabled'), id: RuleIdSchema, enabled: z.boolean() }),
  z.object({ type: z.literal('rules/rollback'), id: RuleIdSchema }),
  z.object({ type: z.literal('rules/import'), payload: z.unknown() }),
  z.object({ type: z.literal('rules/export') }),
  z.object({ type: z.literal('settings/get') }),
  z.object({ type: z.literal('settings/update'), patch: SettingsPatchSchema }),
  z.object({ type: z.literal('monitoring/sync') }),
  z.object({ type: z.literal('app/info') }),
  z.object({ type: z.literal('onboarding/complete') }),
  z.object({ type: z.literal('data/reset') }),
  z.object({
    type: z.literal('brave/open'),
    page: z.enum(['shields', 'content-filtering']),
  }),
]);
export type UiRequest = z.infer<typeof UiRequestSchema>;

export interface TabState {
  tabId: number;
  url: UrlInfo;
  site: SiteRecord | null;
  report: DetectionReport | null;
  settings: Settings;
  monitoringActive: boolean;
  hasSitePermission: boolean;
  rulesForSite: number;
}

export interface FixPreview {
  candidateId: string;
  actions: FixActionSummary[];
  canRemember: boolean;
  rememberSelector: string | null;
}

export interface FixOutcome {
  applied: boolean;
  verified: { overlayHidden: boolean; scrollRestored: boolean | null };
  message: string;
  report: DetectionReport;
  ruleSaved: boolean;
}

export interface RevertOutcome {
  reverted: boolean;
  message: string;
  report: DetectionReport | null;
}

export interface ImportOutcome {
  imported: number;
  duplicates: number;
  rejected: { index: number; reason: string }[];
}

export interface AppInfo {
  version: string;
  monitoringMode: 'on-demand' | 'selected-sites' | 'all-sites';
  monitoredHosts: string[];
  allSitesPermission: boolean;
  grantedOrigins: string[];
  onboardingCompleted: boolean;
}

export interface RuleWithHistory extends Rule {
  previousVersions: number;
  expired: boolean;
}

export interface UiResponseMap {
  'tab/state': TabState;
  'tab/scan': DetectionReport;
  'tab/previewFix': FixPreview;
  'tab/applyFix': FixOutcome;
  'tab/revertFix': RevertOutcome;
  'sites/list': SiteRecord[];
  'site/update': SiteRecord;
  'site/remove': null;
  'sites/reset': null;
  'history/list': HistoryEntry[];
  'history/clear': null;
  'rules/list': RuleWithHistory[];
  'rules/upsert': Rule;
  'rules/delete': null;
  'rules/setEnabled': Rule;
  'rules/rollback': Rule;
  'rules/import': ImportOutcome;
  'rules/export': {
    format: 'shieldfix-rules';
    formatVersion: 1;
    exportedAt: number;
    rules: Rule[];
  };
  'settings/get': Settings;
  'settings/update': Settings;
  'monitoring/sync': AppInfo;
  'app/info': AppInfo;
  'onboarding/complete': null;
  'data/reset': null;
  'brave/open': { opened: string };
}

/* ------------------------------------------------------------------ */
/* Content script -> background                                        */
/* ------------------------------------------------------------------ */

export const ContentRequestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('content/config') }),
  z.object({ type: z.literal('content/report'), report: DetectionReportSchema }),
  z.object({
    type: z.literal('content/fixEvent'),
    event: z.enum(['applied', 'auto-applied', 'reverted']),
    report: DetectionReportSchema,
  }),
  z.object({ type: z.literal('content/openPopup') }),
]);
export type ContentRequest = z.infer<typeof ContentRequestSchema>;

export interface ContentRuleConfig {
  id: string;
  selector: string;
  ruleType: 'cosmetic-overlay' | 'cosmetic-hide';
  confidence: number;
}

export interface ContentConfig {
  hostname: string;
  monitoring: boolean;
  autoFix: boolean;
  autoApplyRemembered: boolean;
  showInPageNotice: boolean;
  rules: ContentRuleConfig[];
}

export interface ContentResponseMap {
  'content/config': ContentConfig;
  'content/report': null;
  'content/fixEvent': null;
  'content/openPopup': { opened: boolean };
}

/* ------------------------------------------------------------------ */
/* Background -> content script                                        */
/* ------------------------------------------------------------------ */

export const ToContentSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cs/ping') }),
  z.object({ type: z.literal('cs/scan'), trigger: ScanTriggerSchema }),
  z.object({ type: z.literal('cs/state') }),
  z.object({ type: z.literal('cs/previewFix'), candidateId: CandidateId }),
  z.object({ type: z.literal('cs/applyFix'), candidateId: CandidateId }),
  z.object({ type: z.literal('cs/revertFix') }),
  z.object({ type: z.literal('cs/configChanged') }),
]);
export type ToContent = z.infer<typeof ToContentSchema>;

export const ContentFixPreviewSchema = z.object({
  candidateId: z.string(),
  actions: z.array(FixActionSummarySchema),
  selector: z.string().nullable(),
});
export type ContentFixPreview = z.infer<typeof ContentFixPreviewSchema>;

export const ContentFixResultSchema = z.object({
  applied: z.boolean(),
  verified: z.object({ overlayHidden: z.boolean(), scrollRestored: z.boolean().nullable() }),
  message: z.string(),
  selector: z.string().nullable(),
  report: DetectionReportSchema,
});
export type ContentFixResult = z.infer<typeof ContentFixResultSchema>;

export const ContentRevertResultSchema = z.object({
  reverted: z.boolean(),
  message: z.string(),
  report: DetectionReportSchema.nullable(),
});
export type ContentRevertResult = z.infer<typeof ContentRevertResultSchema>;

export interface ToContentResponseMap {
  'cs/ping': { alive: true; monitoring: boolean };
  'cs/scan': DetectionReport;
  'cs/state': DetectionReport | null;
  'cs/previewFix': ContentFixPreview;
  'cs/applyFix': ContentFixResult;
  'cs/revertFix': ContentRevertResult;
  'cs/configChanged': null;
}

/* ------------------------------------------------------------------ */
/* Envelope                                                            */
/* ------------------------------------------------------------------ */

export { ShieldFixError, ok, fail, type ErrorCode, type Envelope } from './envelope';

export function toEnvelopeError(err: unknown): Envelope<never> {
  if (err instanceof z.ZodError) {
    return fail('invalid-request', err.issues.map((i) => i.message).join('; '));
  }
  return errorEnvelope(err);
}
