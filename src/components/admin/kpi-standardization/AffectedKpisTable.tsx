import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { pageModes, columnHasVariety, isOutlier } from '@/lib/scannerCellHighlight';

/**
 * Paginated drill-in table showing the actual `kpis` rows that match a given
 * (category_id, kra_name, kpi_name) signature, optionally scoped to a period.
 * Used by Build Registry, Review Registry, and Correct May KPIs to show the
 * detailed employee-level impact of a standardization action.
 */
interface Props {
  categoryId: string;
  kraName: string;
  kpiName: string;
  reviewPeriod?: string;
  reviewYear?: number;
}

const PAGE_SIZE = 25;
const SCALE_KEYS = ['frequency', 'r0', 'r1', 'r2', 'r3', 'r4', 'r5'] as const;
const SHOW_SCALE_LS_KEY = 'affectedKpisTable.showScale';

function fmt(v: string | null | undefined): string {
  if (v == null) return '—';
  const s = String(v).trim();
  return s.length === 0 ? '—' : s;
}

export function AffectedKpisTable({ categoryId, kraName, kpiName, reviewPeriod, reviewYear }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, { name: string }>>({});
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showScale, setShowScale] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem(SHOW_SCALE_LS_KEY);
    return v === null ? true : v === '1';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SHOW_SCALE_LS_KEY, showScale ? '1' : '0');
  }, [showScale]);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('kpis' as any)
        .select(
          'id, employee_id, review_period, review_year, weightage, status, frequency, criteria, uom, r0, r1, r2, r3, r4, r5',
          { count: 'exact' },
        )
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName);
      if (reviewPeriod) query = query.eq('review_period', reviewPeriod);
      if (reviewYear) query = query.eq('review_year', reviewYear);
      const { data, count: total, error } = await query
        .order('review_year', { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      setRows((data as any[]) || []);
      setCount(total ?? 0);

      const empIds = Array.from(new Set((data as any[] || []).map(r => r.employee_id)));
      if (empIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', empIds);
        const map: Record<string, { name: string }> = {};
        (profs || []).forEach((p: any) => { map[p.id] = { name: p.full_name }; });
        setEmployees(map);
      }
    } catch (e) {
      console.error('AffectedKpisTable fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, [categoryId, kraName, kpiName, reviewPeriod, reviewYear, page]);

  useEffect(() => { fetchPage(); }, [fetchPage]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  // Per-page mode + variety for outlier highlighting.
  const modes = useMemo(() => pageModes(rows, SCALE_KEYS), [rows]);
  const variety = useMemo(() => {
    const out = {} as Record<(typeof SCALE_KEYS)[number], boolean>;
    for (const k of SCALE_KEYS) {
      out[k] = columnHasVariety(rows.map(r => r[k]));
    }
    return out;
  }, [rows]);

  if (loading && rows.length === 0) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground py-3"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>;
  }
  if (count === 0) {
    return <div className="text-xs text-muted-foreground py-2">No KPI rows match this signature.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>
          Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, count)} of {count}
        </span>
        <div className="flex items-center gap-2">
          <Switch
            id="affected-show-scale"
            checked={showScale}
            onCheckedChange={setShowScale}
            className="scale-75"
          />
          <Label htmlFor="affected-show-scale" className="text-xs cursor-pointer">
            Show scale (Freq · R0–R5)
          </Label>
        </div>
      </div>
      <div className="border rounded-md max-h-72 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0">
            <tr>
              <th className="text-left px-2 py-1.5 sticky left-0 bg-muted/80 z-10">Employee</th>
              <th className="text-left px-2 py-1.5 whitespace-nowrap">Period</th>
              <th className="text-left px-2 py-1.5">Wt</th>
              <th className="text-left px-2 py-1.5">Status</th>
              {showScale && (
                <>
                  <th className="text-left px-2 py-1.5 whitespace-nowrap">Freq</th>
                  <th className="text-left px-2 py-1.5">R0</th>
                  <th className="text-left px-2 py-1.5">R1</th>
                  <th className="text-left px-2 py-1.5">R2</th>
                  <th className="text-left px-2 py-1.5">R3</th>
                  <th className="text-left px-2 py-1.5">R4</th>
                  <th className="text-left px-2 py-1.5">R5</th>
                  <th className="text-left px-2 py-1.5 whitespace-nowrap">Criteria / UoM</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const emp = employees[r.employee_id];
              return (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-1.5 sticky left-0 bg-background z-10 whitespace-nowrap">{emp?.name || r.employee_id.slice(0, 8)}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{r.review_period} {r.review_year}</td>
                  <td className="px-2 py-1.5">{r.weightage ?? '—'}</td>
                  <td className="px-2 py-1.5"><Badge variant="outline" className="text-[10px]">{r.status || '—'}</Badge></td>
                  {showScale && (
                    <>
                      {SCALE_KEYS.map(k => {
                        const outlier = isOutlier(r[k], modes[k], variety[k]);
                        return (
                          <td
                            key={k}
                            className={cn(
                              'px-2 py-1.5 tabular-nums whitespace-nowrap text-[11px]',
                              outlier && 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 font-medium',
                              fmt(r[k]) === '—' && 'text-muted-foreground',
                            )}
                            title={outlier ? `Differs from page mode (${modes[k]})` : undefined}
                          >
                            {fmt(r[k])}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
                        {[fmt(r.criteria), fmt(r.uom)].filter(s => s !== '—').join(' · ') || '—'}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" disabled={page === 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>Prev</Button>
          <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages - 1 || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}