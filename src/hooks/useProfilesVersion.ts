/**
 * useProfilesVersion — lightweight realtime version counter for the profiles table.
 *
 * Subscribes once to a Postgres-changes channel on `public.profiles`. Any
 * INSERT / UPDATE / DELETE bumps an in-memory counter and immediately
 * invalidates every cache listed in PROFILE_DEPENDENT_QUERY_KEYS.
 *
 * The counter is intentionally module-level so the channel + listener are
 * shared across the entire app — never one-channel-per-component.
 *
 * Returned `version` is appended to React Query keys in the affected hooks so
 * that any external profile change (HR import, bulk update, edge function,
 * direct DB edit) triggers a refetch even if the originating UI forgot to
 * call invalidateProfileCaches().
 */
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invalidateProfileCaches } from '@/lib/profileCacheKeys';

let version = 0;
const listeners = new Set<() => void>();
let channelStarted = false;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return version;
}

function bump() {
  version += 1;
  listeners.forEach(l => l());
}

function ensureChannel(onChange: () => void) {
  if (channelStarted) return;
  channelStarted = true;
  try {
    supabase
      .channel('profiles-version')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        bump();
        onChange();
      })
      .subscribe();
  } catch {
    // Realtime is best-effort — manual invalidation still works.
    channelStarted = false;
  }
}

export function useProfilesVersion(): number {
  const queryClient = useQueryClient();
  const [, setLocal] = useState(0);

  useEffect(() => {
    ensureChannel(() => invalidateProfileCaches(queryClient));
    const unsub = subscribe(() => setLocal(v => v + 1));
    return unsub;
  }, [queryClient]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
