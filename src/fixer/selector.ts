import { checkSelectorSafety } from '../compat/selectorSafety';

/**
 * Builds a selector that identifies an element across page loads, for saving a
 * user-approved fix as a compatibility rule. Generated class names (CSS modules,
 * styled-components, hashes) change between builds, so they are skipped; when no
 * stable, unique selector exists, `null` is returned and no rule is offered.
 */

const PROTECTED = new Set(['html', 'head', 'body', 'main']);

export function isStableToken(token: string): boolean {
  if (token.length < 2 || token.length > 40) return false;
  if (!/^[A-Za-z_][\w-]*$/.test(token)) return false;
  if (/\d{4,}/.test(token)) return false;
  if (/^[a-f0-9]{6,}$/i.test(token)) return false;
  if (/^(?:css|sc|jsx|emotion|svelte|tw)-/i.test(token)) return false;
  if (/(?:^|[_-])[A-Za-z0-9]{5,}$/.test(token) && /[A-Z]/.test(token) && /\d/.test(token))
    return false;
  if (/__[A-Za-z0-9]{5}$/.test(token)) return false; // CSS modules: name__hash5
  return true;
}

function unique(doc: Document, selector: string, el: Element): boolean {
  try {
    const found = doc.querySelectorAll(selector);
    return found.length === 1 && found[0] === el;
  } catch {
    return false;
  }
}

function ownSelector(el: Element): string | null {
  const tag = el.tagName.toLowerCase();
  if (el.id && isStableToken(el.id)) return `#${el.id}`;
  const classes = Array.from(el.classList).filter(isStableToken).slice(0, 3);
  if (classes.length > 0) return `${tag}${classes.map((c) => `.${c}`).join('')}`;
  return null;
}

export function stableSelector(el: Element, doc: Document): string | null {
  const tag = el.tagName.toLowerCase();
  if (PROTECTED.has(tag)) return null;
  const own = ownSelector(el);
  const accept = (sel: string) => checkSelectorSafety(sel).ok && unique(doc, sel, el);

  if (own && accept(own)) return own;

  const parent = el.parentElement;
  if (parent && !PROTECTED.has(parent.tagName.toLowerCase())) {
    const parentSel = ownSelector(parent);
    if (parentSel && own) {
      const combined = `${parentSel} > ${own}`;
      if (accept(combined)) return combined;
    }
  } else if (parent && own) {
    const combined = `${parent.tagName.toLowerCase()} > ${own}`;
    // e.g. "body > div.adblock-wall" — allowed because the final compound has a class.
    if (accept(combined)) return combined;
  }
  return null;
}
