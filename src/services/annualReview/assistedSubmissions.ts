import { supabase } from '@/integrations/supabase/client';

/**
 * ADR-203 — Assisted (proxy) submission console data layer.
 *
 * Reads the immutable `annual_review_proxy_submissions` audit trail through
 * two SECURITY INVOKER RPCs, so the existing `arps_select_visible` RLS policy
 * remains the sole access authority (employee, assistant, manager/skip,
 * admin, hr_pms). Nothing here writes.
 */

export const ASSISTED_PAGE_SIZE = 25;

export type EvidenceFilter =
  | 'all'
  | 'has_selfie'
  | 'no_selfie'
  | 'has_photo'
  | 'no_photo'
  | 'none';

export const EVIDENCE_FILTER_OPTIONS: { value: EvidenceFilter; label: string }[] = [
  { value: 'all', label: 'All evidence states' },
  { value: 'has_selfie', label: 'Has live selfie' },
  { value: 'no_selfie', label: 'Missing live selfie' },
  { value: 'has_photo', label: 'Has uploaded photograph' },
  { value: 'no_photo', label: 'Missing uploaded photograph' },
  { value: 'none', label: 'No evidence at all' },
];

export interface AssistedFilters {
  cycleId?: string | null;
  from?: string | null;
  to?: string | null;
  proxyUserId?: string | null;
  departmentId?: string | null;
  businessUnitId?: string | null;
  evidence?: EvidenceFilter;
  search?: string | null;
}

export interface AssistedSubmissionRow {
  id: string;
  instance_id: string;
  cycle_id: string;
  captured_at: string;
  employee_id: string;
  employee_name: string | null;
  employee_code: string | null;
  department_id: string | null;
  department_name: string | null;
  business_unit_id: string | null;
  business_unit_name: string | null;
  proxy_user_id: string;
  proxy_name: string | null;
  proxy_code: string | null;
  proxy_role: string | null;
  has_selfie: boolean;
  has_photo: boolean;
  selfie_path: string | null;
  photo_upload_path: string | null;
  declaration_text: string | null;
  user_agent: string | null;
  ip: string | null;
  overall_status: string;
  total_count: number;
}

export interface AssistedSummary {
  total_assisted: number;
  missing_selfie: number;
  missing_photo: number;
  missing_both: number;
  distinct_assistors: number;
  total_submitted: number;
  assisted_pct: number;
  top_assistors: { proxy_user_id: string; proxy_name: string; proxy_code: string | null; cnt: number }[];
}

export interface AssistedPage {
  rows: AssistedSubmissionRow[];
  totalCount: number;
}

/** Nullify blanks so the RPC's `IS NULL` short-circuits kick in. */
function nullIfBlank(v: string | null | undefined): string | null {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
}

/**
 * Map UI filter state + page index to RPC arguments.
 * `to` is treated as an inclusive calendar day: the RPC compares `< p_to`,
 * so we push the boundary to the start of the following day.
 */
export function buildAssistedRpcArgs(filters: AssistedFilters, page: number, pageSize = ASSISTED_PAGE_SIZE) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 0;
  const to = nullIfBlank(filters.to);
  let toExclusive: string | null = null;
  if (to) {
    const d = new Date(`${to}T00:00:00`);
    d.setDate(d.getDate() + 1);
    toExclusive = d.toISOString();
  }
  const from = nullIfBlank(filters.from);
  return {
    p_cycle_id: nullIfBlank(filters.cycleId),
    p_from: from ? new Date(`${from}T00:00:00`).toISOString() : null,
    p_to: toExclusive,
    p_proxy_user_id: nullIfBlank(filters.proxyUserId),
    p_dept_id: nullIfBlank(filters.departmentId),
    p_bu_id: nullIfBlank(filters.businessUnitId),
    p_evidence: filters.evidence ?? 'all',
    p_search: nullIfBlank(filters.search),
    p_limit: pageSize,
    p_offset: safePage * pageSize,
  };
}

export async function fetchAssistedSubmissions(
  filters: AssistedFilters,
  page: number,
  pageSize = ASSISTED_PAGE_SIZE,
): Promise<AssistedPage> {
  const args = buildAssistedRpcArgs(filters, page, pageSize);
  const { data, error } = await (supabase as any).rpc('get_annual_review_assisted_submissions', args);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as AssistedSubmissionRow[];
  return { rows, totalCount: Number(rows[0]?.total_count ?? 0) };
}

export async function fetchAssistedSummary(cycleId?: string | null): Promise<AssistedSummary> {
  const { data, error } = await (supabase as any).rpc('get_annual_review_assisted_summary', {
    p_cycle_id: nullIfBlank(cycleId),
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as AssistedSummary | undefined;
  return row ?? {
    total_assisted: 0, missing_selfie: 0, missing_photo: 0, missing_both: 0,
    distinct_assistors: 0, total_submitted: 0, assisted_pct: 0, top_assistors: [],
  };
}

/** Human label for the evidence state of a row. */
export function evidenceLabel(row: Pick<AssistedSubmissionRow, 'has_selfie' | 'has_photo'>): string {
  if (row.has_selfie && row.has_photo) return 'Selfie + photo';
  if (row.has_selfie) return 'Selfie only';
  if (row.has_photo) return 'Photo only';
  return 'None';
}

export const ASSISTED_CSV_HEADERS = [
  'Employee', 'Employee Code', 'Department', 'Business Unit',
  'Assisted By', 'Assistant Code', 'Assistant Role', 'Captured At',
  'Live Selfie', 'Uploaded Photograph', 'Evidence', 'Review Status',
] as const;

/**
 * CSV export of the visible rows. Storage paths are deliberately reduced to
 * Yes/No presence flags — raw object paths must never leave the app
 * (POLICY §AR-ASSISTED-SUBMISSION-VISIBILITY).
 */
export function assistedRowsToCsv(rows: AssistedSubmissionRow[]): string {
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((r) => [
    r.employee_name ?? '', r.employee_code ?? '',
    r.department_name ?? '', r.business_unit_name ?? '',
    r.proxy_name ?? '', r.proxy_code ?? '', r.proxy_role ?? '',
    r.captured_at ?? '',
    r.has_selfie ? 'Yes' : 'No',
    r.has_photo ? 'Yes' : 'No',
    evidenceLabel(r),
    r.overall_status ?? '',
  ].map(escape).join(','));
  return [ASSISTED_CSV_HEADERS.join(','), ...body].join('\n');
}
