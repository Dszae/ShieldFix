import { CONTENT_SCRIPT_FILE, MONITOR_SCRIPT_ID } from '../shared/constants';
import {
  ShieldFixError,
  type Envelope,
  type ToContent,
  type ToContentResponseMap,
} from '../shared/messages';

/**
 * Thin wrappers around browser APIs. The router depends on these interfaces, so
 * its logic can be tested without a browser.
 */

export interface TabsGateway {
  getUrl(tabId: number): Promise<string | null>;
  send<T extends ToContent['type']>(
    tabId: number,
    message: Extract<ToContent, { type: T }>,
  ): Promise<ToContentResponseMap[T]>;
  inject(tabId: number): Promise<void>;
  create(url: string): Promise<void>;
}

export interface PermissionsGateway {
  contains(origins: string[]): Promise<boolean>;
  grantedOrigins(): Promise<string[]>;
}

export interface ScriptsGateway {
  registeredMatches(): Promise<string[] | null>;
  setMatches(matches: string[]): Promise<void>;
}

export interface BadgeGateway {
  set(tabId: number, state: 'issue' | 'possible' | 'fixed' | 'clear'): Promise<void>;
}

export interface ActionGateway {
  openPopup(): Promise<boolean>;
}

export const chromeTabs: TabsGateway = {
  async getUrl(tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      return tab.url ?? null;
    } catch {
      return null;
    }
  },
  async send(tabId, message) {
    let response: Envelope<unknown> | undefined;
    try {
      response = (await chrome.tabs.sendMessage(tabId, message, {
        frameId: 0,
      })) as Envelope<unknown>;
    } catch {
      throw new ShieldFixError('no-access', 'The page is not reachable.');
    }
    if (!response) throw new ShieldFixError('no-access', 'The page did not respond.');
    if (!response.ok) throw new ShieldFixError(response.error.code, response.error.message);
    return response.data as never;
  },
  async inject(tabId) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [0] },
        files: [CONTENT_SCRIPT_FILE],
      });
    } catch {
      throw new ShieldFixError(
        'no-access',
        'ShieldFix does not have access to this page. Click the ShieldFix toolbar button while the page is open, or allow ShieldFix to watch this site.',
      );
    }
  },
  async create(url) {
    await chrome.tabs.create({ url });
  },
};

export const chromePermissions: PermissionsGateway = {
  async contains(origins) {
    try {
      return await chrome.permissions.contains({ origins });
    } catch {
      return false;
    }
  },
  async grantedOrigins() {
    const all = await chrome.permissions.getAll();
    return all.origins ?? [];
  },
};

export const chromeScripts: ScriptsGateway = {
  async registeredMatches() {
    const scripts = await chrome.scripting.getRegisteredContentScripts({
      ids: [MONITOR_SCRIPT_ID],
    });
    return scripts[0]?.matches ?? null;
  },
  async setMatches(matches) {
    const existing = await chrome.scripting.getRegisteredContentScripts({
      ids: [MONITOR_SCRIPT_ID],
    });
    if (matches.length === 0) {
      if (existing.length > 0)
        await chrome.scripting.unregisterContentScripts({ ids: [MONITOR_SCRIPT_ID] });
      return;
    }
    const script: chrome.scripting.RegisteredContentScript = {
      id: MONITOR_SCRIPT_ID,
      js: [CONTENT_SCRIPT_FILE],
      matches,
      runAt: 'document_start',
      allFrames: false,
      persistAcrossSessions: true,
    };
    if (existing.length > 0) await chrome.scripting.updateContentScripts([script]);
    else await chrome.scripting.registerContentScripts([script]);
  },
};

const BADGE = {
  issue: { text: '!', color: '#C2410C', title: 'ShieldFix: anti-adblock warning detected' },
  possible: { text: '?', color: '#A16207', title: 'ShieldFix: possible compatibility issue' },
  fixed: { text: '✓', color: '#15803D', title: 'ShieldFix: reversible fix applied' },
  clear: { text: '', color: '#000000', title: 'ShieldFix' },
} as const;

export const chromeBadge: BadgeGateway = {
  async set(tabId, state) {
    const b = BADGE[state];
    try {
      await chrome.action.setBadgeText({ tabId, text: b.text });
      if (b.text) await chrome.action.setBadgeBackgroundColor({ tabId, color: b.color });
      await chrome.action.setTitle({ tabId, title: b.title });
    } catch {
      // Tab closed meanwhile.
    }
  },
};

export const chromeAction: ActionGateway = {
  async openPopup() {
    try {
      await chrome.action.openPopup();
      return true;
    } catch {
      return false;
    }
  },
};
