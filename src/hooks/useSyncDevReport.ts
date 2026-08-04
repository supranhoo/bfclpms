import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { rows as capturedRows, capturedAt } from 'virtual:dev-report-capture';
import { newestCaptureDate, type DevReportCaptureRow } from '@/lib/devReport/capture';

/**
 * ADR-246 — Development Report sync.
 * Pushes the build-time captured repo artefacts through the idempotent
 * `dev-report-ingest` edge function in bounded batches (POLICY §17).
 */
export const DEV_REPORT_SYNC_BATCH = 100;
/** Rows newer than this many days behind the newest artefact = stale report. */
export const DEV_REPORT_STALE_DAYS = 14;

export const devReportCapture = {
  rows: capturedRows as DevReportCaptureRow[],
  capturedAt,
  newestDate: newestCaptureDate(capturedRows as DevReportCaptureRow[]),
};

export function daysBetween(a: string, b: string): number {
  const d1 = Date.parse(`${a}T00:00:00Z`);
  const d2 = Date.parse(`${b}T00:00:00Z`);
  if (Number.isNaN(d1) || Number.isNaN(d2)) return 0;
  return Math.round((d2 - d1) / 86_400_000);
}

/** True when the stored report lags the captured artefacts by too much. */
export function isDevReportStale(
  storedMax: string | null | undefined,
  capturedMax: string | null,
  thresholdDays = DEV_REPORT_STALE_DAYS,
): boolean {
  if (!capturedMax) return false;
  if (!storedMax) return true;
  return daysBetween(storedMax, capturedMax) > thresholdDays;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface SyncResult {
  received: number;
  inserted: number;
  skipped: number;
  failedBatches: number;
}

export function useSyncDevReport() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (opts: { since?: string | null } = {}): Promise<SyncResult> => {
      const since = opts.since ?? null;
      const payload = devReportCapture.rows.filter((r) => !since || r.entry_date >= since);
      const result: SyncResult = {
        received: payload.length,
        inserted: 0,
        skipped: 0,
        failedBatches: 0,
      };
      for (const batch of chunk(payload, DEV_REPORT_SYNC_BATCH)) {
        const { data, error } = await supabase.functions.invoke('dev-report-ingest', {
          body: { entries: batch },
        });
        if (error) {
          result.failedBatches += 1;
          continue;
        }
        result.inserted += Number((data as { inserted?: number })?.inserted ?? 0);
        result.skipped += Number((data as { skipped_duplicates?: number })?.skipped_duplicates ?? 0);
      }
      if (result.failedBatches > 0 && result.inserted === 0) {
        throw new Error('Sync failed — no batches were accepted.');
      }
      return result;
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['dev-report-entries'] });
      toast({
        title: 'Development Report synced',
        description: `${r.inserted} new entr${r.inserted === 1 ? 'y' : 'ies'}, ${r.skipped} already present${
          r.failedBatches ? `, ${r.failedBatches} batch(es) failed` : ''
        }.`,
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Sync failed', description: e.message, variant: 'destructive' }),
  });
}