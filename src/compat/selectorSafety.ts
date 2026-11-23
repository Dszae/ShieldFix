export type SelectorCheck = { ok: true } | { ok: false; reason: string };

export const MAX_SELECTOR_LENGTH = 200;
const ALLOWED_CHARS = /^[A-Za-z0-9_\-#.[\]=:"'()\s>+~*^$|,]+$/;
const ALLOWED_PSEUDOS = new Set([
  'not',
  'first-child',
  'last-child',
  'only-child',
  'nth-child',
  'nth-of-type',
  'first-of-type',
  'last-of-type',
]);
const PROTECTED_TAGS = new Set(['html', 'head', 'body', 'main']);

function splitTopLevel(selector: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';
  for (const ch of selector) {
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(' || ch === '[') {
      depth++;
    } else if (ch === ')' || ch === ']') {
      depth--;
    } else if (depth === 0 && ch === separator) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function lastCompound(part: string): string {
  const pieces = splitTopLevel(part.replace(/\s*([>+~])\s*/g, ' ').trim(), ' ').filter(Boolean);
  return pieces[pieces.length - 1] ?? '';
}

export function checkSelectorSafety(input: string): SelectorCheck {
  const selector = input.trim();
  if (selector.length === 0) return { ok: false, reason: 'Selector is empty.' };
  if (selector.length > MAX_SELECTOR_LENGTH) {
    return { ok: false, reason: `Selector is longer than ${MAX_SELECTOR_LENGTH} characters.` };
  }
  if (!ALLOWED_CHARS.test(selector)) {
    return {
      ok: false,
      reason: 'Selector contains characters that are not allowed (for example \\ { } ; < @ /).',
    };
  }
  // A quoted attribute value is data: a ":" or bracket inside it is not part of
  // the selector ([class*="md:hidden"] has no :hidden pseudo-class). Blank the
  // values out before the bracket and pseudo-class checks. Backslashes are not
  // allowed, so a quote cannot be escaped and any quote left over is unclosed.
  const unquoted = selector.replace(/"[^"]*"|'[^']*'/g, 'q');
  if (/["']/.test(unquoted)) return { ok: false, reason: 'Selector has an unterminated quote.' };

  let balance = 0;
  for (const ch of unquoted) {
    if (ch === '(' || ch === '[') balance++;
    if (ch === ')' || ch === ']') balance--;
    if (balance < 0) return { ok: false, reason: 'Selector has unbalanced brackets.' };
  }
  if (balance !== 0) return { ok: false, reason: 'Selector has unbalanced brackets.' };

  const pseudoMatches = unquoted.match(/::?[a-zA-Z-]+/g) ?? [];
  for (const raw of pseudoMatches) {
    if (raw.startsWith('::')) return { ok: false, reason: 'Pseudo-elements are not allowed.' };
    const name = raw.slice(1).toLowerCase();
    if (!ALLOWED_PSEUDOS.has(name)) {
      return { ok: false, reason: `The pseudo-class ":${name}" is not allowed.` };
    }
  }

  const parts = splitTopLevel(selector, ',');
  if (parts.length > 3) return { ok: false, reason: 'Use at most 3 comma-separated selectors.' };
  for (const part of parts) {
    const compound = lastCompound(part);
    if (!compound) return { ok: false, reason: 'Selector has an empty part.' };
    const withoutNot = compound.replace(/:not\([^)]*\)/g, '');
    if (!/[#.[]/.test(withoutNot)) {
      return {
        ok: false,
        reason: 'Each selector must target an element by class, id or attribute.',
      };
    }
    const tag = withoutNot.match(/^[a-zA-Z][a-zA-Z0-9-]*/)?.[0]?.toLowerCase();
    if (tag && PROTECTED_TAGS.has(tag)) {
      return { ok: false, reason: `Rules may not target <${tag}> elements.` };
    }
    if (/^\*/.test(withoutNot) && !/[#.[]/.test(withoutNot.slice(1))) {
      return { ok: false, reason: 'Universal selectors are not allowed.' };
    }
  }
  return { ok: true };
}

export function isSyntacticallyValidSelector(selector: string, doc?: Document): boolean {
  const d = doc ?? (typeof document !== 'undefined' ? document : undefined);
  if (!d) return true;
  try {
    d.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
}
