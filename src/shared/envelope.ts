/**
 * Response envelope shared by all extension messaging. Kept free of runtime
 * dependencies so the content script stays small.
 */

export type ErrorCode =
  | 'invalid-request'
  | 'forbidden'
  | 'unsupported-page'
  | 'no-access'
  | 'not-found'
  | 'stale'
  | 'refused'
  | 'internal';

export type Envelope<T> =
  { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };

export class ShieldFixError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ShieldFixError';
  }
}

export function ok<T>(data: T): Envelope<T> {
  return { ok: true, data };
}

export function fail(code: ErrorCode, message: string): Envelope<never> {
  return { ok: false, error: { code, message } };
}

export function errorEnvelope(err: unknown): Envelope<never> {
  if (err instanceof ShieldFixError) return fail(err.code, err.message);
  const message = err instanceof Error ? err.message : String(err);
  return fail('internal', message);
}
