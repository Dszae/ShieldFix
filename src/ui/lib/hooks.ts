import { useCallback, useEffect, useState } from 'react';
import type { Theme } from '../../shared/schemas';
import { errorMessage } from './api';

export interface AsyncState<T> {
  status: 'loading' | 'ready' | 'error';
  /** Latest successfully loaded data; kept while a refresh is in flight. */
  data: T | null;
  error: string | null;
  reload: () => void;
}

/**
 * Loads data and reloads whenever `deps` (primitives) change. Loading state is
 * derived from whether the last result belongs to the current dependencies, so
 * no state is set synchronously inside the effect.
 */
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

  useEffect(() => {
    let cancelled = false;
    load()
      .then((data) => {
        if (!cancelled) setResult({ key, data, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setResult((r) => ({ key, data: r.data, error: errorMessage(err) }));
      });
    return () => {
      cancelled = true;
    };
    // `load` is intentionally excluded: callers pass inline functions keyed by `deps`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

/** Increments whenever extension storage changes, so views can refresh live. */
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

/** Applies the theme to <html> and follows the OS setting when theme is "system". */
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

/** Brave exposes `navigator.brave.isBrave()`; also check UA client hints. Never essential. */
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
