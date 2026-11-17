import { ALL_SITES_ORIGINS } from '../shared/constants';
import {
  describeUrl,
  hostMatchesDomain,
  isValidHostname,
  normalizeHostname,
  originPatternsFor,
} from '../shared/domain';
import {
  ContentRequestSchema,
  ShieldFixError,
  UiRequestSchema,
  ok,
  fail,
  toEnvelopeError,
  type AppInfo,
  type ContentConfig,
  type ContentRequest,
  type ContentResponseMap,
  type Envelope,
  type FixOutcome,
  type FixPreview,
  type RevertOutcome,
  type TabState,
  type UiRequest,
  type UiResponseMap,
} from '../shared/messages';
import type { DetectionReport, HistoryEvent } from '../shared/schemas';
import { toContentRules } from '../compat/rules';
import type { Repository } from '../storage/repository';
import type { TabStateStore } from './tabState';
import type {
  ActionGateway,
  BadgeGateway,
  PermissionsGateway,
  ScriptsGateway,
  TabsGateway,
} from './gateways';

export interface RouterDeps {
  extensionId: string;
  extensionOrigin: string; // e.g. chrome-extension://<id>/
  version: string;
  repo: Repository;
  tabsState: TabStateStore;
  tabs: TabsGateway;
  permissions: PermissionsGateway;
  scripts: ScriptsGateway;
  badge: BadgeGateway;
  action: ActionGateway;
}

export interface Sender {
  id?: string;
  url?: string;
  frameId?: number;
  tab?: { id?: number };
}

const BRAVE_PAGES: Record<'shields' | 'content-filtering', string[]> = {
  shields: ['brave://settings/shields', 'chrome://settings/shields'],
  'content-filtering': ['brave://settings/shields/filters', 'brave://adblock'],
};

/** "*://example.com/*" -> "example.com"; wildcard-host patterns return null. */
export function hostFromPattern(pattern: string): string | null {
  const m = pattern.match(/^(?:\*|https?):\/\/([^/*]+)\/\*$/);
  if (!m?.[1]) return null;
  const host = normalizeHostname(m[1]);
  return isValidHostname(host) ? host : null;
}

export function createRouter(deps: RouterDeps) {
  const { repo } = deps;

  /* ------------------------------ monitoring ------------------------------ */

  async function computeMonitoring(): Promise<
    Pick<AppInfo, 'monitoringMode' | 'monitoredHosts' | 'allSitesPermission'> & {
      matches: string[];
    }
  > {
    const settings = await repo.getSettings();
    const allSitesPermission = await deps.permissions.contains([...ALL_SITES_ORIGINS]);
    if (settings.monitorAllSites && allSitesPermission) {
      return {
        monitoringMode: 'all-sites',
        monitoredHosts: [],
        allSitesPermission,
        matches: [...ALL_SITES_ORIGINS],
      };
    }
    const sites = await repo.listSites();
    const monitoredHosts: string[] = [];
    const matches: string[] = [];
    for (const site of sites.filter((s) => s.monitor)) {
      const patterns = originPatternsFor(site.hostname);
      if (await deps.permissions.contains(patterns)) {
        monitoredHosts.push(site.hostname);
        matches.push(...patterns);
      }
    }
    return {
      monitoringMode: matches.length > 0 ? 'selected-sites' : 'on-demand',
      monitoredHosts,
      allSitesPermission,
      matches,
    };
  }

  async function syncMonitoring(): Promise<AppInfo> {
    const state = await computeMonitoring();
    const current = await deps.scripts.registeredMatches();
    const same =
      current !== null &&
      current.length === state.matches.length &&
      current.every((m) => state.matches.includes(m));
    if (!same && !(current === null && state.matches.length === 0)) {
      await deps.scripts.setMatches(state.matches);
    }
    return appInfo(state);
  }

  async function appInfo(state?: Awaited<ReturnType<typeof computeMonitoring>>): Promise<AppInfo> {
    const s = state ?? (await computeMonitoring());
    return {
      version: deps.version,
      monitoringMode: s.monitoringMode,
      monitoredHosts: s.monitoredHosts,
      allSitesPermission: s.allSitesPermission,
      grantedOrigins: await deps.permissions.grantedOrigins(),
      onboardingCompleted: (await repo.getOnboarding()).completed,
    };
  }

  async function isMonitored(hostname: string): Promise<boolean> {
    const state = await computeMonitoring();
    if (state.monitoringMode === 'all-sites') return true;
    return state.monitoredHosts.some((h) => hostMatchesDomain(hostname, h));
  }

  /* -------------------------------- tabs ---------------------------------- */

  async function tabHostname(tabId: number): Promise<string> {
    const info = describeUrl(await deps.tabs.getUrl(tabId));
    if (!info.supported || !info.hostname) {
      throw new ShieldFixError('unsupported-page', info.reason ?? 'This page is not supported.');
    }
    return info.hostname;
  }

  async function ensureContent(tabId: number): Promise<void> {
    try {
      await deps.tabs.send(tabId, { type: 'cs/ping' });
      return;
    } catch {
      // Not injected yet.
    }
    await deps.tabs.inject(tabId);
    await deps.tabs.send(tabId, { type: 'cs/ping' });
  }

  async function updateBadge(tabId: number, report: DetectionReport): Promise<void> {
    if (report.fix.active) await deps.badge.set(tabId, 'fixed');
    else if (report.level === 'high' || report.level === 'likely')
      await deps.badge.set(tabId, 'issue');
    else if (report.level === 'possible') await deps.badge.set(tabId, 'possible');
    else await deps.badge.set(tabId, 'clear');
  }

  /** Persist report, badge, site summary and (de-duplicated) history. */
  async function ingestReport(
    tabId: number,
    report: DetectionReport,
    event?: HistoryEvent,
  ): Promise<void> {
    const before = await deps.tabsState.get(tabId);
    await deps.tabsState.saveReport(tabId, report);
    await updateBadge(tabId, report);
    const sameSite = before?.hostname === report.hostname;
    const primary = report.candidates.find((c) => c.id === report.primaryCandidateId);
    const signals = primary?.signals.map((s) => s.id) ?? report.pageIssues.map((i) => i.id);

    if (event) {
      await repo.addHistory({
        hostname: report.hostname,
        event,
        level: report.level,
        confidence: report.confidence,
        signals,
      });
      if (event !== 'fix-reverted') {
        await repo.recordScan(report.hostname, {
          level: report.level,
          confidence: report.confidence,
          fixApplied: true,
        });
      }
      await deps.tabsState.markRecorded(tabId, { recordedFix: event !== 'fix-reverted' });
      return;
    }
    const alreadyRecorded = sameSite && before?.recordedLevel === report.level;
    if (report.level !== 'none' && !alreadyRecorded) {
      await repo.addHistory({
        hostname: report.hostname,
        event: 'detected',
        level: report.level,
        confidence: report.confidence,
        signals,
      });
      await repo.recordScan(report.hostname, {
        level: report.level,
        confidence: report.confidence,
      });
      await deps.tabsState.markRecorded(tabId, { recordedLevel: report.level });
    } else if (report.level === 'none') {
      // Keep an existing site summary current without creating new records.
      if (await repo.getSite(report.hostname)) {
        await repo.recordScan(report.hostname, { level: 'none', confidence: report.confidence });
      }
    }
  }

  /* --------------------------- UI request handlers ------------------------- */

  async function handleUi(req: UiRequest): Promise<UiResponseMap[UiRequest['type']]> {
    switch (req.type) {
      case 'tab/state': {
        const url = describeUrl(await deps.tabs.getUrl(req.tabId));
        const settings = await repo.getSettings();
        const base: TabState = {
          tabId: req.tabId,
          url,
          site: null,
          report: null,
          settings,
          monitoringActive: false,
          hasSitePermission: false,
          rulesForSite: 0,
        };
        if (!url.supported || !url.hostname) return base;
        const host = url.hostname;
        const record = await deps.tabsState.get(req.tabId);
        const rules = await repo.getRules();
        return {
          ...base,
          site: await repo.getSite(host),
          report: record?.hostname === host ? record.report : null,
          monitoringActive: await isMonitored(host),
          hasSitePermission: await deps.permissions.contains(originPatternsFor(host)),
          rulesForSite: rules.filter((r) => hostMatchesDomain(host, r.domain)).length,
        };
      }
      case 'tab/scan': {
        await tabHostname(req.tabId);
        await ensureContent(req.tabId);
        const report = await deps.tabs.send(req.tabId, { type: 'cs/scan', trigger: req.trigger });
        await ingestReport(req.tabId, report);
        return report;
      }
      case 'tab/previewFix': {
        await tabHostname(req.tabId);
        await ensureContent(req.tabId);
        const preview = await deps.tabs.send(req.tabId, {
          type: 'cs/previewFix',
          candidateId: req.candidateId,
        });
        const result: FixPreview = {
          candidateId: preview.candidateId,
          actions: preview.actions,
          canRemember: true,
          rememberSelector: preview.selector,
        };
        return result;
      }
      case 'tab/applyFix': {
        const host = await tabHostname(req.tabId);
        await ensureContent(req.tabId);
        const result = await deps.tabs.send(req.tabId, {
          type: 'cs/applyFix',
          candidateId: req.candidateId,
        });
        let ruleSaved = false;
        if (result.applied && req.remember) {
          if (result.selector) {
            const rules = await repo.getRules();
            const existing = rules.find((r) => r.domain === host && r.selector === result.selector);
            if (existing) {
              if (!existing.enabled) await repo.setRuleEnabled(existing.id, true);
            } else {
              const candidate = result.report.candidates.find((c) => c.id === req.candidateId);
              await repo.upsertRule({
                domain: host,
                selector: result.selector,
                ruleType:
                  candidate?.geometry === 'banner' || candidate?.geometry === 'inline'
                    ? 'cosmetic-hide'
                    : 'cosmetic-overlay',
                confidence: 95,
                enabled: true,
                description: 'Saved from a fix you approved.',
              });
            }
            ruleSaved = true;
          }
          await repo.updateSite(host, { autoFix: true });
          await deps.tabs.send(req.tabId, { type: 'cs/configChanged' }).catch(() => null);
        }
        if (result.applied) await ingestReport(req.tabId, result.report, 'fix-applied');
        const outcome: FixOutcome = {
          applied: result.applied,
          verified: result.verified,
          message: result.message,
          report: result.report,
          ruleSaved,
        };
        return outcome;
      }
      case 'tab/revertFix': {
        const host = await tabHostname(req.tabId);
        await ensureContent(req.tabId);
        const result = await deps.tabs.send(req.tabId, { type: 'cs/revertFix' });
        if (req.forget) {
          await repo.updateSite(host, { autoFix: false });
          const rules = await repo.getRules();
          for (const rule of rules.filter((r) => r.enabled && hostMatchesDomain(host, r.domain))) {
            await repo.setRuleEnabled(rule.id, false);
          }
          await deps.tabs.send(req.tabId, { type: 'cs/configChanged' }).catch(() => null);
        }
        if (result.reverted && result.report)
          await ingestReport(req.tabId, result.report, 'fix-reverted');
        const outcome: RevertOutcome = result;
        return outcome;
      }
      case 'sites/list':
        return repo.listSites();
      case 'site/update': {
        const site = await repo.updateSite(req.hostname, req.patch);
        if (req.patch.monitor !== undefined) await syncMonitoring();
        return site;
      }
      case 'site/remove':
        await repo.removeSite(req.hostname);
        await syncMonitoring();
        return null;
      case 'sites/reset':
        await repo.resetSites();
        await syncMonitoring();
        return null;
      case 'history/list':
        return repo.listHistory();
      case 'history/clear':
        await repo.clearHistory();
        return null;
      case 'rules/list':
        return repo.listRules();
      case 'rules/upsert':
        return repo.upsertRule(req.rule, 'user');
      case 'rules/delete':
        await repo.deleteRule(req.id);
        return null;
      case 'rules/setEnabled':
        return repo.setRuleEnabled(req.id, req.enabled);
      case 'rules/rollback':
        return repo.rollbackRule(req.id);
      case 'rules/import':
        return repo.importRules(req.payload);
      case 'rules/export':
        return repo.exportRules();
      case 'settings/get':
        return repo.getSettings();
      case 'settings/update': {
        const settings = await repo.updateSettings(req.patch);
        if (req.patch.monitorAllSites !== undefined) await syncMonitoring();
        return settings;
      }
      case 'monitoring/sync':
        return syncMonitoring();
      case 'app/info':
        return appInfo();
      case 'onboarding/complete':
        await repo.completeOnboarding();
        return null;
      case 'data/reset':
        await repo.resetAll();
        await deps.tabsState.clearAll();
        await syncMonitoring();
        return null;
      case 'brave/open': {
        let lastError: unknown = null;
        for (const url of BRAVE_PAGES[req.page]) {
          try {
            await deps.tabs.create(url);
            return { opened: url };
          } catch (err) {
            lastError = err;
          }
        }
        throw new ShieldFixError(
          'refused',
          `The browser did not allow opening its settings page${lastError instanceof Error ? ` (${lastError.message})` : ''}.`,
        );
      }
    }
  }

  /* ------------------------ content request handlers ----------------------- */

  async function handleContent(
    req: ContentRequest,
    tabId: number,
    pageUrl: string,
  ): Promise<ContentResponseMap[ContentRequest['type']]> {
    const info = describeUrl(pageUrl);
    if (!info.supported || !info.hostname)
      throw new ShieldFixError('unsupported-page', 'Unsupported page.');
    const host = info.hostname;
    switch (req.type) {
      case 'content/config': {
        const [settings, site, rules] = await Promise.all([
          repo.getSettings(),
          repo.getSite(host),
          repo.getRules(),
        ]);
        const config: ContentConfig = {
          hostname: host,
          monitoring: await isMonitored(host),
          autoFix: site?.autoFix ?? false,
          autoApplyRemembered: settings.autoApplyRemembered,
          showInPageNotice: settings.showInPageNotice,
          rules: toContentRules(rules, host, Date.now()),
        };
        return config;
      }
      case 'content/report':
        if (normalizeHostname(req.report.hostname) !== host)
          throw new ShieldFixError('forbidden', 'Hostname mismatch.');
        await ingestReport(tabId, req.report);
        return null;
      case 'content/fixEvent': {
        if (normalizeHostname(req.report.hostname) !== host)
          throw new ShieldFixError('forbidden', 'Hostname mismatch.');
        const event: HistoryEvent =
          req.event === 'reverted'
            ? 'fix-reverted'
            : req.event === 'auto-applied'
              ? 'fix-auto-applied'
              : 'fix-applied';
        await ingestReport(tabId, req.report, event);
        return null;
      }
      case 'content/openPopup':
        return { opened: await deps.action.openPopup() };
    }
  }

  /* -------------------------------- entry --------------------------------- */

  async function handle(message: unknown, sender: Sender): Promise<Envelope<unknown>> {
    try {
      if (sender.id !== deps.extensionId) return fail('forbidden', 'Unknown sender.');
      const fromExtensionPage = !!sender.url && sender.url.startsWith(deps.extensionOrigin);
      if (fromExtensionPage) {
        const parsed = UiRequestSchema.safeParse(message);
        if (!parsed.success)
          return fail('invalid-request', parsed.error.issues.map((i) => i.message).join('; '));
        return ok(await handleUi(parsed.data));
      }
      const tabId = sender.tab?.id;
      if (tabId === undefined || sender.frameId !== 0 || !sender.url) {
        return fail(
          'forbidden',
          'Messages are only accepted from extension pages and top-level pages.',
        );
      }
      const parsed = ContentRequestSchema.safeParse(message);
      if (!parsed.success) return fail('invalid-request', 'Invalid content message.');
      return ok(await handleContent(parsed.data, tabId, sender.url));
    } catch (err) {
      return toEnvelopeError(err);
    }
  }

  /**
   * Monitoring follows the permissions the user actually granted (through
   * ShieldFix's UI or the browser's site-access menu), so a closed popup or a
   * revoked permission can never leave the stored preference out of sync.
   */
  async function onPermissionsChanged(change: {
    added?: string[];
    removed?: string[];
  }): Promise<AppInfo> {
    const allSites = (o: string) => (ALL_SITES_ORIGINS as readonly string[]).includes(o);
    for (const origin of change.added ?? []) {
      const host = hostFromPattern(origin);
      if (host) await repo.updateSite(host, { monitor: true });
    }
    if (
      (change.added ?? []).some(allSites) &&
      (await deps.permissions.contains([...ALL_SITES_ORIGINS]))
    ) {
      await repo.updateSettings({ monitorAllSites: true });
    }
    for (const origin of change.removed ?? []) {
      const host = hostFromPattern(origin);
      if (host && (await repo.getSite(host))) await repo.updateSite(host, { monitor: false });
    }
    if ((change.removed ?? []).some(allSites))
      await repo.updateSettings({ monitorAllSites: false });
    return syncMonitoring();
  }

  async function onTabLoading(tabId: number): Promise<void> {
    await deps.tabsState.clear(tabId);
    await deps.badge.set(tabId, 'clear');
  }

  return {
    handle,
    syncMonitoring,
    onPermissionsChanged,
    onTabLoading,
    purge: () => repo.purgeExpiredRules(),
  };
}

export type Router = ReturnType<typeof createRouter>;
