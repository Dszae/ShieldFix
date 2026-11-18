import { NOTICE_HOST_ATTR } from '../shared/constants';

export type NoticeView =
  | { kind: 'detected'; fixable: boolean; level: 'likely' | 'high' }
  | { kind: 'applied'; auto: boolean; verified: boolean }
  | { kind: 'message'; text: string };

export interface NoticeHandlers {
  onApply(): void;
  onDetails(): void;
  onUndo(): void;
  onDismiss(): void;
}

const CSS = `
:host { all: initial; }
.sf { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; width: min(360px, calc(100vw - 32px));
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #18181b; background: #ffffff;
  border: 1px solid #e4e4e7; border-radius: 12px; box-shadow: 0 8px 28px rgba(0,0,0,.16); padding: 14px 14px 12px;
  animation: sf-in .18s ease-out; box-sizing: border-box; }
.sf * { box-sizing: border-box; }
@keyframes sf-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .sf { animation: none; } }
.row { display: flex; gap: 10px; align-items: flex-start; }
.mark { flex: none; width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; background: #0f766e; color: #fff; }
.title { font-weight: 600; margin: 0 0 2px; font-size: 13px; }
.body { margin: 0; color: #52525b; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
button { font: inherit; font-weight: 500; border-radius: 8px; padding: 6px 12px; cursor: pointer; border: 1px solid #d4d4d8; background: #fff; color: #18181b; }
button.primary { background: #0f766e; border-color: #0f766e; color: #fff; }
button:hover { filter: brightness(.96); }
button:focus-visible { outline: 2px solid #0f766e; outline-offset: 2px; }
.close { margin-left: auto; border: none; background: transparent; padding: 2px 6px; color: #71717a; font-size: 16px; line-height: 1; }
@media (prefers-color-scheme: dark) {
  .sf { background: #18181b; color: #f4f4f5; border-color: #3f3f46; box-shadow: 0 8px 28px rgba(0,0,0,.5); }
  .body { color: #a1a1aa; }
  button { background: #27272a; color: #f4f4f5; border-color: #3f3f46; }
  button.primary { background: #14b8a6; border-color: #14b8a6; color: #042f2e; }
  .mark { background: #14b8a6; color: #042f2e; }
  button:focus-visible { outline-color: #5eead4; }
}
`;

const SVG_NS = 'http://www.w3.org/2000/svg';

function shieldIcon(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({
    width: '14',
    height: '14',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2.4',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  })) {
    svg.setAttribute(k, v);
  }
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6z');
  svg.appendChild(path);
  return svg;
}

export class Notice {
  private host: HTMLElement | null = null;
  private root: ShadowRoot | null = null;
  private hideTimer: number | null = null;

  constructor(
    private readonly doc: Document,
    private readonly handlers: NoticeHandlers,
  ) {}

  contains(el: Element): boolean {
    return !!this.host && (el === this.host || this.host.contains(el));
  }

  get visible(): boolean {
    return !!this.host?.isConnected;
  }

  show(view: NoticeView): void {
    this.clearTimer();
    if (!this.host || !this.host.isConnected) {
      this.host = this.doc.createElement('shieldfix-notice');
      this.host.setAttribute(NOTICE_HOST_ATTR, '');
      this.root = this.host.attachShadow({ mode: 'open' });
      (this.doc.body ?? this.doc.documentElement).appendChild(this.host);
    }
    const root = this.root!;
    root.replaceChildren();
    const style = this.doc.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);

    const box = this.doc.createElement('div');
    box.className = 'sf';
    box.setAttribute('role', view.kind === 'detected' ? 'alertdialog' : 'status');
    box.setAttribute('aria-live', 'polite');
    box.setAttribute('aria-labelledby', 'sf-title');
    box.setAttribute('aria-describedby', 'sf-body');

    const { title, body, buttons } = this.content(view);
    const row = this.doc.createElement('div');
    row.className = 'row';
    const mark = this.doc.createElement('span');
    mark.className = 'mark';
    mark.appendChild(shieldIcon(this.doc));
    const text = this.doc.createElement('div');
    const h = this.doc.createElement('p');
    h.className = 'title';
    h.id = 'sf-title';
    h.textContent = title;
    const p = this.doc.createElement('p');
    p.className = 'body';
    p.id = 'sf-body';
    p.textContent = body;
    text.append(h, p);
    const close = this.button('×', () => this.handlers.onDismiss(), 'close');
    close.setAttribute('aria-label', 'Dismiss ShieldFix notice');
    row.append(mark, text, close);
    box.appendChild(row);

    if (buttons.length > 0) {
      const actions = this.doc.createElement('div');
      actions.className = 'actions';
      for (const b of buttons)
        actions.appendChild(this.button(b.label, b.onClick, b.primary ? 'primary' : ''));
      box.appendChild(actions);
    }
    box.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.handlers.onDismiss();
      }
    });
    root.appendChild(box);

    if (view.kind !== 'detected') {
      let interacting = false;
      box.addEventListener('mouseenter', () => (interacting = true));
      box.addEventListener('mouseleave', () => (interacting = false));
      box.addEventListener('focusin', () => (interacting = true));
      box.addEventListener('focusout', () => (interacting = false));
      const tick = () => {
        if (interacting) this.hideTimer = window.setTimeout(tick, 2000);
        else this.hide();
      };
      this.hideTimer = window.setTimeout(tick, 12_000);
    }
  }

  private content(view: NoticeView): {
    title: string;
    body: string;
    buttons: { label: string; onClick: () => void; primary?: boolean }[];
  } {
    if (view.kind === 'detected') {
      return {
        title:
          view.level === 'high' ? 'Ad-blocker warning detected' : 'Possible ad-blocker warning',
        body: view.fixable
          ? 'This page appears to block content because of privacy protection. ShieldFix can hide the warning. The change is temporary and can be undone.'
          : 'This page appears to react to privacy protection. Open ShieldFix for details and options.',
        buttons: [
          ...(view.fixable
            ? [{ label: 'Hide warning', onClick: () => this.handlers.onApply(), primary: true }]
            : []),
          { label: 'Details', onClick: () => this.handlers.onDetails(), primary: !view.fixable },
        ],
      };
    }
    if (view.kind === 'applied') {
      return {
        title: view.auto ? 'Saved fix applied' : 'Warning hidden',
        body: view.verified
          ? `${view.auto ? 'ShieldFix applied the fix you saved for this site. ' : ''}Nothing was removed from the page — undo restores it.`
          : 'The page may still be showing parts of the warning. You can undo the change at any time.',
        buttons: [{ label: 'Undo', onClick: () => this.handlers.onUndo() }],
      };
    }
    return { title: 'ShieldFix', body: view.text, buttons: [] };
  }

  private button(label: string, onClick: () => void, className: string): HTMLButtonElement {
    const b = this.doc.createElement('button');
    b.type = 'button';
    b.textContent = label;
    if (className) b.className = className;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  private clearTimer(): void {
    if (this.hideTimer !== null) window.clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  hide(): void {
    this.clearTimer();
    this.host?.remove();
    this.host = null;
    this.root = null;
  }
}
