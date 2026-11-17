import {
  DetectionReportSchema,
  DetectionLevelSchema,
  type DetectionReport,
} from '../shared/schemas';
import { z } from 'zod';
import type { StorageArea } from '../storage/area';

const TabRecordSchema = z.object({
  hostname: z.string(),
  report: DetectionReportSchema.nullable(),
  /** Last level written to history for this page load (de-duplicates history). */
  recordedLevel: DetectionLevelSchema.nullable(),
  recordedFix: z.boolean(),
});
export type TabRecord = z.infer<typeof TabRecordSchema>;

/**
 * Per-tab state kept in chrome.storage.session (memory only, cleared when the
 * browser closes) so it survives service-worker restarts.
 */
export class TabStateStore {
  constructor(private readonly area: StorageArea) {}

  private key(tabId: number): string {
    return `tab:${tabId}`;
  }

  async get(tabId: number): Promise<TabRecord | null> {
    const raw = (await this.area.get([this.key(tabId)]))[this.key(tabId)];
    const parsed = TabRecordSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  async saveReport(tabId: number, report: DetectionReport): Promise<TabRecord> {
    const existing = await this.get(tabId);
    const sameSite = existing?.hostname === report.hostname;
    const record: TabRecord = {
      hostname: report.hostname,
      report,
      recordedLevel: sameSite ? existing.recordedLevel : null,
      recordedFix: sameSite ? existing.recordedFix : false,
    };
    await this.area.set({ [this.key(tabId)]: record });
    return record;
  }

  async markRecorded(
    tabId: number,
    patch: Partial<Pick<TabRecord, 'recordedLevel' | 'recordedFix'>>,
  ): Promise<void> {
    const existing = await this.get(tabId);
    if (!existing) return;
    await this.area.set({ [this.key(tabId)]: { ...existing, ...patch } });
  }

  async clear(tabId: number): Promise<void> {
    await this.area.remove([this.key(tabId)]);
  }

  async clearAll(): Promise<void> {
    await this.area.clear();
  }
}
