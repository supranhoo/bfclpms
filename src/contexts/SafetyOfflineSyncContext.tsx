import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  countPendingIncidents,
  deletePendingIncident,
  listPendingIncidents,
  pruneStalePending,
  recordPendingFailure,
} from '@/lib/safetyOfflineQueue';
import { adaptPendingFiles, submitSafetyIncident } from '@/lib/safetyIncidentSubmit';
import { useImageCompressionSettings } from '@/hooks/useImageCompressionSettings';

/**
 * SafetyOfflineSyncContext
 * ------------------------
 * Singleton home for the Safety offline-queue sync loop. Previously the
 * `useSafetyOfflineSync` hook ran independently in each of its consumers
 * (badge, inspector, incident form), which meant three setInterval polls
 * and three online/offline listener pairs were active whenever a user
 * was anywhere in /safety/*.
 *
 * Now the provider runs the loop ONCE at the SafetyLayout level and every
 * consumer reads the same state via `useSafetyOfflineSync()`. The public
 * hook surface (return shape) is unchanged for backwards compatibility.
 */

export interface SafetyOfflineSyncValue {
  pendingCount: number;
  isSyncing: boolean;
  isOnline: boolean;
  flushNow: () => Promise<{ sent: number; failed: number }>;
  flushOne: (id: string) => Promise<{ sent: number; failed: number }>;
  refreshCount: () => Promise<void>;
}

const SafetyOfflineSyncContext = createContext<SafetyOfflineSyncValue | null>(null);

/** Internal worker hook — kept private so it can only be instantiated by the provider. */
function useSafetyOfflineSyncInternal(): SafetyOfflineSyncValue {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { enabled: compressionEnabled, policy: compressionPolicy } =
    useImageCompressionSettings();
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  const refreshCount = useCallback(async () => {
    try {
      setPendingCount(await countPendingIncidents());
    } catch {
      setPendingCount(0);
    }
  }, []);

  const flushInternal = useCallback(async (onlyId?: string) => {
    if (!user || isSyncing) return { sent: 0, failed: 0 };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { sent: 0, failed: 0 };
    }
    setIsSyncing(true);
    let sent = 0;
    let failed = 0;
    try {
      await pruneStalePending().catch(() => 0);
      const items = await listPendingIncidents();
      const mine = items.filter(
        (it) => it.reporter_id === user.id && (!onlyId || it.id === onlyId),
      );

      for (const it of mine) {
        try {
          await submitSafetyIncident({
            reporterId: user.id,
            payload: it.payload,
            files: adaptPendingFiles(it.files),
            compression: {
              enabled: compressionEnabled,
              policy: compressionPolicy,
              severityHint: it.payload?.severity ?? null,
            },
          });
          await deletePendingIncident(it.id);
          sent += 1;
        } catch (e: any) {
          failed += 1;
          await recordPendingFailure(it.id, e?.message ?? String(e));
        }
      }

      if (sent > 0 && !onlyId) {
        toast.success(`Synced ${sent} offline incident${sent > 1 ? 's' : ''}`);
        qc.invalidateQueries({ queryKey: ['safety'] });
      } else if (sent > 0 && onlyId) {
        toast.success('Synced queued incident');
        qc.invalidateQueries({ queryKey: ['safety'] });
      }
      if (failed > 0 && sent === 0 && !onlyId) {
        toast.error(`Could not sync ${failed} pending incident${failed > 1 ? 's' : ''}`);
      }
    } finally {
      setIsSyncing(false);
      await refreshCount();
    }
    return { sent, failed };
  }, [user, isSyncing, qc, refreshCount, compressionEnabled, compressionPolicy]);

  const flushNow = useCallback(() => flushInternal(), [flushInternal]);
  const flushOne = useCallback(
    (id: string) => flushInternal(id),
    [flushInternal],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => {
      setIsOnline(true);
      void flushNow();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [flushNow]);

  useEffect(() => {
    void refreshCount();
    const id = window.setInterval(refreshCount, 15_000);
    return () => window.clearInterval(id);
  }, [refreshCount]);

  useEffect(() => {
    if (user && isOnline) {
      void flushNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { pendingCount, isSyncing, isOnline, flushNow, flushOne, refreshCount };
}

export function SafetyOfflineSyncProvider({ children }: { children: ReactNode }) {
  const value = useSafetyOfflineSyncInternal();
  return (
    <SafetyOfflineSyncContext.Provider value={value}>
      {children}
    </SafetyOfflineSyncContext.Provider>
  );
}

/**
 * Public consumer. Identical return shape to the previous standalone hook,
 * but reads from a shared singleton context so the 15s poll / online
 * listeners only run once per SafetyLayout mount.
 */
export function useSafetyOfflineSyncContext(): SafetyOfflineSyncValue {
  const ctx = useContext(SafetyOfflineSyncContext);
  if (!ctx) {
    throw new Error(
      'useSafetyOfflineSync must be used inside <SafetyOfflineSyncProvider> (mount it in SafetyLayout).',
    );
  }
  return ctx;
}