import { errorEnvelope, fail, ok, type Envelope } from '../shared/envelope';
import type {
  ContentConfig,
  ContentRequest,
  ContentResponseMap,
  ToContent,
} from '../shared/messages';
import { ContentController, type Bridge } from './controller';
import { parseToContent } from './validate';

/**
 * Content script entry. Runs in the isolated world of top-level http(s) pages:
 *  - injected on demand (activeTab) when the user opens the popup, or
 *  - registered at document_start for sites the user chose to monitor.
 * It never communicates with page scripts and accepts messages only from the
 * ShieldFix extension itself.
 */

declare global {
  var __shieldfixController: ContentController | undefined;
}

async function request<T extends ContentRequest['type']>(
  message: Extract<ContentRequest, { type: T }>,
): Promise<ContentResponseMap[T]> {
  const response = (await chrome.runtime.sendMessage(message)) as
    Envelope<ContentResponseMap[T]> | undefined;
  if (!response) throw new Error('No response from ShieldFix.');
  if (!response.ok) throw new Error(response.error.message);
  return response.data;
}

const bridge: Bridge = {
  getConfig: () => request<'content/config'>({ type: 'content/config' }) as Promise<ContentConfig>,
  report: (report) => {
    request<'content/report'>({ type: 'content/report', report }).catch(() => undefined);
  },
  fixEvent: (event, report) => {
    request<'content/fixEvent'>({ type: 'content/fixEvent', event, report }).catch(() => undefined);
  },
  openPopup: async () => (await request<'content/openPopup'>({ type: 'content/openPopup' })).opened,
};

async function handle(controller: ContentController, msg: ToContent): Promise<unknown> {
  switch (msg.type) {
    case 'cs/ping':
      return { alive: true, monitoring: controller.isMonitoring };
    case 'cs/scan':
      return controller.scan(msg.trigger);
    case 'cs/state':
      return controller.getState();
    case 'cs/previewFix':
      await controller.refreshConfig();
      return controller.previewFix(msg.candidateId);
    case 'cs/applyFix':
      return controller.applyFix(msg.candidateId);
    case 'cs/revertFix':
      return controller.revertFix();
    case 'cs/configChanged':
      await controller.refreshConfig();
      return null;
  }
}

function boot(): void {
  if (globalThis.__shieldfixController) return; // already running in this document
  if (window.top !== window) return; // top frame only
  const controller = new ContentController(window, bridge);
  globalThis.__shieldfixController = controller;

  // When registered at document_start, capture failed resource loads from the beginning.
  const early = document.readyState === 'loading';
  if (early) controller.recorder.start(window);

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id) return false;
    const parsed = parseToContent(message);
    if (!parsed) {
      sendResponse(fail('invalid-request', 'Invalid message.'));
      return false;
    }
    handle(controller, parsed)
      .then((data) => sendResponse(ok(data)))
      .catch((err: unknown) => sendResponse(errorEnvelope(err)));
    return true;
  });

  controller
    .refreshConfig()
    .then((config) => {
      if (config?.monitoring) controller.startMonitoring();
      else if (early) controller.recorder.stop(window);
    })
    .catch(() => {
      if (early) controller.recorder.stop(window);
    });
}

boot();
