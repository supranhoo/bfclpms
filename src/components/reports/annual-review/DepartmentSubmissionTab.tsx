import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';

type Row = {
  department_id: string | null;
  department_name: string;
  total: number;
  self_submitted: number;
  manager_done: number;
  skip_done: number;
  bu_done: number;
  hr_done: number;
  completed: number;
  submission_pct: number | null;
};

export function DepartmentSubmissionTab({ cycleId }: { cycleId?: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!cycleId) { setRows([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc('get_annual_review_dept_submission_summary', { p_cycle_id: cycleId });
      if (cancelled) return;
      if (error) { toast.error(error.message); setRows([]); }
      else setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [cycleId]);

  const onExport = async () => {
    try {
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
        Department: r.department_name,
        Total: r.total,
        'Self Submitted': r.self_submitted,
        'Submission %': r.submission_pct ?? 0,
        'Manager Done': r.manager_done,
        'Skip Done': r.skip_done,
        'BU Done': r.bu_done,
        'HR Done': r.hr_done,
        Completed: r.completed,
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dept Submission');
      XLSX.writeFile(wb, `annual-review_dept_${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch (e) { toast.error((e as Error).message); }
  };

  if (!cycleId) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground">Pick a cycle to view department submission %.</CardContent></Card>;
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between p-3">
          <p className="text-sm text-muted-foreground">{loading ? 'Loading…' : `${rows.length} departments`}</p>
          <Button variant="outline" size="sm" className="gap-2" disabled={rows.length === 0} onClick={onExport}>
            <Download className="h-4 w-4" /> Export
          </Button>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Self Submitted</TableHead>
                <TableHead className="text-right">Submission %</TableHead>
                <TableHead className="text-right">Manager</TableHead>
                <TableHead className="text-right">Skip</TableHead>
                <TableHead className="text-right">BU</TableHead>
                <TableHead className="text-right">HR</TableHead>
                <TableHead className="text-right">Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.department_id ?? r.department_name}>
                  <TableCell className="font-medium">{r.department_name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.total}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.self_submitted}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">
                    {r.submission_pct == null ? '—' : `${r.submission_pct}%`}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.manager_done}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.skip_done}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.bu_done}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.hr_done}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.completed}</TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No data.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}