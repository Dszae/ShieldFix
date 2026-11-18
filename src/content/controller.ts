import { LIMITS } from '../shared/constants';
import { normalizeHostname } from '../shared/domain';
import { ShieldFixError } from '../shared/envelope';
import type {
  ContentConfig,
  ContentFixPreview,
  ContentFixResult,
  ContentRevertResult,
} from '../shared/messages';
import type { CandidateSummary, DetectionReport, FixState, ScanTrigger } from '../shared/schemas';
import {
  isAntiAdblock,
  scanDocument,
  type CandidateResult,
  type ScanResult,
} from '../detection/engine';
import { createDomProbe, type LayoutProbe } from '../detection/layout';
import {
  heuristicFailures,
  ResourceErrorRecorder,
  summarizeFailures,
} from '../detection/resources';
import { ATTRIBUTE_SEED_SELECTOR, DIALOG_SEED_SELECTOR, MENTION_RE } from '../detection/signatures';
import { FixSession, planFix, summarizeActions } from '../fixer/fixer';
import { stableSelector } from '../fixer/selector';
import { Notice } from './notice';
import { buildReport, EMPTY_FIX, toSummary } from './report';

export interface Bridge {
  getConfig(): Promise<ContentConfig | null>;
  report(report: DetectionReport): void;
  fixEvent(event: 'applied' | 'auto-applied' | 'reverted', report: DetectionReport): void;
  openPopup(): Promise<boolean>;
}

interface ActiveFix {
  sessions: FixSession[];
  candidateId: string;
  summary: CandidateSummary;
  auto: boolean;
  appliedAt: number;
}

const SEED_SELECTOR = `${ATTRIBUTE_SEED_SELECTOR},${DIALOG_SEED_SELECTOR}`;

export class ContentController {
  private config: ContentConfig | null = null;
  private readonly ids = new WeakMap<Element, string>();
  private readonly elements = new Map<string, WeakRef<Element>>();
  private counter = 0;
  private lastScan: ScanResult | null = null;
  private lastReport: DetectionReport | null = null;
  private fix: ActiveFix | null = null;
  private userReverted = false;
  private noticeDismissed = false;
  readonly recorder = new ResourceErrorRecorder();
  private readonly lateInserted = new WeakSet<Element>();
  private readonly notice: Notice;

  private observer: MutationObserver | null = null;
  private monitoring = false;
  private deadline = 0;
  private hiddenSince: number | null = null;
  private mutationScans = 0;
  private pending = new Set<Element>();
  private debounceTimer: number | null = null;
  private lastScanAt = 0;
  private lastHref: string;
  private readonly onVisibility = () => this.handleVisibility();

  constructor(
    private readonly win: Window & typeof globalThis,
    private readonly bridge: Bridge,
    private readonly probeFactory: (
      win: Window & typeof globalThis,
    ) => LayoutProbe = createDomProbe,
  ) {
    this.lastHref = win.location.href;
    this.notice = new Notice(win.document, {
      onApply: () => void this.applyFromNotice(),
      onDetails: () => void this.openDetails(),
      onUndo: () => void this.revertFromNotice(),
      onDismiss: () => {
        this.noticeDismissed = true;
        this.notice.hide();
      },
    });
  }

  private get hostname(): string {
    return normalizeHostname(this.win.location.hostname);
  }

  async refreshConfig(): Promise<ContentConfig | null> {
    const keepPreviousConfig = () => this.config;
    this.config = await this.bridge.getConfig().catch(keepPreviousConfig);
    return this.config;
  }

  get isMonitoring(): boolean {
    return this.monitoring;
  }

  private idFor = (el: Element): string => {
    let id = this.ids.get(el);
    if (!id) {
      id = `c${++this.counter}`;
      this.ids.set(el, id);
      this.elements.set(id, new WeakRef(el));
    }
    return id;
  };

  private fixState(): FixState {
    if (!this.fix) return { ...EMPTY_FIX };
    return {
      active: true,
      candidateId: this.fix.candidateId,
      appliedAt: this.fix.appliedAt,
      auto: this.fix.auto,
      actions: this.fix.sessions.flatMap((s) => summarizeActions(s.actions)).slice(0, 30),
      reassertions: this.fix.sessions.reduce((n, s) => n + s.reassertions, 0),
      reapplications: this.fix.sessions.length - 1,
    };
  }

  private runScan(trigger: ScanTrigger): DetectionReport {
    const started = performance.now();
    const probe = this.probeFactory(this.win);
    const scan = scanDocument({
      doc: this.win.document,
      probe,
      ignore: (el) => this.notice.contains(el),
      rules: this.config?.rules ?? [],
      lateInserted: this.lateInserted,
    });
    const resources = this.recorder.active
      ? summarizeFailures(this.recorder.snapshot(), this.hostname, 'error-events', true)
      : (() => {
          const h = heuristicFailures(this.win);
          return summarizeFailures(h.failures, this.hostname, 'heuristic', h.reliable);
        })();
    this.lastScan = scan;
    const report = buildReport({
      hostname: this.hostname,
      trigger,
      scanMs: performance.now() - started,
      scan,
      idFor: this.idFor,
      resources,
      fix: this.fixState(),
      fixedCandidate: this.fix?.summary ?? null,
      monitoring: this.monitoring,
      now: Date.now(),
    });
    this.lastReport = report;
    return report;
  }

  async scan(trigger: ScanTrigger): Promise<DetectionReport> {
    await this.refreshConfig();
    let report = this.runScan(trigger);
    report = await this.afterScan(report, trigger);
    return report;
  }

  getState(): DetectionReport | null {
    return this.lastReport;
  }

  private primaryCandidate(report: DetectionReport): CandidateResult | null {
    if (!report.primaryCandidateId || !this.lastScan) return null;
    return (
      this.lastScan.candidates.find((c) => this.idFor(c.el) === report.primaryCandidateId) ?? null
    );
  }

  private async afterScan(report: DetectionReport, trigger: ScanTrigger): Promise<DetectionReport> {
    const config = this.config;

    if (this.fix) {
      const fixedEl = this.elementFor(this.fix.candidateId);
      const fresh = this.lastScan?.candidates.find(
        (c) => c.fixable && isAntiAdblock(c.classification) && c.el !== fixedEl,
      );
      if (fresh && this.fix.sessions.length - 1 < LIMITS.maxFixReapplications) {
        const result = this.applyToCandidate(fresh, this.fix.auto, true);
        if (result.applied) return this.runScan(trigger);
      }
      return report;
    }

    const primary = this.primaryCandidate(report);
    if (!primary || !primary.fixable || !config) {
      this.maybeNotify(report, trigger, null);
      return report;
    }

    const remembered = !!primary.ruleId || config.autoFix;
    if (remembered && config.autoApplyRemembered && !this.userReverted) {
      const result = this.applyToCandidate(primary, true, false);
      const after = this.runScan(trigger);
      if (result.applied) {
        this.bridge.fixEvent('auto-applied', after);
        if (config.showInPageNotice && trigger !== 'popup' && trigger !== 'manual') {
          this.notice.show({
            kind: 'applied',
            auto: true,
            verified: result.verified.overlayHidden,
          });
        }
      }
      return after;
    }
    this.maybeNotify(report, trigger, primary);
    return report;
  }

  private maybeNotify(
    report: DetectionReport,
    trigger: ScanTrigger,
    primary: CandidateResult | null,
  ): void {
    if (trigger !== 'monitor' && trigger !== 'mutation') return;
    if (!this.config?.showInPageNotice || this.noticeDismissed || this.fix) return;
    if (report.level !== 'likely' && report.level !== 'high') return;
    if (this.notice.visible) return;
    this.notice.show({ kind: 'detected', fixable: !!primary?.fixable, level: report.level });
  }

  private elementFor(id: string): Element | null {
    return this.elements.get(id)?.deref() ?? null;
  }

  previewFix(candidateId: string): ContentFixPreview {
    const candidate = this.freshCandidate(candidateId);
    const actions = planFix(candidate, this.lastScan!.page, this.win.document);
    return {
      candidateId,
      actions: summarizeActions(actions),
      selector: stableSelector(candidate.el, this.win.document),
    };
  }

  private freshCandidate(candidateId: string): CandidateResult {
    const el = this.elementFor(candidateId);
    if (!el || !el.isConnected) {
      throw new ShieldFixError('stale', 'The page changed since the last scan. Scan again.');
    }
    this.runScan('manual');
    const candidate = this.lastScan!.candidates.find((c) => c.el === el);
    if (!candidate)
      throw new ShieldFixError('stale', 'The warning is no longer visible. Scan again.');
    if (!candidate.fixable) {
      throw new ShieldFixError(
        'refused',
        candidate.fixBlockedReason ?? 'No safe fix is available.',
      );
    }
    return candidate;
  }

  private applyToCandidate(
    candidate: CandidateResult,
    auto: boolean,
    reapplication: boolean,
  ): { applied: boolean; verified: ContentFixResult['verified'] } {
    const actions = planFix(candidate, this.lastScan!.page, this.win.document);
    const session = new FixSession(this.win, actions);
    const verified = session.apply();
    if (!verified.overlayHidden) {
      session.revert();
      return { applied: false, verified };
    }
    const id = this.idFor(candidate.el);
    if (reapplication && this.fix) {
      this.fix.sessions.push(session);
    } else {
      this.fix = {
        sessions: [session],
        candidateId: id,
        summary: toSummary(candidate, id),
        auto,
        appliedAt: Date.now(),
      };
    }
    return { applied: true, verified };
  }

  async applyFix(candidateId: string): Promise<ContentFixResult> {
    await this.refreshConfig();
    if (this.fix) {
      const report = this.runScan('manual');
      return {
        applied: true,
        verified: { overlayHidden: true, scrollRestored: null },
        message: 'A fix is already active on this page.',
        selector: null,
        report,
      };
    }
    const candidate = this.freshCandidate(candidateId);
    const selector = stableSelector(candidate.el, this.win.document);
    const result = this.applyToCandidate(candidate, false, false);
    this.userReverted = false;
    const report = this.runScan('manual');
    if (!result.applied) {
      return {
        applied: false,
        verified: result.verified,
        message:
          'The page kept the warning visible, so ShieldFix undid its change. Nothing was modified.',
        selector: null,
        report,
      };
    }
    this.notice.hide();
    const scrollNote =
      result.verified.scrollRestored === false
        ? ' Scrolling could not be restored on this page.'
        : '';
    return {
      applied: true,
      verified: result.verified,
      message: `The warning is hidden.${scrollNote} Undo restores the page exactly.`,
      selector,
      report,
    };
  }

  revertFix(): ContentRevertResult {
    if (!this.fix) {
      return {
        reverted: false,
        message: 'No fix is active on this page.',
        report: this.lastReport,
      };
    }
    for (let i = this.fix.sessions.length - 1; i >= 0; i--) this.fix.sessions[i]!.revert();
    this.fix = null;
    this.userReverted = true;
    const report = this.runScan('manual');
    return { reverted: true, message: 'The page has been restored to how it was.', report };
  }

  private async applyFromNotice(): Promise<void> {
    const report = this.lastReport;
    if (!report?.primaryCandidateId) return;
    try {
      const result = await this.applyFix(report.primaryCandidateId);
      if (result.applied) {
        this.bridge.fixEvent('applied', result.report);
        this.notice.show({ kind: 'applied', auto: false, verified: result.verified.overlayHidden });
      } else {
        this.notice.show({ kind: 'message', text: result.message });
      }
    } catch (err) {
      this.notice.show({
        kind: 'message',
        text: err instanceof Error ? err.message : 'The fix could not be applied.',
      });
    }
  }

  private revertFromNotice(): void {
    const result = this.revertFix();
    this.notice.hide();
    if (result.reverted && result.report) this.bridge.fixEvent('reverted', result.report);
  }

  private async openDetails(): Promise<void> {
    const opened = await this.bridge.openPopup().catch(() => false);
    if (!opened) {
      this.notice.show({
        kind: 'message',
        text: 'Click the ShieldFix button in your browser toolbar to see details and options.',
      });
    }
  }

  startMonitoring(): void {
    if (this.monitoring) return;
    this.monitoring = true;
    this.deadline = Date.now() + LIMITS.observeWindowMs;
    const run = async () => {
      const report = await this.scan('monitor');
      this.bridge.report(report);
      this.connect();
    };
    const whenIdle = () => {
      if (typeof this.win.requestIdleCallback === 'function')
        this.win.requestIdleCallback(() => void run(), { timeout: 1500 });
      else this.win.setTimeout(() => void run(), 200);
    };
    if (this.win.document.readyState === 'loading') {
      this.win.document.addEventListener('DOMContentLoaded', whenIdle, { once: true });
    } else {
      whenIdle();
    }
    this.win.document.addEventListener('visibilitychange', this.onVisibility);
  }

  private connect(): void {
    if (this.observer || Date.now() > this.deadline || this.win.document.hidden) return;
    this.observer = new this.win.MutationObserver((records) => this.onMutations(records));
    this.observer.observe(this.win.document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'open', 'hidden'],
    });
  }

  private disconnect(): void {
    this.observer?.disconnect();
    this.observer = null;
    if (this.debounceTimer !== null) this.win.clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    this.pending.clear();
  }

  private handleVisibility(): void {
    if (this.win.document.hidden) {
      this.hiddenSince = Date.now();
      this.disconnect();
    } else {
      if (this.hiddenSince !== null) this.deadline += Date.now() - this.hiddenSince;
      this.hiddenSince = null;
      this.connect();
    }
  }

  private onMutations(records: MutationRecord[]): void {
    if (Date.now() > this.deadline) {
      this.disconnect();
      return;
    }
    if (this.win.location.href !== this.lastHref) {
      this.lastHref = this.win.location.href;
      this.noticeDismissed = false;
      this.mutationScans = 0;
      this.deadline = Date.now() + LIMITS.observeWindowMs;
    }
    for (const record of records) {
      if (this.pending.size >= 50) break;
      if (record.type === 'childList') {
        record.addedNodes.forEach((node) => {
          if (node instanceof this.win.Element && !this.notice.contains(node)) {
            this.lateInserted.add(node);
            this.pending.add(node);
          }
        });
      } else if (
        record.target instanceof this.win.Element &&
        !this.notice.contains(record.target)
      ) {
        this.pending.add(record.target);
      }
    }
    if (this.pending.size === 0 || this.debounceTimer !== null) return;
    this.debounceTimer = this.win.setTimeout(() => {
      this.debounceTimer = null;
      void this.processPending();
    }, LIMITS.mutationDebounceMs);
  }

  private isRelevant(el: Element): boolean {
    if (!el.isConnected) return false;
    const doc = this.win.document;
    if (el === doc.documentElement || el === doc.body) return true;
    try {
      if (el.matches(SEED_SELECTOR) || el.querySelector(SEED_SELECTOR)) return true;
    } catch {
      return false;
    }
    const text = el.textContent;
    if (text && MENTION_RE.test(text.length > 3000 ? text.slice(0, 3000) : text)) return true;
    const style = this.win.getComputedStyle(el);
    return style.position === 'fixed' && (Number.parseInt(style.zIndex, 10) || 0) >= 100;
  }

  private async processPending(): Promise<void> {
    const targets = Array.from(this.pending).slice(0, 50);
    this.pending.clear();
    if (!targets.some((el) => this.isRelevant(el))) return;
    const wait = this.lastScanAt + LIMITS.rescanThrottleMs - Date.now();
    if (wait > 0) {
      targets.forEach((t) => this.pending.add(t));
      this.debounceTimer = this.win.setTimeout(() => {
        this.debounceTimer = null;
        void this.processPending();
      }, wait);
      return;
    }
    if (this.mutationScans >= LIMITS.maxMutationScans) {
      this.disconnect();
      return;
    }
    this.mutationScans++;
    this.lastScanAt = Date.now();
    const previous = this.lastReport;
    const report = await this.scan('mutation');
    const changed =
      !previous ||
      previous.level !== report.level ||
      previous.primaryCandidateId !== report.primaryCandidateId ||
      previous.fix.active !== report.fix.active;
    if (changed) this.bridge.report(report);
  }

  destroy(): void {
    this.disconnect();
    this.win.document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.fix) this.revertFix();
    this.recorder.stop(this.win);
    this.notice.hide();
  }
}
