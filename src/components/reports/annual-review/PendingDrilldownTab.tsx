import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

type StageKey = 'self' | 'manager' | 'skip' | 'dept_head' | 'bu_head' | 'hr';
type Row = {
  instance_id: string;
  employee_id: string;
  employee_code: string | null;
  employee_name: string | null;
  department_name: string;
  reviewer_id: string | null;
  reviewer_name: string | null;
  days_pending: number;
  updated_at: string;
  total_count: number;
};

const STAGES: { key: StageKey; label: string }[] = [
  { key: 'self', label: 'Self' },
  { key: 'manager', label: 'Manager' },
  { key: 'skip', label: 'Skip' },
  { key: 'dept_head', label: 'Dept Head' },
  { key: 'bu_head', label: 'BU Head' },
  { key: 'hr', label: 'HR' },
];

export function PendingDrilldownTab({ cycleId }: { cycleId?: string }) {
  const [stage, setStage] = useState<StageKey>('self');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPage(1); }, [stage, cycleId]);

  useEffect(() => {
    if (!cycleId) { setRows([]); setTotal(0); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data, error } = await supabase.rpc('get_annual_review_pending_at_stage', {
        p_cycle_id: cycleId, p_stage: stage, p_page: page, p_page_size: pageSize,
      });
      if (cancelled) return;
      if (error) { toast.error(error.message); setRows([]); setTotal(0); }
      else {
        const arr = (data as Row[]) ?? [];
        setRows(arr);
        setTotal(arr[0]?.total_count ?? 0);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [cycleId, stage, page, pageSize]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  if (!cycleId) {
    return <Card><CardContent className="py-10 text-center text-muted-foreground">Pick a cycle to see pending breakdown.</CardContent></Card>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {STAGES.map(s => (
          <Button key={s.key} size="sm" variant={stage === s.key ? 'default' : 'outline'} onClick={() => setStage(s.key)}>
            {s.label}
          </Button>
        ))}
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>{stage === 'self' ? 'Self (employee)' : 'Reviewer'}</TableHead>
                <TableHead className="text-right">Days Pending</TableHead>
                <TableHead className="text-right">Last Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.instance_id}>
                  <TableCell>
                    <div className="font-medium">{r.employee_name ?? r.employee_id}</div>
                    <div className="text-xs text-muted-foreground">{r.employee_code}</div>
                  </TableCell>
                  <TableCell className="text-sm">{r.department_name}</TableCell>
                  <TableCell className="text-sm">{r.reviewer_name ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{r.days_pending}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{new Date(r.updated_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
              {!loading && rows.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Nothing pending at this stage.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
            <p className="text-muted-foreground tabular-nums">
              Showing {(page - 1) * pageSize + 1}–{(page - 1) * pageSize + rows.length} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Rows</Label>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>{[25, 50, 100, 200].map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Prev</Button>
              <span className="text-xs tabular-nums">Page {page} / {pageCount}</span>
              <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage(p => Math.min(pageCount, p + 1))}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}