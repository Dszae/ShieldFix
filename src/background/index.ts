import { chromeArea } from '../storage/area';
import { Repository } from '../storage/repository';
import { createRouter } from './router';
import { TabStateStore } from './tabState';
import {
  chromeAction,
  chromeBadge,
  chromePermissions,
  chromeScripts,
  chromeTabs,
} from './gateways';

/**
 * Service worker entry point. All listeners are registered synchronously at the
 * top level, as Manifest V3 requires, so events wake the worker reliably.
 */

const repo = new Repository(chromeArea(chrome.storage.local));
const router = createRouter({
  extensionId: chrome.runtime.id,
  extensionOrigin: chrome.runtime.getURL(''),
  version: chrome.runtime.getManifest().version,
  repo,
  tabsState: new TabStateStore(chromeArea(chrome.storage.session)),
  tabs: chromeTabs,
  permissions: chromePermissions,
  scripts: chromeScripts,
  badge: chromeBadge,
  action: chromeAction,
});

function logError(context: string) {
  return (err: unknown) => console.error(`[ShieldFix] ${context}:`, err);
}

async function startup(): Promise<void> {
  await repo.migrate();
  await router.purge();
  await router.syncMonitoring();
}

chrome.runtime.onInstalled.addListener((details) => {
  startup()
    .then(async () => {
      if (details.reason === 'install') {
        await chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html#/welcome') });
      }
    })
    .catch(logError('install'));
});

chrome.runtime.onStartup.addListener(() => {
  startup().catch(logError('startup'));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  router
    .handle(message, sender)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: { code: 'internal', message: String(err) } }));
  return true; // async response
});

chrome.permissions.onAdded.addListener((permissions) => {
  router
    .onPermissionsChanged({ added: permissions.origins ?? [] })
    .catch(logError('permissions added'));
});

chrome.permissions.onRemoved.addListener((permissions) => {
  router
    .onPermissionsChanged({ removed: permissions.origins ?? [] })
    .catch(logError('permissions removed'));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') router.onTabLoading(tabId).catch(logError('tab update'));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  router.onTabLoading(tabId).catch(() => undefined);
});
