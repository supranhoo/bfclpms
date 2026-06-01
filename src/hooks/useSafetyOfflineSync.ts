/**
 * useSafetyOfflineSync
 * --------------------
 * Backwards-compatible re-export. The actual queue/poll/listener logic
 * now lives in `SafetyOfflineSyncContext` and runs exactly once per
 * SafetyLayout mount. All consumers (badge, inspector, incident form)
 * read from the shared context.
 *
 * Return shape is unchanged: { pendingCount, isSyncing, isOnline,
 * flushNow, flushOne, refreshCount }.
 */
export { useSafetyOfflineSyncContext as useSafetyOfflineSync } from '@/contexts/SafetyOfflineSyncContext';
export type { SafetyOfflineSyncValue } from '@/contexts/SafetyOfflineSyncContext';