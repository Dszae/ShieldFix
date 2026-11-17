/**
 * Layout probe: the only place the detection engine touches layout APIs.
 * Abstracting it keeps the engine unit-testable in DOM environments that do not
 * perform layout, and lets each scan cache computed styles.
 */

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
  /** Visible text of an element, truncated to `max` characters. */
  text(el: Element, max: number): string;
  /** Elements at a viewport point, topmost first. Empty when unsupported. */
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
      // innerText forces layout and is expensive on large subtrees; only use it
      // for reasonably sized elements, where it correctly excludes hidden text.
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

/** Parse the alpha channel of a computed `rgb()/rgba()` colour. */
export function colorAlpha(color: string): number {
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (!m?.[1]) return color === 'transparent' ? 0 : 1;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 4) return 1;
  const a = parts[3] ?? '1';
  return a.endsWith('%') ? Number.parseFloat(a) / 100 : Number.parseFloat(a);
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
