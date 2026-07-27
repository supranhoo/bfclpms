import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchComprehensiveReport,
  summarize,
  groupBy,
  pendingWith,
  eligibilityLabel,
  completionStatus,
  diagnoseHr,
  stageRatingDisplay,
  isSystemScoredOnly,
  type ComprehensiveRow,
  type GroupSummary,
} from '@/services/annualReview/comprehensiveReport';
import { RatingDistributionChart } from './RatingDistributionChart';
import { HighlightsPanel } from './HighlightsPanel';
import { downloadComprehensiveWorkbook } from './ComprehensiveExport';

function KpiCard({ label, value, tone }: { label: string; value: number | string; tone?: 'muted' | 'ok' | 'warn' | 'bad' }) {
  const toneCls = tone === 'ok' ? 'text-emerald-600'
    : tone === 'warn' ? 'text-amber-600'
    : tone === 'bad' ? 'text-rose-600'
    : 'text-foreground';
  return (
    <Card><CardContent className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${toneCls}`}>{value}</p>
    </CardContent></Card>
  );
}

function GroupTable({ rows }: { rows: GroupSummary[] }) {
  if (!rows.length) return <p className="p-4 text-sm text-muted-foreground">No data.</p>;
  return (
    <Table>
      <TableHeader><TableRow>
        <TableHead>Name</TableHead>
        <TableHead className="text-right">Total</TableHead>
        <TableHead className="text-right">Eligible</TableHead>
        <TableHead className="text-right">Self Done</TableHead>
        <TableHead className="text-right">HOD Done</TableHead>
        <TableHead className="text-right">BU Done</TableHead>
        <TableHead className="text-right">HR Done</TableHead>
        <TableHead className="text-right">Completed</TableHead>
        <TableHead className="text-right">Submission %</TableHead>
        <TableHead className="text-right">Avg Final</TableHead>
      </TableRow></TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key}>
            <TableCell className="font-medium">{r.name || '—'}</TableCell>
            <TableCell className="text-right tabular-nums">{r.total}</TableCell>
            <TableCell className="text-right tabular-nums">{r.eligible}</TableCell>
            <TableCell className="text-right tabular-nums">{r.self_done}</TableCell>
            <TableCell className="text-right tabular-nums">{r.hod_done}</TableCell>
            <TableCell className="text-right tabular-nums">{r.bu_done}</TableCell>
            <TableCell className="text-right tabular-nums">{r.hr_done}</TableCell>
            <TableCell className="text-right tabular-nums">{r.completed}</TableCell>
            <TableCell className="text-right tabular-nums">{r.submission_pct}%</TableCell>
            <TableCell className="text-right tabular-nums">{r.avg_final ?? '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ComprehensiveTab({ cycleId, cycleName }: { cycleId: string | undefined; cycleName: string }) {
  const q = useQuery<ComprehensiveRow[]>({
    queryKey: ['annual-review-comprehensive', cycleId],
    queryFn: () => fetchComprehensiveReport(cycleId!),
    enabled: !!cycleId,
    staleTime: 30_000,
  });
  const rows = q.data ?? [];
  const [rcaSearch, setRcaSearch] = useState('101784');

  const rcaRow = useMemo<ComprehensiveRow | null>(() => {
    const q = rcaSearch.trim().toLowerCase();
    if (!q) return null;
    return rows.find((r) =>
      (r.employee_code ?? '').toLowerCase() === q ||
      (r.employee_code ?? '').toLowerCase().includes(q) ||
      (r.employee_name ?? '').toLowerCase().includes(q)
    ) ?? null;
  }, [rows, rcaSearch]);

  const summary = useMemo(() => summarize(rows), [rows]);
  const byDept = useMemo(() => groupBy(rows, (r) => ({ key: r.department_id ?? 'none', name: r.department_name ?? 'Unassigned' })), [rows]);
  const byBu = useMemo(() => groupBy(rows, (r) => ({ key: r.business_unit_id ?? 'none', name: r.business_unit_name ?? 'Unassigned' })), [rows]);
  const byDiv = useMemo(() => groupBy(rows, (r) => ({ key: r.division_id ?? 'none', name: r.division_name ?? 'Unassigned' })), [rows]);
  const byGrade = useMemo(() => groupBy(rows, (r) => ({ key: r.grade ?? 'none', name: r.grade ?? 'Ungraded' })), [rows]);
  const byDesig = useMemo(() => groupBy(rows, (r) => ({ key: r.designation ?? 'none', name: r.designation ?? 'Unassigned' })), [rows]);
  const byStage = useMemo(() => groupBy(rows, (r) => ({ key: r.overall_status, name: pendingWith(r.overall_status) })), [rows]);

  const sortedRows = useMemo(() => {
    // Sort: Department → Business Unit → Employee Name
    return [...rows].sort((a, b) => {
      const da = (a.department_name ?? '').localeCompare(b.department_name ?? '');
      if (da) return da;
      const bua = (a.business_unit_name ?? '').localeCompare(b.business_unit_name ?? '');
      if (bua) return bua;
      return (a.employee_name ?? '').localeCompare(b.employee_name ?? '');
    });
  }, [rows]);

  const onExport = () => {
    try {
      downloadComprehensiveWorkbook({
        cycleName,
        rows: sortedRows,
        summary,
        byDepartment: byDept,
        byBusinessUnit: byBu,
        byDivision: byDiv,
        byGrade,
        byDesignation: byDesig,
        byStage,
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  if (!cycleId) return <p className="text-sm text-muted-foreground p-4">Pick a cycle to begin.</p>;
  if (q.isLoading) return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading comprehensive report…</div>;
  if (q.error) return <p className="text-sm text-destructive p-4">{(q.error as Error).message}</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground p-4">No employees found in this cycle within your access scope.</p>;

  return (
    <div className="space-y-4">
      {/* Single-employee RCA */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Employee RCA — single row</CardTitle>
          <Input
            value={rcaSearch}
            onChange={(e) => setRcaSearch(e.target.value)}
            placeholder="Employee code or name (e.g. 101784)"
            className="max-w-xs"
          />
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          {!rcaRow ? (
            <p className="p-4 text-sm text-muted-foreground">No match in the current cycle & access scope.</p>
          ) : (() => {
            const r = rcaRow;
            const diag = diagnoseHr(r);
            const hod = r.dept_head_score ?? r.manager_score ?? null;
            const hodComment = r.dept_head_comment ?? r.manager_comment ?? '';
            const pending = r.overall_status === 'completed' || r.is_excluded ? '—'
              : r.overall_status === 'pending_self' ? (r.employee_name ?? 'Self')
              : r.overall_status === 'pending_manager' ? (r.manager_name ?? 'Manager')
              : r.overall_status === 'pending_dept' ? (r.dept_head_name ?? 'Dept Head')
              : r.overall_status === 'pending_bu' ? (r.bu_head_name ?? 'BU Head')
              : r.overall_status === 'pending_hr' ? (r.hr_name ?? 'HR')
              : r.overall_status === 'pending_management' ? (r.management_name ?? 'Management')
              : pendingWith(r.overall_status);
            const stages = Array.isArray(r.enabled_stages)
              ? (r.enabled_stages as string[])
              : (Array.isArray(r.cycle_default_stages) ? (r.cycle_default_stages as string[]) : []);
            const has = (s: string) => stages.length === 0 || stages.includes(s);
            const fmt = (n: number | null | undefined) =>
              n == null || Number.isNaN(n as number) ? '—' : (n as number).toFixed(2);

            type Cell = { label: string; value: React.ReactNode; wide?: boolean };
            const section = (title: string, cells: Cell[]) => (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
                  {cells.map((c) => (
                    <div key={c.label} className={`rounded-md border bg-card p-3 ${c.wide ? 'md:col-span-2 xl:col-span-3' : ''}`}>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</p>
                      <div className="mt-1 text-sm text-foreground break-words whitespace-pre-wrap">{c.value ?? '—'}</div>
                    </div>
                  ))}
                </div>
              </div>
            );

            const employee: Cell[] = [
              { label: 'Employee Code', value: r.employee_code ?? '—' },
              { label: 'Employee Name', value: r.employee_name ?? '—' },
              { label: 'Designation', value: r.designation ?? '—' },
              { label: 'Department', value: r.department_name ?? '—' },
              { label: 'Business Unit', value: r.business_unit_name ?? '—' },
              { label: 'Division', value: r.division_name ?? '—' },
              { label: 'Grade', value: r.grade ?? '—' },
              { label: 'Date of Joining', value: r.doj ?? '—' },
              { label: 'Eligibility', value: eligibilityLabel(r) },
            ];

            const stageRow = (label: string, name: string | null, score: number | null, comment: string | null): Cell[] => [
              { label: `${label} Reviewer`, value: name ?? '—' },
              { label: `${label} Score`, value: fmt(score) },
              { label: `${label} Rating`, value: stageRatingDisplay(score, comment) },
              { label: `${label} Comment`, value: comment || '—', wide: true },
            ];

            // ADR-155 — Collapse the HOD/Manager row when dept_head == bu_head
            // (dept=BU collapse). The BU Head row already represents that
            // reviewer, so a duplicated blank HOD row is misleading.
            const deptCollapsedIntoBu =
              !!r.dept_head_id && !!r.bu_head_id && r.dept_head_id === r.bu_head_id;

            const stageCells: Cell[] = [
              ...stageRow('Self', r.employee_name, r.self_score, r.self_comment),
              ...((has('manager') || has('dept_head')) && !deptCollapsedIntoBu
                ? stageRow('HOD / Manager', r.dept_head_name ?? r.manager_name, hod, hodComment)
                : []),
              ...(has('bu_head') ? stageRow('BU Head', r.bu_head_name, r.bu_head_score, r.bu_head_comment) : []),
              ...(has('management') ? stageRow('Management', r.management_name, r.management_score, r.management_comment) : []),
              ...(has('hr') ? stageRow('HR', r.hr_name, r.hr_score, r.hr_comment) : []),
            ];

            const systemScoredBanner = isSystemScoredOnly(r);

            const outcome: Cell[] = [
              { label: 'Final Score', value: fmt(r.total_score) },
              { label: 'Final Rating', value: r.final_rating ?? '—' },
              { label: 'Current Stage', value: pendingWith(r.overall_status) },
              { label: 'Pending With', value: pending },
              { label: 'Completion Status', value: completionStatus(r.overall_status) },
              { label: 'Days Since Update', value: r.days_pending ?? '—' },
            ];

            const diagnosis: Cell[] = [
              { label: 'HR Data Available', value: diag.hr_data_available ? 'Yes' : 'No' },
              { label: 'HR Data Visible in Report', value: diag.hr_data_visible ? 'Yes' : 'No' },
              { label: 'Root Cause', value: <Badge variant={diag.root_cause === 'OK' ? 'secondary' : 'destructive'}>{diag.root_cause}</Badge> },
              { label: 'Evidence', value: <span className="text-xs">{diag.evidence}</span>, wide: true },
              { label: 'Impact', value: diag.impact, wide: true },
              { label: 'Recommended Fix', value: diag.recommended_fix, wide: true },
            ];

            return (
              <div className="space-y-5 p-4">
                {section('Employee', employee)}
                {systemScoredBanner && (
                  <p className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200">
                    System-scored template — per-stage criteria were not collected.
                    Final Score reflects system inputs only, so per-stage Score/Rating are shown as "—".
                  </p>
                )}
                {section('Stage scores', stageCells)}
                {section('Outcome', outcome)}
                {section('Diagnosis', diagnosis)}
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Executive Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground">Executive Summary — {cycleName}</h3>
        <Button variant="outline" size="sm" className="gap-2" onClick={onExport}>
          <Download className="h-4 w-4" /> Export full workbook
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="Total employees" value={summary.total} />
        <KpiCard label="Eligible" value={summary.eligible} tone="ok" />
        <KpiCard label="Excluded" value={summary.excluded} tone="muted" />
        <KpiCard label="Completed" value={summary.completed} tone="ok" />
        <KpiCard label="Pending — Self" value={summary.pending_self} tone="warn" />
        <KpiCard label="Pending — HOD" value={summary.pending_hod} tone="warn" />
        <KpiCard label="Pending — BU" value={summary.pending_bu} tone="warn" />
        <KpiCard label="Pending — HR" value={summary.pending_hr} tone="warn" />
        <KpiCard label="In progress (mid stages)" value={summary.in_progress} />
        <KpiCard label="Avg final score" value={summary.avg_final != null ? summary.avg_final.toFixed(2) : '—'} />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <RatingDistributionChart rows={rows} />
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Stage split</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto"><GroupTable rows={byStage} /></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Highlights</CardTitle></CardHeader>
        <CardContent><HighlightsPanel rows={rows} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Breakdowns</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Tabs defaultValue="dept" className="p-3">
            <TabsList>
              <TabsTrigger value="dept">Department</TabsTrigger>
              <TabsTrigger value="bu">Business Unit</TabsTrigger>
              <TabsTrigger value="div">Division</TabsTrigger>
              <TabsTrigger value="grade">Grade</TabsTrigger>
              <TabsTrigger value="desig">Designation</TabsTrigger>
            </TabsList>
            <TabsContent value="dept" className="overflow-x-auto"><GroupTable rows={byDept} /></TabsContent>
            <TabsContent value="bu" className="overflow-x-auto"><GroupTable rows={byBu} /></TabsContent>
            <TabsContent value="div" className="overflow-x-auto"><GroupTable rows={byDiv} /></TabsContent>
            <TabsContent value="grade" className="overflow-x-auto"><GroupTable rows={byGrade} /></TabsContent>
            <TabsContent value="desig" className="overflow-x-auto"><GroupTable rows={byDesig} /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Employees ({sortedRows.length})</CardTitle>
          <Badge variant="secondary">Sorted: Dept → BU → Name</Badge>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Business Unit</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Eligibility</TableHead>
              <TableHead className="text-right">Self</TableHead>
              <TableHead className="text-right">HOD</TableHead>
              <TableHead className="text-right">BU</TableHead>
              <TableHead className="text-right">HR</TableHead>
              <TableHead className="text-right">Final</TableHead>
              <TableHead>Rating</TableHead>
              {/* ADR-174 — how the rating was derived (KRA vs criteria). */}
              <TableHead>Rating Derived</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Pending With</TableHead>
              <TableHead>Status</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {sortedRows.slice(0, 500).map((r) => (
                <TableRow key={r.instance_id}>
                  <TableCell className="tabular-nums">{r.employee_code}</TableCell>
                  <TableCell className="font-medium">{r.employee_name}</TableCell>
                  <TableCell className="text-sm">{r.designation ?? '—'}</TableCell>
                  <TableCell className="text-sm">{r.department_name ?? '—'}</TableCell>
                  <TableCell className="text-sm">{r.business_unit_name ?? '—'}</TableCell>
                  <TableCell className="text-sm">{r.grade ?? '—'}</TableCell>
                  <TableCell className="text-sm">{eligibilityLabel(r)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.self_score?.toFixed(2) ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{(r.dept_head_score ?? r.manager_score)?.toFixed(2) ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.bu_head_score?.toFixed(2) ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.hr_score?.toFixed(2) ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums font-medium">{r.total_score?.toFixed(2) ?? '—'}</TableCell>
                  <TableCell className="text-sm">{r.final_rating ?? '—'}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {r.scoring_mode ?? '—'}
                    {(r.kra_weight ?? 0) > 0 && (
                      <span className="text-muted-foreground">
                        {' '}({(r.kra_points ?? 0).toFixed(1)}/{(r.kra_weight ?? 0).toFixed(0)})
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{pendingWith(r.overall_status)}</TableCell>
                  <TableCell className="text-sm">
                    {r.overall_status === 'pending_manager' ? (r.manager_name ?? '—')
                      : r.overall_status === 'pending_dept' ? (r.dept_head_name ?? '—')
                      : r.overall_status === 'pending_bu' ? (r.bu_head_name ?? '—')
                      : r.overall_status === 'pending_hr' ? (r.hr_name ?? '—')
                      : r.overall_status === 'pending_self' ? (r.employee_name ?? 'Self')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-sm">{completionStatus(r.overall_status)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {sortedRows.length > 500 && (
            <div className="p-3 text-xs text-muted-foreground border-t">
              Showing first 500 of {sortedRows.length} rows on screen. Use "Export full workbook" for all rows.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}