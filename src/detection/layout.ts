export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutProbe {
  viewport(): { width: number; height: number };
  documentHeight(): number;
  rect(el: Element): Rect;
  style(el: Element): CSSStyleDeclaration;
  text(el: Element, max: number): string;
  elementsAtPoint(x: number, y: number): Element[];
}

export function createDomProbe(win: Window & typeof globalThis): LayoutProbe {
  const styleCache = new Map<Element, CSSStyleDeclaration>();
  const doc = win.document;
  return {
    viewport() {
      return {
        width: win.innerWidth || doc.documentElement.clientWidth,
        height: win.innerHeight || doc.documentElement.clientHeight,
      };
    },
    documentHeight() {
      return Math.max(doc.documentElement.scrollHeight, doc.body?.scrollHeight ?? 0);
    },
    rect(el) {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    },
    style(el) {
      let s = styleCache.get(el);
      if (!s) {
        s = win.getComputedStyle(el);
        styleCache.set(el, s);
      }
      return s;
    },
    text(el, max) {
      const raw = el.textContent ?? '';
      if (raw.length <= 20_000 && 'innerText' in el) {
        return ((el as HTMLElement).innerText ?? raw).slice(0, max);
      }
      return raw.slice(0, max);
    },
    elementsAtPoint(x, y) {
      if (typeof doc.elementsFromPoint !== 'function') return [];
      try {
        return doc.elementsFromPoint(x, y);
      } catch {
        return [];
      }
    },
  };
}

export function intersectArea(r: Rect, vw: number, vh: number): number {
  const w = Math.max(0, Math.min(r.x + r.width, vw) - Math.max(r.x, 0));
  const h = Math.max(0, Math.min(r.y + r.height, vh) - Math.max(r.y, 0));
  return w * h;
}

export function isRendered(el: Element, probe: LayoutProbe): boolean {
  const s = probe.style(el);
  if (s.display === 'none' || s.visibility === 'hidden' || s.visibility === 'collapse')
    return false;
  if (Number.parseFloat(s.opacity || '1') < 0.05) return false;
  const r = probe.rect(el);
  return r.width > 1 && r.height > 1;
}

export function zIndexOf(el: Element, probe: LayoutProbe): number {
  const z = Number.parseInt(probe.style(el).zIndex, 10);
  return Number.isFinite(z) ? z : 0;
}

/**
 * Alpha of a computed color, 0 to 1. Computed colors are not always rgb():
 * browsers keep the space a color was written or mixed in, so oklab(), oklch(),
 * lab(), hsl() and color(srgb ...) all occur (Tailwind v4's bg-black/50 is a
 * color-mix that Chrome reports as oklab(0 0 0 / 0.5)).
 */
export function colorAlpha(color: string): number {
  const value = color.trim().toLowerCase();
  if (value === 'transparent') return 0;
  const args = value.match(/^[a-z-]+\((.*)\)$/)?.[1];
  if (args === undefined) return 1;
  let alpha: string | undefined;
  const slash = args.lastIndexOf('/');
  if (slash !== -1) {
    // Modern syntax: rgb(0 0 0 / 50%), oklch(0.5 0.1 30 / 0.4), color(srgb 0 0 0 / 0.5).
    alpha = args.slice(slash + 1).trim();
  } else {
    // Legacy comma syntax: rgba(0, 0, 0, 0.5), hsla(0, 0%, 0%, 0.5).
    const parts = args.split(',');
    if (parts.length === 4) alpha = parts[3]!.trim();
  }
  if (alpha === undefined) return 1;
  if (alpha === 'none') return 0;
  const n = alpha.endsWith('%') ? Number.parseFloat(alpha) / 100 : Number.parseFloat(alpha);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 1;
}

export function describeElement(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id && /^[\w-]{1,40}$/.test(el.id) ? `#${el.id}` : '';
  const classes = Array.from(el.classList)
    .filter((c) => /^[\w-]{1,40}$/.test(c))
    .slice(0, 3)
    .map((c) => `.${c}`)
    .join('');
  return `${tag}${id}${classes}`.slice(0, 120);
}
