import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';

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

export function AffectedKpisTable({ categoryId, kraName, kpiName, reviewPeriod, reviewYear }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, { name: string; department: string | null }>>({});
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchPage = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('kpis' as any)
        .select('id, employee_id, review_period, review_year, weightage, status', { count: 'exact' })
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
          .select('id, full_name, department')
          .in('id', empIds);
        const map: Record<string, { name: string; department: string | null }> = {};
        (profs || []).forEach((p: any) => { map[p.id] = { name: p.full_name, department: p.department }; });
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

  if (loading && rows.length === 0) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground py-3"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>;
  }
  if (count === 0) {
    return <div className="text-xs text-muted-foreground py-2">No KPI rows match this signature.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="text-xs text-muted-foreground">
        Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, count)} of {count}
      </div>
      <div className="border rounded-md max-h-72 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0">
            <tr>
              <th className="text-left px-2 py-1.5">Employee</th>
              <th className="text-left px-2 py-1.5">Department</th>
              <th className="text-left px-2 py-1.5">Period</th>
              <th className="text-left px-2 py-1.5">Weightage</th>
              <th className="text-left px-2 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const emp = employees[r.employee_id];
              return (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-1.5">{emp?.name || r.employee_id.slice(0, 8)}</td>
                  <td className="px-2 py-1.5 text-muted-foreground">{emp?.department || '—'}</td>
                  <td className="px-2 py-1.5">{r.review_period} {r.review_year}</td>
                  <td className="px-2 py-1.5">{r.weightage ?? '—'}</td>
                  <td className="px-2 py-1.5"><Badge variant="outline" className="text-[10px]">{r.status || '—'}</Badge></td>
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