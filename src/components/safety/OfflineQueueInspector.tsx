/**
 * Phase 4 + Phase 9 — Offline Queue Inspector (UI-only)
 * ------------------------------------------------------
 * Read-mostly sheet that surfaces the existing IndexedDB offline queue.
 * Strictly does NOT introduce any new writers to the queue contract.
 *
 * Allowed operations (pre-existing helpers only):
 *   - listPendingIncidents()    (read)
 *   - deletePendingIncident()   (existing, used by the sync engine)
 *   - useSafetyOfflineSync().flushNow()  (existing retry-all path)
 *   - useSafetyOfflineSync().flushOne(id) — Phase 9 single-item retry
 *     (same hook, same submitSafetyIncident pipeline, same dedup key — zero
 *     new contract; the inspector itself NEVER imports recordPendingFailure
 *     or enqueuePendingIncident; the regex guard still enforces this).
 *
 * Phase 9 additions (gated by `safety_settings.ui_offline_inspector_retry_v2`):
 *   - Per-item Retry button + error-class badge (network / conflict / server)
 *   - Attempt-severity chip colouring (fresh / warning / critical)
 *   - All / Failed / Pending filter pills
 *   - "Already received" rows surface a clearer "discard, safe" hint
 */
import { useCallback, useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertCircle,
  CheckCircle2,
  CloudOff,
  FileText,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  listPendingIncidents,
  deletePendingIncident,
  type PendingIncident,
} from '@/lib/safetyOfflineQueue';
import { useSafetyOfflineSync } from '@/hooks/useSafetyOfflineSync';
import { useSafetySettings } from '@/hooks/useSafetySettings';
import {
  classifyQueueError,
  attemptSeverity,
  type QueueErrorClass,
} from '@/lib/safetyOfflineErrorClassify';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { toast } from 'sonner';

interface Props {
  /** The clickable element rendered inside SheetTrigger (e.g. the offline badge). */
  trigger: React.ReactNode;
}

const RENDER_CAP = 200;

type Filter = 'all' | 'failed' | 'pending';

const CLASS_ICON: Record<QueueErrorClass, React.ComponentType<{ className?: string }>> = {
  none: CheckCircle2,
  network: CloudOff,
  conflict: ShieldAlert,
  server: AlertCircle,
  unknown: AlertCircle,
};

const SEVERITY_CLASS: Record<'fresh' | 'warning' | 'critical', string> = {
  fresh: 'text-muted-foreground',
  warning: 'text-amber-600 dark:text-amber-400',
  critical: 'text-destructive',
};

export function OfflineQueueInspector({ trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PendingIncident[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<PendingIncident | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const { flushNow, flushOne, isSyncing, isOnline } = useSafetyOfflineSync();
  const { data: settings = [] } = useSafetySettings();
  const v2Enabled =
    settings.find((r) => r.key === 'ui_offline_inspector_retry_v2')?.value === true;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const all = await listPendingIncidents();
      setItems(all.slice(0, RENDER_CAP));
    } catch (e) {
      setItems([]);
      toast.error((e as Error)?.message ?? 'Could not read offline queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleRetryAll = async () => {
    await flushNow();
    await refresh();
  };

  const handleRetryOne = async (id: string) => {
    setRetryingId(id);
    try {
      const { sent, failed } = await flushOne(id);
      if (sent === 0 && failed > 0) {
        toast.error('Retry failed — see error details on the row.');
      } else if (sent === 0 && failed === 0) {
        toast.info('Nothing to send — entry may already be gone.');
      }
      await refresh();
    } finally {
      setRetryingId(null);
    }
  };

  const handleDiscard = async (id: string) => {
    setDiscardingId(id);
    try {
      await deletePendingIncident(id);
      toast.success('Discarded queued submission');
      await refresh();
    } catch (e) {
      toast.error((e as Error)?.message ?? 'Could not discard');
    } finally {
      setDiscardingId(null);
      setPendingDelete(null);
    }
  };

  const allItems = items ?? [];
  const visible = v2Enabled
    ? allItems.filter((it) => {
        if (filter === 'failed') return it.attempts > 0 && !!it.last_error;
        if (filter === 'pending') return it.attempts === 0;
        return true;
      })
    : allItems;
  const total = allItems.length;
  const visibleCount = visible.length;
  const failedCount = allItems.filter((it) => it.attempts > 0 && !!it.last_error).length;
  const pendingCountInList = allItems.filter((it) => it.attempts === 0).length;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Offline Queue
            <Badge variant="outline">{total}</Badge>
          </SheetTitle>
          <SheetDescription>
            Incident reports waiting to sync. They will send automatically when you reconnect.
          </SheetDescription>
        </SheetHeader>

        <div className="flex items-center gap-2 mt-3">
          <Button
            size="sm"
            onClick={handleRetryAll}
            disabled={isSyncing || !isOnline || total === 0}
            className="gap-1"
          >
            {isSyncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Retry all
          </Button>
          {!isOnline && (
            <span className="text-xs text-muted-foreground">Offline — connect to retry.</span>
          )}
        </div>

        {v2Enabled && total > 0 && (
          <div
            className="flex items-center gap-1.5 mt-3"
            role="tablist"
            aria-label="Filter queued submissions"
            data-testid="offline-filter-pills"
          >
            {(
              [
                { id: 'all', label: 'All', count: total },
                { id: 'failed', label: 'Failed', count: failedCount },
                { id: 'pending', label: 'Pending', count: pendingCountInList },
              ] as Array<{ id: Filter; label: string; count: number }>
            ).map((p) => (
              <Button
                key={p.id}
                size="sm"
                variant={filter === p.id ? 'default' : 'outline'}
                onClick={() => setFilter(p.id)}
                className="h-7 px-2.5 text-xs gap-1.5"
                role="tab"
                aria-selected={filter === p.id}
              >
                {p.label}
                <Badge
                  variant={filter === p.id ? 'secondary' : 'outline'}
                  className="h-4 px-1 text-[10px]"
                >
                  {p.count}
                </Badge>
              </Button>
            ))}
          </div>
        )}

        <ScrollArea className="flex-1 mt-3 -mx-6 px-6">
          {loading && items === null ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : visibleCount === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {total === 0 ? 'No queued submissions.' : 'No submissions match this filter.'}
            </p>
          ) : (
            <ul className="space-y-3 py-2">
              {visible.map((it) => {
                const meta = classifyQueueError(it.last_error, it.attempts);
                const sev = attemptSeverity(it.attempts);
                const ClassIcon = CLASS_ICON[meta.cls];
                return (
                  <li
                    key={it.id}
                    className="rounded-lg border p-3 space-y-2 bg-card"
                    data-testid="queued-item"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {it.payload?.title || 'Untitled incident'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Queued {formatDistanceToNow(new Date(it.created_at), { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {v2Enabled && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1 px-2"
                            onClick={() => handleRetryOne(it.id)}
                            disabled={
                              !isOnline ||
                              retryingId === it.id ||
                              isSyncing ||
                              meta.cls === 'conflict'
                            }
                            title={
                              meta.cls === 'conflict'
                                ? 'Already on the server — discard instead'
                                : 'Retry this submission'
                            }
                          >
                            {retryingId === it.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3.5 w-3.5" />
                            )}
                            Retry
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            v2Enabled ? setPendingDelete(it) : handleDiscard(it.id)
                          }
                          disabled={discardingId === it.id}
                          aria-label="Discard queued submission"
                        >
                          {discardingId === it.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      {v2Enabled && it.attempts > 0 && (
                        <Badge
                          variant="outline"
                          className={`gap-1 ${SEVERITY_CLASS[sev]}`}
                          data-testid="attempt-severity"
                        >
                          <RefreshCw className="h-3 w-3" />
                          {it.attempts} attempt{it.attempts > 1 ? 's' : ''}
                        </Badge>
                      )}
                      {!v2Enabled && it.attempts > 0 && (
                        <Badge variant="outline" className="gap-1">
                          <RefreshCw className="h-3 w-3" />
                          {it.attempts} attempt{it.attempts > 1 ? 's' : ''}
                        </Badge>
                      )}
                      {it.files.length > 0 && (
                        <Badge variant="outline" className="gap-1">
                          <FileText className="h-3 w-3" />
                          {it.files.length} file{it.files.length > 1 ? 's' : ''}
                        </Badge>
                      )}
                      {v2Enabled && meta.cls !== 'none' && (
                        <Badge
                          variant={meta.cls === 'conflict' ? 'secondary' : 'destructive'}
                          className="gap-1"
                          data-testid={`error-class-${meta.cls}`}
                        >
                          <ClassIcon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                      )}
                    </div>

                    {it.files.length > 0 && (
                      <ul className="text-xs text-muted-foreground space-y-0.5 pl-1">
                        {it.files.slice(0, 5).map((f, idx) => (
                          <li key={idx} className="truncate">
                            • {f.name}
                            {f.size ? ` (${Math.max(1, Math.round(f.size / 1024))} KB)` : ''}
                          </li>
                        ))}
                        {it.files.length > 5 && (
                          <li className="italic">+{it.files.length - 5} more…</li>
                        )}
                      </ul>
                    )}

                    {it.last_error && (
                      <div className="space-y-1">
                        {v2Enabled && (
                          <p className="text-xs text-muted-foreground">{meta.hint}</p>
                        )}
                        <div className="flex items-start gap-1.5 text-xs text-destructive">
                          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span className="break-words">{it.last_error}</span>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        {v2Enabled && pendingDelete && (
          <ConfirmDestructiveDialog
            open={!!pendingDelete}
            onCancel={() => setPendingDelete(null)}
            onConfirm={() => handleDiscard(pendingDelete.id)}
            title="Discard queued submission?"
            description={
              pendingDelete.last_error
                ? `This entry has ${pendingDelete.attempts} failed attempt${
                    pendingDelete.attempts === 1 ? '' : 's'
                  }. Discarding it deletes the draft from this device.`
                : 'This draft will be removed from this device. Anything already sent to the server is unaffected.'
            }
            confirmLabel="Discard"
            isLoading={discardingId === pendingDelete.id}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}