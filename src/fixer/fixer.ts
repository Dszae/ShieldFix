import { LIMITS } from '../shared/constants';
import type { FixActionKind, FixActionSummary } from '../shared/schemas';
import type { CandidateResult, PageState } from '../detection/engine';
import { describeElement } from '../detection/layout';

export interface PlannedAction {
  kind: FixActionKind;
  el: Element;
  description: string;
}

export function planFix(
  candidate: CandidateResult,
  page: PageState,
  doc: Document,
): PlannedAction[] {
  const actions: PlannedAction[] = [];
  const root = candidate.el;
  const label = describeElement(root);
  const role =
    candidate.geometry === 'banner'
      ? 'banner'
      : candidate.geometry === 'inline'
        ? 'notice'
        : 'overlay';

  if (root instanceof HTMLDialogElement && root.open && safeMatches(root, ':modal')) {
    actions.push({
      kind: 'close-dialog',
      el: root,
      description: `Close the modal dialog ${label}`,
    });
  } else {
    actions.push({ kind: 'hide', el: root, description: `Hide the ${role} ${label}` });
  }
  for (const backdrop of candidate.backdrops) {
    actions.push({
      kind: 'hide',
      el: backdrop,
      description: `Hide the dimming backdrop ${describeElement(backdrop)}`,
    });
  }

  const isOverlay = candidate.geometry === 'fullscreen' || candidate.geometry === 'modal';
  if (isOverlay) {
    if (page.scrollLocked) {
      for (const el of [doc.documentElement, doc.body]) {
        if (el)
          actions.push({
            kind: 'unlock-scroll',
            el,
            description: `Restore scrolling on <${el.tagName.toLowerCase()}>`,
          });
      }
      const body = doc.body;
      if (body && body.ownerDocument.defaultView?.getComputedStyle(body).position === 'fixed') {
        actions.push({
          kind: 'unfix-body',
          el: body,
          description: 'Release the fixed-position page lock',
        });
      }
    }
    for (const el of page.blurred) {
      if (root.contains(el) || el.contains(root)) continue;
      actions.push({
        kind: 'remove-filter',
        el,
        description: `Remove the blur from ${describeElement(el)}`,
      });
    }
    for (const el of page.pointerBlocked) {
      if (root.contains(el)) continue;
      actions.push({
        kind: 'restore-pointer',
        el,
        description: `Re-enable clicking on ${describeElement(el)}`,
      });
    }
    for (const el of page.inert) {
      if (root.contains(el) || el === root) continue;
      actions.push({
        kind: 'remove-inert',
        el,
        description: `Re-enable interaction with ${describeElement(el)}`,
      });
    }
  }
  return actions;
}

function safeMatches(el: Element, selector: string): boolean {
  try {
    return el.matches(selector);
  } catch {
    return false;
  }
}

export function summarizeActions(actions: PlannedAction[]): FixActionSummary[] {
  return actions.map((a) => ({ kind: a.kind, description: a.description }));
}

interface StyleRecord {
  el: HTMLElement;
  prop: string;
  value: string;
  priority: string;
  target: string;
}

type Change =
  | { type: 'style'; record: StyleRecord }
  | { type: 'dialog'; el: HTMLDialogElement }
  | { type: 'inert'; el: Element; value: string };

export interface FixVerification {
  overlayHidden: boolean;
  scrollRestored: boolean | null;
}

export class FixSession {
  private changes: Change[] = [];
  private styleAttrPresent = new Map<HTMLElement, boolean>();
  private observer: MutationObserver | null = null;
  private applied = false;
  reassertions = 0;

  constructor(
    private readonly win: Window & typeof globalThis,
    readonly actions: PlannedAction[],
  ) {}

  get active(): boolean {
    return this.applied;
  }

  apply(): FixVerification {
    if (this.applied) return this.verify();
    for (const action of this.actions) this.applyAction(action);
    this.applied = true;
    this.observe();
    return this.verify();
  }

  private applyAction(action: PlannedAction): void {
    const el = action.el;
    switch (action.kind) {
      case 'hide':
        this.setStyle(el, 'display', 'none');
        break;
      case 'close-dialog':
        if (el instanceof HTMLDialogElement && el.open) {
          el.close();
          this.changes.push({ type: 'dialog', el });
        }
        break;
      case 'unlock-scroll':
        this.setStyle(el, 'overflow-y', 'auto');
        break;
      case 'unfix-body': {
        const top = Number.parseFloat(this.win.getComputedStyle(el).top || '0');
        this.setStyle(el, 'position', 'static');
        this.setStyle(el, 'top', 'auto');
        if (Number.isFinite(top) && top < 0) this.win.scrollTo(0, -top);
        break;
      }
      case 'remove-filter':
        this.setStyle(el, 'filter', 'none');
        break;
      case 'restore-pointer':
        this.setStyle(el, 'pointer-events', 'auto');
        break;
      case 'remove-inert':
        if (el.hasAttribute('inert')) {
          this.changes.push({ type: 'inert', el, value: el.getAttribute('inert') ?? '' });
          el.removeAttribute('inert');
        }
        break;
    }
  }

  private setStyle(el: Element, prop: string, target: string): void {
    if (!(el instanceof HTMLElement)) return;
    if (!this.styleAttrPresent.has(el)) this.styleAttrPresent.set(el, el.hasAttribute('style'));
    const exists = this.changes.some(
      (c) => c.type === 'style' && c.record.el === el && c.record.prop === prop,
    );
    if (!exists) {
      this.changes.push({
        type: 'style',
        record: {
          el,
          prop,
          value: el.style.getPropertyValue(prop),
          priority: el.style.getPropertyPriority(prop),
          target,
        },
      });
    }
    el.style.setProperty(prop, target, 'important');
  }

  private observe(): void {
    const targets = new Set<Element>();
    for (const c of this.changes) targets.add(c.type === 'style' ? c.record.el : c.el);
    if (targets.size === 0) return;
    this.observer = new this.win.MutationObserver(() => this.reassert());
    for (const t of targets) {
      this.observer.observe(t, { attributes: true, attributeFilter: ['style', 'open', 'inert'] });
    }
  }

  private reassert(): void {
    if (!this.applied) return;
    let changed = false;
    for (const c of this.changes) {
      if (c.type === 'style') {
        const { el, prop, target } = c.record;
        if (
          el.style.getPropertyValue(prop) !== target ||
          el.style.getPropertyPriority(prop) !== 'important'
        ) {
          el.style.setProperty(prop, target, 'important');
          changed = true;
        }
      } else if (c.type === 'dialog' && c.el.open) {
        c.el.close();
        changed = true;
      } else if (c.type === 'inert' && c.el.hasAttribute('inert')) {
        c.el.removeAttribute('inert');
        changed = true;
      }
    }
    if (changed) {
      this.reassertions++;
      if (this.reassertions >= LIMITS.maxFixReassertions) this.observer?.disconnect();
    }
  }

  verify(): FixVerification {
    const hideTargets = this.actions.filter((a) => a.kind === 'hide' || a.kind === 'close-dialog');
    const overlayHidden = hideTargets.every(
      (a) => !a.el.isConnected || !isRenderedFresh(a.el, this.win),
    );
    const unlock = this.actions.filter((a) => a.kind === 'unlock-scroll');
    let scrollRestored: boolean | null = null;
    if (unlock.length > 0) {
      scrollRestored = unlock.every((a) => {
        const s = this.win.getComputedStyle(a.el);
        return s.overflowY !== 'hidden' && s.overflowY !== 'clip';
      });
    }
    return { overlayHidden, scrollRestored };
  }

  revert(): void {
    if (!this.applied) return;
    this.observer?.disconnect();
    this.observer = null;
    for (let i = this.changes.length - 1; i >= 0; i--) {
      const c = this.changes[i]!;
      if (c.type === 'style') {
        const { el, prop, value, priority } = c.record;
        if (value === '') el.style.removeProperty(prop);
        else el.style.setProperty(prop, value, priority);
      } else if (c.type === 'dialog') {
        if (!c.el.open && c.el.isConnected) {
          try {
            c.el.showModal();
          } catch {
            c.el.show();
          }
        }
      } else if (c.el.isConnected) {
        c.el.setAttribute('inert', c.value);
      }
    }
    for (const [el, hadAttr] of this.styleAttrPresent) {
      if (!hadAttr && el.style.length === 0) el.removeAttribute('style');
    }
    this.changes = [];
    this.styleAttrPresent.clear();
    this.applied = false;
  }
}

function isRenderedFresh(el: Element, win: Window & typeof globalThis): boolean {
  const s = win.getComputedStyle(el);
  if (s.display === 'none' || s.visibility === 'hidden') return false;
  for (let cur = el.parentElement; cur; cur = cur.parentElement) {
    if (win.getComputedStyle(cur).display === 'none') return false;
  }
  return !(el instanceof HTMLDialogElement && !el.open);
}
