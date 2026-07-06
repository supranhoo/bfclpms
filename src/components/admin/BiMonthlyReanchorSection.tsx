import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { CalendarSync, Search, RefreshCw, Undo2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface KpiRow {
  kpi_id: string;
  employee_id: string;
  employee_code: string | null;
  employee_name: string;
  department: string | null;
  kra_name: string;
  kpi_name: string;
  review_period: string;
  review_year: number;
  frequency: string | null;
  frequency_cycle_start: string | null;
  has_submission: boolean;
}

interface ApplyResult {
  dry_run: boolean;
  batch_id: string | null;
  june_count: number;
  july_count: number;
}

/**
 * Admin utility — re-anchor Bi-Monthly KPIs for a selected employee set.
 *   • June 2026 rows → frequency='Monthly', frequency_cycle_start=NULL
 *   • July 2026 rows → frequency_cycle_start='Jul-Aug'
 * Every change is audit-logged with a batch_id; a Revert action rolls back
 * the whole batch. Submissions are never modified.
 */
export function BiMonthlyReanchorSection() {
  const [scanning, setScanning] = useState(false);
  const [applying, setApplying] = useState(false);
  const [rows, setRows] = useState<KpiRow[] | null>(null);
  const [filter, setFilter] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [lastBatchId, setLastBatchId] = useState<string | null>(null);
  const [reverting, setReverting] = useState(false);
  const [showRevert, setShowRevert] = useState(false);

  const scan = async () => {
    setScanning(true);
    setRows(null);
    setSelectedEmployeeIds(new Set());
    try {
      const { data, error } = await supabase
        .from('kpis')
        .select('id, employee_id, kpi_name, kra_name, review_period, review_year, frequency, frequency_cycle_start, employee:profiles!kpis_employee_id_fkey(employee_code, full_name, department:departments(name))')
        .eq('frequency', 'Bi-Monthly')
        .in('review_period', ['June', 'July'])
        .eq('review_year', 2026)
        .limit(2000);
      if (error) throw error;

      const kpiIds = (data ?? []).map((r: any) => r.id);
      let subKpiIds = new Set<string>();
      if (kpiIds.length) {
        const { data: subs, error: subErr } = await supabase
          .from('review_submissions')
          .select('kpi_id')
          .in('kpi_id', kpiIds);
        if (subErr) throw subErr;
        subKpiIds = new Set((subs ?? []).map((s: any) => s.kpi_id));
      }

      const mapped: KpiRow[] = (data ?? []).map((r: any) => ({
        kpi_id: r.id,
        employee_id: r.employee_id,
        employee_code: r.employee?.employee_code ?? null,
        employee_name: r.employee?.full_name ?? '—',
        department: r.employee?.department?.name ?? null,
        kra_name: r.kra_name,
        kpi_name: r.kpi_name,
        review_period: r.review_period,
        review_year: r.review_year,
        frequency: r.frequency,
        frequency_cycle_start: r.frequency_cycle_start,
        has_submission: subKpiIds.has(r.id),
      }));
      mapped.sort((a, b) =>
        (a.department ?? '').localeCompare(b.department ?? '') ||
        a.employee_name.localeCompare(b.employee_name) ||
        a.review_period.localeCompare(b.review_period) ||
        a.kpi_name.localeCompare(b.kpi_name),
      );
      setRows(mapped);
      toast({
        title: 'Scan complete',
        description: `${mapped.length} Bi-Monthly row(s) across June/July 2026 for ${new Set(mapped.map(r => r.employee_id)).size} employee(s).`,
      });
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err.message, variant: 'destructive' });
    } finally {
      setScanning(false);
    }
  };

  const filtered = (rows ?? []).filter(r => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      r.employee_name.toLowerCase().includes(q) ||
      (r.employee_code ?? '').toLowerCase().includes(q) ||
      (r.department ?? '').toLowerCase().includes(q) ||
      r.kpi_name.toLowerCase().includes(q) ||
      r.kra_name.toLowerCase().includes(q)
    );
  });

  const employeeIndex = new Map<string, KpiRow[]>();
  for (const r of filtered) {
    const list = employeeIndex.get(r.employee_id) ?? [];
    list.push(r);
    employeeIndex.set(r.employee_id, list);
  }

  const toggleEmployee = (id: string) => {
    setSelectedEmployeeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    const allIds = Array.from(employeeIndex.keys());
    if (allIds.every(id => selectedEmployeeIds.has(id))) {
      setSelectedEmployeeIds(new Set());
    } else {
      setSelectedEmployeeIds(new Set(allIds));
    }
  };

  const apply = async () => {
    setShowConfirm(false);
    setApplying(true);
    try {
      const ids = Array.from(selectedEmployeeIds);
      const { data, error } = await supabase.rpc('rebatch_bimonthly_reanchor', {
        p_employee_ids: ids,
        p_dry_run: false,
      });
      if (error) throw error;
      const r = data as unknown as ApplyResult;
      setLastBatchId(r.batch_id);
      toast({
        title: 'Re-anchor applied',
        description: `June→Monthly: ${r.june_count} · July→Jul-Aug: ${r.july_count}. Batch ${r.batch_id?.slice(0, 8)}.`,
      });
      await scan();
    } catch (err: any) {
      toast({ title: 'Apply failed', description: err.message, variant: 'destructive' });
    } finally {
      setApplying(false);
    }
  };

  const revert = async () => {
    if (!lastBatchId) return;
    setShowRevert(false);
    setReverting(true);
    try {
      const { data, error } = await supabase.rpc('revert_bimonthly_reanchor', {
        p_batch_id: lastBatchId,
      });
      if (error) throw error;
      const r = data as unknown as { restored: number };
      toast({ title: 'Batch reverted', description: `Restored ${r.restored} KPI row(s).` });
      setLastBatchId(null);
      await scan();
    } catch (err: any) {
      toast({ title: 'Revert failed', description: err.message, variant: 'destructive' });
    } finally {
      setReverting(false);
    }
  };

  const employees = Array.from(employeeIndex.entries());
  const juneSelectedRows = filtered.filter(r => selectedEmployeeIds.has(r.employee_id) && r.review_period === 'June');
  const julySelectedRows = filtered.filter(r => selectedEmployeeIds.has(r.employee_id) && r.review_period === 'July');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarSync className="h-5 w-5" />
          Re-anchor Bi-Monthly KPIs (June/July 2026)
        </CardTitle>
        <CardDescription>
          Scan Bi-Monthly KPIs for June &amp; July 2026, tick the employees you want to affect (e.g. CPP + DRI),
          then apply. June rows become <strong>Monthly</strong>; July rows are re-anchored to <strong>Jul-Aug</strong>.
          Submissions are preserved. Every change is audit-logged and the entire batch can be reverted.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={scan} disabled={scanning || applying} variant="outline">
            {scanning ? <><RefreshCw className="h-4 w-4 animate-spin" /> Scanning…</> : <><Search className="h-4 w-4" /> Scan Bi-Monthly KPIs</>}
          </Button>
          {rows && rows.length > 0 && (
            <Input
              placeholder="Filter by employee / dept / KPI…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="max-w-xs"
            />
          )}
          {rows && (
            <Badge variant="secondary">{juneSelectedRows.length} June rows selected</Badge>
          )}
          {rows && (
            <Badge variant="secondary">{julySelectedRows.length} July rows selected</Badge>
          )}
          {rows && employees.length > 0 && (
            <Button
              size="sm"
              onClick={() => setShowConfirm(true)}
              disabled={selectedEmployeeIds.size === 0 || applying}
            >
              <CalendarSync className="h-4 w-4" /> Apply Re-anchor ({selectedEmployeeIds.size} employee{selectedEmployeeIds.size === 1 ? '' : 's'})
            </Button>
          )}
          {lastBatchId && (
            <Button size="sm" variant="outline" onClick={() => setShowRevert(true)} disabled={reverting}>
              <Undo2 className="h-4 w-4" /> Revert last batch
            </Button>
          )}
        </div>

        {rows && rows.length === 0 && (
          <div className="flex items-center gap-2 p-4 rounded-lg border text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>No Bi-Monthly KPIs found for June/July 2026.</span>
          </div>
        )}

        {rows && employees.length > 0 && (
          <div className="rounded-md border max-h-[560px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={employees.length > 0 && employees.every(([id]) => selectedEmployeeIds.has(id))}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Dept</TableHead>
                  <TableHead>KRA / KPI</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Current anchor</TableHead>
                  <TableHead>Submission</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map(([empId, empRows]) => empRows.map((r, i) => (
                  <TableRow key={r.kpi_id}>
                    <TableCell>
                      {i === 0 && (
                        <Checkbox
                          checked={selectedEmployeeIds.has(empId)}
                          onCheckedChange={() => toggleEmployee(empId)}
                        />
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {i === 0 ? (
                        <div>
                          <div>{r.employee_name}</div>
                          <div className="text-xs text-muted-foreground">{r.employee_code ?? '—'}</div>
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs">{i === 0 ? (r.department ?? '—') : ''}</TableCell>
                    <TableCell className="text-sm max-w-[280px]">
                      <div className="truncate">{r.kra_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.kpi_name}</div>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">{r.review_period} {r.review_year}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="outline">{r.frequency}</Badge>{' '}
                      <span className="text-muted-foreground">{r.frequency_cycle_start ?? '—'}</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {r.has_submission ? <Badge variant="secondary">exists</Badge> : <span className="text-muted-foreground">none</span>}
                    </TableCell>
                  </TableRow>
                )))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <ConfirmDestructiveDialog
        open={showConfirm}
        onConfirm={apply}
        onCancel={() => setShowConfirm(false)}
        title={`Re-anchor Bi-Monthly KPIs for ${selectedEmployeeIds.size} employee(s)?`}
        description={`${juneSelectedRows.length} June 2026 row(s) will become Monthly. ${julySelectedRows.length} July 2026 row(s) will be re-anchored to Jul-Aug. Submissions are untouched. Every change is audit-logged and reversible via "Revert last batch".`}
        confirmLabel="Apply Re-anchor"
        isLoading={applying}
      />

      <ConfirmDestructiveDialog
        open={showRevert}
        onConfirm={revert}
        onCancel={() => setShowRevert(false)}
        title="Revert last re-anchor batch?"
        description="Restores frequency and frequency_cycle_start on every KPI touched by the most recent batch. A counter-audit row is written for each restore."
        confirmLabel="Revert Batch"
        isLoading={reverting}
      />
    </Card>
  );
}