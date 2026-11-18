import type { DetectionReport } from '../../src/shared/schemas';
import { expect, fixture, openFixture, test } from './fixtures';

test.describe('performance', () => {
  test('scan time on typical and large pages', async ({ context, ext }, testInfo) => {
    const results: Record<string, number[]> = {};
    for (const name of ['normal', 'fullscreen-modal', 'large-page']) {
      const { tabId } = await openFixture(context, ext, name);
      results[name] = [];
      for (let i = 0; i < 5; i++) {
        const r = await ext.data<DetectionReport>({ type: 'tab/scan', tabId, trigger: 'manual' });
        results[name]!.push(r.scanMs);
      }
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;
    const summary = Object.fromEntries(Object.entries(results).map(([k, v]) => [k, median(v)]));
    console.log('[perf] median scan ms', JSON.stringify(summary));
    testInfo.annotations.push({ type: 'scan-ms', description: JSON.stringify(summary) });
    expect(summary['normal']!).toBeLessThan(50);
    expect(summary['fullscreen-modal']!).toBeLessThan(50);
    expect(summary['large-page']!).toBeLessThan(150);
  });

  test('monitoring a page with constant DOM churn causes no long tasks', async ({
    context,
    ext,
  }) => {
    await ext.data({ type: 'site/update', hostname: '127.0.0.1', patch: { monitor: true } });
    await ext.data({ type: 'monitoring/sync' });
    const page = await context.newPage();
    await page.goto(fixture('churn'));
    await page.waitForTimeout(6000);
    const longTasks = await page.evaluate(
      () => (window as unknown as { __longTasks: number[] | null }).__longTasks,
    );
    const tabId = await ext.tabIdFor(fixture('churn'));
    const ping = await ext.page.evaluate(
      (id) => chrome.tabs.sendMessage(id, { type: 'cs/state' }, { frameId: 0 }),
      tabId,
    );
    console.log(
      '[perf] churn long tasks (ms):',
      JSON.stringify(longTasks),
      'content state ok:',
      ping?.ok,
    );
    expect(ping?.ok).toBe(true);
    if (longTasks !== null) expect(longTasks.length).toBe(0);
  });
});
