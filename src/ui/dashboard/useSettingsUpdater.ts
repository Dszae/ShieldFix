import { useState } from 'react';
import type { SettingsPatch } from '../../shared/schemas';
import { errorMessage, send } from '../lib/api';
import { useAnnounce } from '../components/announcerContext';

/** Saves a settings patch with busy/error state and a screen-reader announcement. */
export function useSettingsUpdater() {
  const announce = useAnnounce();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const update = async (patch: SettingsPatch, message?: string) => {
    const key = Object.keys(patch)[0] ?? '';
    setBusy(key);
    setError(null);
    try {
      await send({ type: 'settings/update', patch });
      if (message) announce(message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };
  return { update, error, setError, busy, setBusy };
}
