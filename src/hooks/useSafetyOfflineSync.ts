import { useCallback, useEffect, useState } from 'react';
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

/**
 * useSafetyOfflineSync
 * --------------------
 * Watches the IndexedDB queue + browser online state. When the user comes
 * back online (or app loads with pending entries), drains the queue
 * sequentially. Every send is idempotent on the server thanks to
 * UNIQUE(reporter_id, client_submission_id), so retries are safe.
 *
 * Surfaced state:
 *   - pendingCount   — how many submissions are waiting.
 *   - isSyncing      — true while a flush is in flight.
 *   - flushNow()     — manual trigger for the UI button.
 *
 * Cache: invalidates ['safety'] on success so the list/detail pages refresh.
 */
export function useSafetyOfflineSync() {
  const { user } = useAuth();
  const qc = useQueryClient();
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

  const flushNow = useCallback(async () => {
    if (!user || isSyncing) return { sent: 0, failed: 0 };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return { sent: 0, failed: 0 };
    }
    setIsSyncing(true);
    let sent = 0;
    let failed = 0;
    try {
      // Best-effort: drop poisoned entries first.
      await pruneStalePending().catch(() => 0);
      const items = await listPendingIncidents();
      // Only flush this user's entries (multi-account on the same device).
      const mine = items.filter((it) => it.reporter_id === user.id);

      for (const it of mine) {
        try {
          await submitSafetyIncident({
            reporterId: user.id,
            payload: it.payload,
            files: adaptPendingFiles(it.files),
          });
          await deletePendingIncident(it.id);
          sent += 1;
        } catch (e: any) {
          failed += 1;
          await recordPendingFailure(it.id, e?.message ?? String(e));
        }
      }

      if (sent > 0) {
        toast.success(`Synced ${sent} offline incident${sent > 1 ? 's' : ''}`);
        qc.invalidateQueries({ queryKey: ['safety'] });
      }
      if (failed > 0 && sent === 0) {
        toast.error(`Could not sync ${failed} pending incident${failed > 1 ? 's' : ''}`);
      }
    } finally {
      setIsSyncing(false);
      await refreshCount();
    }
    return { sent, failed };
  }, [user, isSyncing, qc, refreshCount]);

  // Online/offline listeners + initial flush attempt.
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

  // Refresh count on mount + after each flush; lightweight polling for
  // cross-tab updates (a sibling tab may have queued a submission).
  useEffect(() => {
    void refreshCount();
    const id = window.setInterval(refreshCount, 15_000);
    return () => window.clearInterval(id);
  }, [refreshCount]);

  // First-load opportunistic flush (e.g., user reopened the app).
  useEffect(() => {
    if (user && isOnline) {
      void flushNow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return { pendingCount, isSyncing, isOnline, flushNow, refreshCount };
}