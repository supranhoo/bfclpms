import { supabase } from '@/integrations/supabase/client';

/**
 * Safety Data Export — Phase 6
 * ---------------------------
 * RLS-aware CSV export for Safety tables. Server-paginates 1000 rows/batch
 * up to MAX_EXPORT_ROWS to protect the client. No mutations.
 */

export const MAX_EXPORT_ROWS = 50_000;
const PAGE = 1000;

export type DatasetKey =
  | 'incidents'
  | 'assets'
  | 'audit_runs'
  | 'permits'
  | 'drills';

interface DatasetDef {
  key: DatasetKey;
  label: string;
  table: string;
  columns: string[];
  dateColumn?: string;
  orderBy: string;
}

export const DATASETS: DatasetDef[] = [
  {
    key: 'incidents',
    label: 'Incidents',
    table: 'safety_incidents',
    columns: ['id', 'ref_code', 'title', 'severity', 'stage', 'status', 'occurred_at', 'reported_at', 'business_unit_id', 'department_id', 'reporter_id', 'actual_reporter_id', 'assigned_to', 'closed_at'],
    dateColumn: 'occurred_at',
    orderBy: 'occurred_at',
  },
  {
    key: 'assets',
    label: 'Assets & Calibration',
    table: 'safety_assets',
    columns: ['id', 'asset_code', 'name', 'category', 'status', 'business_unit_id', 'department_id', 'next_calibration_at', 'created_at'],
    dateColumn: 'created_at',
    orderBy: 'created_at',
  },
  {
    key: 'audit_runs',
    label: 'Audit Runs',
    table: 'safety_audit_runs',
    columns: ['id', 'template_id', 'status', 'score', 'started_at', 'completed_at', 'assigned_to', 'business_unit_id'],
    dateColumn: 'started_at',
    orderBy: 'started_at',
  },
  {
    key: 'permits',
    label: 'Permits to Work',
    table: 'safety_permits',
    columns: ['id', 'permit_no', 'permit_type', 'status', 'requested_by', 'valid_from', 'valid_to', 'business_unit_id'],
    dateColumn: 'valid_from',
    orderBy: 'valid_from',
  },
  {
    key: 'drills',
    label: 'Emergency Drills',
    table: 'safety_emergency_drills',
    columns: ['id', 'title', 'drill_type', 'scheduled_at', 'conducted_at', 'status', 'business_unit_id'],
    dateColumn: 'scheduled_at',
    orderBy: 'scheduled_at',
  },
];

export function getDataset(key: DatasetKey): DatasetDef {
  const d = DATASETS.find((x) => x.key === key);
  if (!d) throw new Error(`Unknown dataset: ${key}`);
  return d;
}

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    try { return escapeCell(JSON.stringify(v)); } catch { return ''; }
  }
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function rowsToCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const head = columns.join(',');
  const body = rows.map((r) => columns.map((c) => escapeCell(r[c])).join(','));
  return [head, ...body].join('\n');
}

export interface ExportProgress {
  fetched: number;
  capped: boolean;
}

export async function fetchDatasetRows(
  key: DatasetKey,
  opts: { from?: string; to?: string; onProgress?: (p: ExportProgress) => void; signal?: AbortSignal } = {},
): Promise<{ rows: Record<string, unknown>[]; capped: boolean; columns: string[] }> {
  const def = getDataset(key);
  const select = def.columns.join(',');
  const rows: Record<string, unknown>[] = [];
  let offset = 0;
  while (rows.length < MAX_EXPORT_ROWS) {
    if (opts.signal?.aborted) throw new Error('Cancelled');
    let q = supabase
      .from(def.table as any)
      .select(select)
      .order(def.orderBy, { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (def.dateColumn && opts.from) q = q.gte(def.dateColumn, opts.from);
    if (def.dateColumn && opts.to) q = q.lte(def.dateColumn, opts.to);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...batch);
    opts.onProgress?.({ fetched: rows.length, capped: false });
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  const capped = rows.length >= MAX_EXPORT_ROWS;
  if (capped) rows.length = MAX_EXPORT_ROWS;
  return { rows, capped, columns: def.columns };
}

export function triggerCsvDownload(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}