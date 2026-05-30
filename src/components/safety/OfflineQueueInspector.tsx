/**
 * Phase 4 — Offline Queue Inspector (UI-only)
 * -------------------------------------------
 * Read-mostly sheet that surfaces the existing IndexedDB offline queue.
 * Strictly does NOT introduce any new writers to the queue contract.
 * Allowed operations are pre-existing helpers only:
 *   - listPendingIncidents()    (read)
 *   - countPendingIncidents()   (read, via badge)
 *   - deletePendingIncident()   (existing, used by the sync engine)
 *   - useSafetyOfflineSync().flushNow()  (existing retry path)
 *
 * Phase 4 governance: NO new direct calls to safety_incident_evidence
 * inserts, safety-media uploads, or client_submission_id assignment.
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
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  listPendingIncidents,
  deletePendingIncident,
  type PendingIncident,
} from '@/lib/safetyOfflineQueue';
import { useSafetyOfflineSync } from '@/hooks/useSafetyOfflineSync';
import { toast } from 'sonner';

interface Props {
  /** The clickable element rendered inside SheetTrigger (e.g. the offline badge). */
  trigger: React.ReactNode;
}

const RENDER_CAP = 200;

export function OfflineQueueInspector({ trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PendingIncident[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [discardingId, setDiscardingId] = useState<string | null>(null);
  const { flushNow, isSyncing, isOnline } = useSafetyOfflineSync();

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
    }
  };

  const total = items?.length ?? 0;

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

        <ScrollArea className="flex-1 mt-3 -mx-6 px-6">
          {loading && items === null ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : total === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No queued submissions.
            </p>
          ) : (
            <ul className="space-y-3 py-2">
              {items!.map((it) => (
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
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDiscard(it.id)}
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

                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {it.attempts > 0 && (
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
                    <div className="flex items-start gap-1.5 text-xs text-destructive">
                      <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="break-words">{it.last_error}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}