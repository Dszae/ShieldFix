import type { z } from 'zod';
import type { Envelope, ErrorCode, UiRequestSchema, UiResponseMap } from '../../shared/messages';

type UiRequestInput = z.input<typeof UiRequestSchema>;

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function send<T extends UiRequestInput['type']>(
  message: Extract<UiRequestInput, { type: T }>,
): Promise<UiResponseMap[T]> {
  let response: Envelope<UiResponseMap[T]> | undefined;
  try {
    response = (await chrome.runtime.sendMessage(message)) as
      Envelope<UiResponseMap[T]> | undefined;
  } catch (err) {
    throw new ApiError(
      'internal',
      err instanceof Error ? err.message : 'ShieldFix is not responding.',
    );
  }
  if (!response)
    throw new ApiError('internal', 'ShieldFix is not responding. Try reopening this page.');
  if (!response.ok) throw new ApiError(response.error.code, response.error.message);
  return response.data;
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}

export function requestOrigins(origins: string[]): Promise<boolean> {
  return chrome.permissions.request({ origins }).catch(() => false);
}

export function removeOrigins(origins: string[]): Promise<boolean> {
  return chrome.permissions.remove({ origins }).catch(() => false);
}

export function extensionVersion(): string {
  return chrome.runtime.getManifest().version;
}

export function openDashboard(section = 'overview'): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(`dashboard.html#/${section}`) });
}
