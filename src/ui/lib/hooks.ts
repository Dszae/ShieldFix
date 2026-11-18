import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import type { Theme } from '../../shared/schemas';
import { errorMessage } from './api';

export interface AsyncState<T> {
  status: 'loading' | 'ready' | 'error';
  data: T | null;
  error: string | null;
  reload: () => void;
}

export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [tick, setTick] = useState(0);
  const key = JSON.stringify([...deps, tick]);
  const [result, setResult] = useState<{
    key: string | null;
    data: T | null;
    error: string | null;
  }>({
    key: null,
    data: null,
    error: null,
  });

  const runLoad = useEffectEvent(() => load());

  useEffect(() => {
    let cancelled = false;
    runLoad()
      .then((data) => {
        if (!cancelled) setResult({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult((r) => ({ key, data: r.data, error: errorMessage(err) }));
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const current = result.key === key;
  return {
    status: !current ? 'loading' : result.error ? 'error' : 'ready',
    data: result.data,
    error: current ? result.error : null,
    reload,
  };
}

export function useStorageVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const listener = (_changes: unknown, area: string) => {
      if (area === 'local') setVersion((v) => v + 1);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);
  return version;
}

function resolveTheme(theme: Theme): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = resolveTheme(theme);
}

export function useTheme(theme: Theme | undefined): void {
  useEffect(() => {
    const t = theme ?? 'system';
    applyTheme(t);
    if (t !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);
}

declare global {
  interface Navigator {
    brave?: { isBrave?: () => Promise<boolean> };
  }
}

export function useIsBrave(): boolean | null {
  const [isBrave, setIsBrave] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } })
      .userAgentData?.brands;
    const byBrand = !!brands?.some((b) => /brave/i.test(b.brand));
    const check = navigator.brave?.isBrave?.() ?? Promise.resolve(false);
    check
      .then((v) => !cancelled && setIsBrave(v || byBrand))
      .catch(() => !cancelled && setIsBrave(byBrand));
    return () => {
      cancelled = true;
    };
  }, []);
  return isBrave;
}
