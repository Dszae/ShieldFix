import type { LayoutProbe, Rect } from '../../../src/detection/layout';

export class FakeLayout {
  private rects = new Map<Element, Rect>();
  viewport = { width: 1280, height: 800 };
  docHeight = 3000;
  topAt: Element | null = null;

  set(el: Element | null, [x, y, width, height]: [number, number, number, number]): this {
    if (!el) throw new Error('FakeLayout.set: element not found');
    this.rects.set(el, { x, y, width, height });
    return this;
  }

  fullscreen(el: Element | null): this {
    return this.set(el, [0, 0, this.viewport.width, this.viewport.height]);
  }

  probe = (): LayoutProbe => ({
    viewport: () => this.viewport,
    documentHeight: () => this.docHeight,
    rect: (el) => this.rects.get(el) ?? { x: 0, y: 1200, width: 800, height: 40 },
    style: (el) => window.getComputedStyle(el),
    text: (el, max) => (el.textContent ?? '').slice(0, max),
    elementsAtPoint: () => (this.topAt ? [this.topAt] : []),
  });
}

export function html(markup: string): void {
  document.documentElement.removeAttribute('style');
  document.body.removeAttribute('style');
  document.body.innerHTML = markup;
}

export const $ = (selector: string): HTMLElement => {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`No element for ${selector}`);
  return el;
};
