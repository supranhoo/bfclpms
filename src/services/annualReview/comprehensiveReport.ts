import { supabase } from '@/integrations/supabase/client';

export interface ComprehensiveRow {
  instance_id: string;
  employee_id: string;
  employee_code: string | null;
  employee_name: string | null;
  designation: string | null;
  department_id: string | null;
  department_name: string | null;
  business_unit_id: string | null;
  business_unit_name: string | null;
  division_id: string | null;
  division_name: string | null;
  grade: string | null;
  doj: string | null;
  overall_status: string;
  is_excluded: boolean;
  excluded_reason: string | null;
  enabled_stages: unknown;
  self_score: number | null;
  manager_score: number | null;
  dept_head_score: number | null;
  bu_head_score: number | null;
  hr_score: number | null;
  total_score: number | null;
  final_rating: string | null;
  finalized_at: string | null;
  updated_at: string | null;
  days_pending: number | null;
  manager_name: string | null;
  dept_head_name: string | null;
  bu_head_name: string | null;
  hr_name: string | null;
}

export async function fetchComprehensiveReport(cycleId: string): Promise<ComprehensiveRow[]> {
  if (!cycleId) return [];
  const { data, error } = await (supabase as any).rpc('get_annual_review_comprehensive_report', {
    p_cycle_id: cycleId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as ComprehensiveRow[];
}

export const STAGE_LABEL: Record<string, string> = {
  not_started: 'Not started',
  pending_self: 'Self',
  pending_manager: 'HOD / Manager',
  pending_skip: 'Skip Manager',
  pending_dept: 'Dept Head',
  pending_bu: 'BU Head',
  pending_hr: 'HR',
  completed: 'Completed',
  excluded: 'Excluded',
};

export function pendingWith(status: string): string {
  return STAGE_LABEL[status] ?? status;
}

export function eligibilityLabel(row: ComprehensiveRow): 'Eligible' | 'Excluded' {
  return row.is_excluded ? 'Excluded' : 'Eligible';
}

export function completionStatus(status: string): string {
  if (status === 'completed') return 'Completed';
  if (status === 'excluded') return 'Excluded';
  if (status === 'not_started' || status === 'pending_self') return 'Not started';
  return 'In progress';
}

export interface KpiSummary {
  total: number;
  eligible: number;
  excluded: number;
  pending_self: number;
  pending_hod: number;
  pending_bu: number;
  pending_hr: number;
  in_progress: number;
  completed: number;
  avg_final: number | null;
}

export function summarize(rows: ComprehensiveRow[]): KpiSummary {
  const s: KpiSummary = {
    total: rows.length,
    eligible: 0, excluded: 0,
    pending_self: 0, pending_hod: 0, pending_bu: 0, pending_hr: 0,
    in_progress: 0, completed: 0, avg_final: null,
  };
  let sum = 0, n = 0;
  for (const r of rows) {
    if (r.is_excluded) s.excluded++; else s.eligible++;
    switch (r.overall_status) {
      case 'pending_self': s.pending_self++; break;
      case 'pending_manager':
      case 'pending_skip':
      case 'pending_dept': s.pending_hod++; break;
      case 'pending_bu': s.pending_bu++; break;
      case 'pending_hr': s.pending_hr++; break;
      case 'completed': s.completed++; break;
    }
    if (!['completed','excluded','pending_self','not_started'].includes(r.overall_status)) s.in_progress++;
    if (r.total_score != null && !r.is_excluded) { sum += Number(r.total_score); n++; }
  }
  s.avg_final = n > 0 ? sum / n : null;
  return s;
}

export interface GroupSummary {
  key: string;
  name: string;
  total: number;
  eligible: number;
  excluded: number;
  self_done: number;
  hod_done: number;
  bu_done: number;
  hr_done: number;
  completed: number;
  submission_pct: number;
  avg_final: number | null;
}

export function groupBy(
  rows: ComprehensiveRow[],
  keyFn: (r: ComprehensiveRow) => { key: string; name: string },
): GroupSummary[] {
  const map = new Map<string, GroupSummary & { _sum: number; _n: number }>();
  for (const r of rows) {
    const { key, name } = keyFn(r);
    let g = map.get(key);
    if (!g) {
      g = { key, name, total: 0, eligible: 0, excluded: 0, self_done: 0, hod_done: 0, bu_done: 0, hr_done: 0, completed: 0, submission_pct: 0, avg_final: null, _sum: 0, _n: 0 };
      map.set(key, g);
    }
    g.total++;
    if (r.is_excluded) g.excluded++; else g.eligible++;
    // "Done" means that stage produced a submitted score (weighted_score present).
    if (r.self_score != null) g.self_done++;
    if (r.manager_score != null || r.dept_head_score != null) g.hod_done++;
    if (r.bu_head_score != null) g.bu_done++;
    if (r.hr_score != null) g.hr_done++;
    if (r.overall_status === 'completed') g.completed++;
    if (r.total_score != null && !r.is_excluded) { g._sum += Number(r.total_score); g._n++; }
  }
  const out: GroupSummary[] = [];
  for (const g of map.values()) {
    g.submission_pct = g.eligible > 0 ? Math.round((g.self_done / g.eligible) * 1000) / 10 : 0;
    g.avg_final = g._n > 0 ? Math.round((g._sum / g._n) * 100) / 100 : null;
    out.push(g);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export function ratingDistribution(rows: ComprehensiveRow[]): Array<{ rating: string; count: number; pct: number }> {
  const map = new Map<string, number>();
  let denom = 0;
  for (const r of rows) {
    if (r.is_excluded) continue;
    const key = r.final_rating?.trim() || 'Unrated';
    map.set(key, (map.get(key) ?? 0) + 1);
    denom++;
  }
  return Array.from(map.entries())
    .map(([rating, count]) => ({ rating, count, pct: denom > 0 ? Math.round((count / denom) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count);
}