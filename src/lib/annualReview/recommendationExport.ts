/**
 * ADR-226 — Excel export for the Annual Review recommendation queue.
 * Column order is LOCKED (mirrors the legacy CSV header); changing it requires
 * updating src/test/annualReview/recommendationExcelExport.test.ts + DOCUMENTATION.md.
 */
import * as XLSX from 'xlsx';
import {
  fetchRecommendationQueue,
  formatRecommendationAmount,
  RECOMMENDATION_STATUS_LABEL,
  type RecommendationQueueFilters,
  type RecommendationQueueRow,
} from '@/services/annualReview/recommendations';

export const RECOMMENDATION_EXPORT_COLUMNS = [
  'Employee code', 'Employee', 'Department', 'Business unit', 'Designation',
  'Recommended by', 'Stage', 'Types', 'Amount asked', 'Amount approved',
  'Proposed designation', 'Proposed grade', 'Effective from', 'Rating',
  'Status', 'Source', 'Decision reason', 'Narrative',
] as const;

/** Batch size + hard cap for the "all filtered rows" export (POLICY §13). */
export const RECOMMENDATION_EXPORT_BATCH = 500;
export const MAX_RECOMMENDATION_EXPORT_ROWS = 50_000;

export function buildRecommendationRows(rows: RecommendationQueueRow[]): string[][] {
  return rows.map((r) => [
    r.employee_code ?? '',
    r.employee_name ?? '',
    r.department_name ?? '',
    r.business_unit_name ?? '',
    r.designation_name ?? '',
    r.reviewer_name ?? '',
    r.reviewer_role ?? '',
    (r.type_labels ?? []).join('; '),
    formatRecommendationAmount(r.amount_kind, r.amount_value),
    formatRecommendationAmount(r.approved_amount_kind, r.approved_amount_value),
    r.proposed_designation ?? '',
    r.proposed_grade ?? '',
    r.effective_from ?? '',
    r.final_rating ?? '',
    RECOMMENDATION_STATUS_LABEL[r.status] ?? r.status,
    r.source === 'legacy_import' ? 'Legacy import' : 'Review form',
    r.decision_reason ?? '',
    (r.narrative ?? '').replace(/\s+/g, ' ').trim(),
  ]);
}

/** Human-readable summary of the filters used, stamped into the sheet. */
export function describeRecommendationFilters(
  f: Pick<RecommendationQueueFilters, 'status' | 'typeKey' | 'monetaryOnly' | 'search' | 'source'>,
): string {
  const parts = [
    `Status: ${f.status ?? 'all'}`,
    `Type: ${f.typeKey ?? 'all'}`,
    `Monetary only: ${f.monetaryOnly ? 'yes' : 'no'}`,
    `Source: ${f.source ?? 'all'}`,
    `Search: ${f.search?.trim() ? f.search.trim() : '—'}`,
  ];
  return `Filters — ${parts.join('  |  ')}`;
}

export function buildRecommendationWorkbook(
  rows: RecommendationQueueRow[],
  filterNote: string,
): XLSX.WorkBook {
  const body = buildRecommendationRows(rows);
  const ws = XLSX.utils.aoa_to_sheet([
    [...RECOMMENDATION_EXPORT_COLUMNS],
    ...body,
  ]);
  XLSX.utils.sheet_add_aoa(
    ws,
    [[], [filterNote], [`Exported: ${new Date().toISOString()}  |  Rows: ${body.length}`]],
    { origin: -1 },
  );
  ws['!cols'] = RECOMMENDATION_EXPORT_COLUMNS.map((c) =>
    c === 'Narrative' ? { wch: 90 } : c === 'Decision reason' ? { wch: 40 } : { wch: 20 },
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Recommendations');
  return wb;
}

export function downloadRecommendationExcel(
  rows: RecommendationQueueRow[],
  filterNote: string,
  filename: string,
): void {
  XLSX.writeFile(buildRecommendationWorkbook(rows, filterNote), filename);
}

/**
 * Page through the queue RPC (RLS + filters preserved) until every matching row
 * is fetched or the hard cap is reached.
 */
export async function fetchAllRecommendationRows(
  filters: Omit<RecommendationQueueFilters, 'page' | 'pageSize'>,
  onProgress?: (fetched: number, total: number) => void,
): Promise<{ rows: RecommendationQueueRow[]; total: number; capped: boolean }> {
  const all: RecommendationQueueRow[] = [];
  let page = 0;
  let total = 0;

  for (;;) {
    const res = await fetchRecommendationQueue({
      ...filters,
      page,
      pageSize: RECOMMENDATION_EXPORT_BATCH,
    });
    total = res.total || total;
    all.push(...res.rows);
    onProgress?.(all.length, total);
    if (
      res.rows.length < RECOMMENDATION_EXPORT_BATCH ||
      all.length >= total ||
      all.length >= MAX_RECOMMENDATION_EXPORT_ROWS
    ) {
      break;
    }
    page += 1;
  }

  const capped = all.length > MAX_RECOMMENDATION_EXPORT_ROWS;
  return {
    rows: capped ? all.slice(0, MAX_RECOMMENDATION_EXPORT_ROWS) : all,
    total,
    capped: capped || total > MAX_RECOMMENDATION_EXPORT_ROWS,
  };
}