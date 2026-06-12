import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import {
  SAFETY_SEVERITY_LABELS,
  SAFETY_TYPE_LABELS,
  SAFETY_SLA_STATUS_LABELS,
} from '@/lib/safetyIncidents';

/**
 * Safety Incident Excel Export — Phase 4.
 * --------------------------------------
 * RLS-aware Excel (.xlsx) export of incidents for Safety Head / Admin.
 * Server-paginated 1000 rows/batch up to MAX_INCIDENT_EXPORT_ROWS. Uses
 * the same `safety_incidents_with_sla` view as the list page so RLS,
 * filters, and SLA derivation stay consistent. No mutations.
 *
 * Column order is LOCKED by spec and asserted by a unit test — do not
 * reorder without updating both the test and DOCUMENTATION.md.
 */

export const MAX_INCIDENT_EXPORT_ROWS = 50_000;
const PAGE = 1000;

export const INCIDENT_EXPORT_COLUMNS = [
  'Incident ID',
  'Type',
  'Severity',
  'Business Unit',
  'Created By',
  'Reported By',
  'Actual Reporter',
  'Assigned User',
  'Status',
  'SLA Status',
  'Created Date',
  'Closed Date',
  'Closure Remarks',
] as const;

export interface IncidentExportFilters {
  statuses?: string[];
  severityIds?: string[];
  typeIds?: string[];
  slaStatuses?: string[];
  buIds?: string[];
  search?: string;
  from?: string;
  to?: string;
}

export interface IncidentExportProgress {
  fetched: number;
  capped: boolean;
}

type RawRow = Record<string, any>;

async function fetchIncidentRows(
  filters: IncidentExportFilters,
  onProgress?: (p: IncidentExportProgress) => void,
  signal?: AbortSignal,
): Promise<{ rows: RawRow[]; capped: boolean }> {
  const rows: RawRow[] = [];
  let offset = 0;
  while (rows.length < MAX_INCIDENT_EXPORT_ROWS) {
    if (signal?.aborted) throw new Error('Cancelled');
    let q = supabase
      .from('safety_incidents_with_sla' as never)
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (filters.statuses?.length) q = q.in('status', filters.statuses);
    if (filters.severityIds?.length) q = q.in('severity_id', filters.severityIds);
    if (filters.typeIds?.length) q = q.in('incident_type_id', filters.typeIds);
    if (filters.slaStatuses?.length) q = q.in('sla_status', filters.slaStatuses);
    if (filters.buIds?.length) q = q.in('business_unit_id', filters.buIds);
    if (filters.from) q = q.gte('created_at', filters.from);
    if (filters.to) q = q.lte('created_at', filters.to);
    if (filters.search?.trim()) {
      const needle = filters.search.trim();
      q = q.or(
        `title.ilike.%${needle}%,location.ilike.%${needle}%,incident_number.ilike.%${needle}%`,
      );
    }
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as RawRow[];
    rows.push(...batch);
    onProgress?.({ fetched: rows.length, capped: false });
    if (batch.length < PAGE) break;
    offset += PAGE;
  }
  const capped = rows.length >= MAX_INCIDENT_EXPORT_ROWS;
  if (capped) rows.length = MAX_INCIDENT_EXPORT_ROWS;
  return { rows, capped };
}

async function hydrateLookups(rows: RawRow[]) {
  const buIds = new Set<string>();
  const profileIds = new Set<string>();
  for (const r of rows) {
    if (r.business_unit_id) buIds.add(r.business_unit_id);
    for (const k of ['reporter_id', 'actual_reporter_id', 'assigned_to', 'closed_by'] as const) {
      if (r[k]) profileIds.add(r[k]);
    }
  }
  const [buRes, profRes] = await Promise.all([
    buIds.size
      ? supabase.from('business_units').select('id,name,code').in('id', [...buIds])
      : Promise.resolve({ data: [] as any[], error: null }),
    profileIds.size
      ? supabase.from('profiles').select('id,full_name,employee_code').in('id', [...profileIds])
      : Promise.resolve({ data: [] as any[], error: null }),
  ]);
  const buMap = new Map<string, { name: string; code: string }>(
    (buRes.data ?? []).map((b: any) => [b.id, { name: b.name, code: b.code }]),
  );
  const profMap = new Map<string, { full_name: string; employee_code: string | null }>(
    (profRes.data ?? []).map((p: any) => [p.id, { full_name: p.full_name, employee_code: p.employee_code }]),
  );
  return { buMap, profMap };
}

function fmtPerson(p?: { full_name: string; employee_code: string | null }): string {
  if (!p) return '';
  return p.employee_code ? `${p.full_name} (${p.employee_code})` : p.full_name;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().replace('T', ' ').slice(0, 16);
}

export function rowToRecord(
  r: RawRow,
  buMap: Map<string, { name: string; code: string }>,
  profMap: Map<string, { full_name: string; employee_code: string | null }>,
): Record<string, string> {
  const bu = r.business_unit_id ? buMap.get(r.business_unit_id) : undefined;
  const typeLabel =
    r.type_label_snapshot ||
    (r.incident_type ? SAFETY_TYPE_LABELS[r.incident_type as keyof typeof SAFETY_TYPE_LABELS] : '') ||
    '';
  const sevLabel =
    r.severity_label_snapshot ||
    (r.severity ? SAFETY_SEVERITY_LABELS[r.severity as keyof typeof SAFETY_SEVERITY_LABELS] : '') ||
    '';
  const slaLabel = r.sla_status
    ? SAFETY_SLA_STATUS_LABELS[r.sla_status as keyof typeof SAFETY_SLA_STATUS_LABELS] ?? r.sla_status
    : '';
  return {
    'Incident ID': r.incident_number || r.id || '',
    'Type': typeLabel,
    'Severity': sevLabel,
    'Business Unit': bu ? (bu.code ? `${bu.name} (${bu.code})` : bu.name) : '',
    'Created By': fmtPerson(r.reporter_id ? profMap.get(r.reporter_id) : undefined),
    'Reported By': fmtPerson(r.reporter_id ? profMap.get(r.reporter_id) : undefined),
    'Actual Reporter': fmtPerson(r.actual_reporter_id ? profMap.get(r.actual_reporter_id) : undefined),
    'Assigned User': fmtPerson(r.assigned_to ? profMap.get(r.assigned_to) : undefined),
    'Status': String(r.status ?? '').replace(/_/g, ' '),
    'SLA Status': slaLabel,
    'Created Date': fmtDate(r.created_at),
    'Closed Date': fmtDate(r.closed_at),
    'Closure Remarks': r.verification_notes ?? '',
  };
}

export interface IncidentExportResult {
  fileName: string;
  rowCount: number;
  capped: boolean;
}

export async function exportIncidentsToExcel(
  filters: IncidentExportFilters,
  opts: { onProgress?: (p: IncidentExportProgress) => void; signal?: AbortSignal } = {},
): Promise<IncidentExportResult> {
  const { rows, capped } = await fetchIncidentRows(filters, opts.onProgress, opts.signal);
  const { buMap, profMap } = await hydrateLookups(rows);
  const records = rows.map((r) => rowToRecord(r, buMap, profMap));
  const ws = XLSX.utils.json_to_sheet(records, { header: [...INCIDENT_EXPORT_COLUMNS] });
  // Reasonable default column widths.
  ws['!cols'] = INCIDENT_EXPORT_COLUMNS.map((c) => ({
    wch: c === 'Closure Remarks' ? 40 : c.length + 14,
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Incidents');
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `safety-incidents-${stamp}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { fileName, rowCount: records.length, capped };
}