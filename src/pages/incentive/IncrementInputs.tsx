import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import {
  useIncrementInputs,
  useUpsertIncrementInput,
  useBulkImportIncrementInputs,
} from '@/hooks/useIncrementInputs';
import {
  useIncrementRuns,
  useIncrementRunItems,
  useTriggerIncrementRun,
  useExportIncrementRunItems,
  useDeleteIncrementRunItem,
  useLatestIncrementResults,
  useExportLatestIncrementResults,
} from '@/hooks/useIncrementRuns';
import { Loader2, Upload, Play, FileSpreadsheet, Plus, Pencil, Search, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { generateAssessmentYears, getCurrentAssessmentYear } from '@/lib/assessmentYear';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { IncrementInputDialog } from '@/components/incentive/IncrementInputDialog';
import { useActiveEmployeesForCopy } from '@/hooks/useActiveEmployeesForCopy';
import { EmployeeMultiSelect } from '@/components/incentive/EmployeeMultiSelect';
import { IncrementResultEditDialog } from '@/components/incentive/IncrementResultEditDialog';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

function downloadXlsx(filename: string, rows: any[], headers: string[]) {
  const ws = rows.length
    ? XLSX.utils.json_to_sheet(
        rows.map((r) => headers.reduce((o, h) => ({ ...o, [h]: r[h] ?? '' }), {} as any)),
        { header: headers },
      )
    : XLSX.utils.aoa_to_sheet([headers]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename);
}

function EnterInputsTab({ year }: { year: string }) {
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);
  useEffect(() => { setPage(0); }, [debouncedSearch, year]);

  const { data, isLoading } = useIncrementInputs(year, page, pageSize, debouncedSearch);
  const upsert = useUpsertIncrementInput();
  const importMut = useBulkImportIncrementInputs();
  const { toast } = useToast();
  const { data: employees = [] } = useActiveEmployeesForCopy();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<any | null>(null);

  const existingEmployeeIds = useMemo(
    () => new Set((data?.rows ?? []).map((r: any) => r.employee_id)),
    [data?.rows],
  );

  const openAdd = () => { setEditingRow(null); setDialogOpen(true); };
  const openEdit = (row: any) => { setEditingRow(row); setDialogOpen(true); };

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const raw = parsed
        .map((o: any) => ({
          key: String(o.employee_code ?? o.employee_id ?? '').trim(),
          absent_days: Number(o.absent_days ?? 0),
          lwp_days: Number(o.lwp_days ?? 0),
          disciplinary_actions: Number(o.disciplinary_actions ?? 0),
          training_compliance: Number(o.training_compliance ?? 0),
          current_salary: o.current_salary !== '' && o.current_salary != null ? Number(o.current_salary) : null,
        }))
        .filter((r) => r.key);

      const codes = Array.from(new Set(raw.filter((r) => !UUID_RE.test(r.key)).map((r) => r.key)));
      let codeMap = new Map<string, string>();
      if (codes.length) {
        const { data: profs, error: pErr } = await (supabase as any)
          .from('profiles')
          .select('id, employee_code')
          .in('employee_code', codes);
        if (pErr) throw pErr;
        codeMap = new Map((profs ?? []).map((p: any) => [String(p.employee_code), p.id]));
      }

      const unresolved: string[] = [];
      const rows = raw.map((r) => {
        const id = UUID_RE.test(r.key) ? r.key : codeMap.get(r.key);
        if (!id) unresolved.push(r.key);
        const { key, ...rest } = r;
        return { employee_id: id, ...rest };
      }).filter((r) => r.employee_id);

      if (!rows.length) {
        throw new Error(`No matching employees found. Unknown codes: ${unresolved.slice(0, 5).join(', ')}`);
      }
      if (unresolved.length) {
        toast({ title: 'Some rows skipped', description: `Unknown employee codes: ${unresolved.slice(0, 5).join(', ')}${unresolved.length > 5 ? '…' : ''}`, variant: 'destructive' });
      }
      await importMut.mutateAsync({ rows, assessment_year: year });
    } catch (err: any) {
      toast({ title: 'Import failed', description: err?.message ?? 'Parse error', variant: 'destructive' });
    } finally {
      e.target.value = '';
    }
  };

  const exportTemplate = () => {
    downloadXlsx('Import Inputs.xlsx', [], [
      'employee_code', 'absent_days', 'lwp_days', 'disciplinary_actions',
      'training_compliance', 'current_salary',
    ]);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Employee Inputs · AY {year}</CardTitle>
        <div className="flex items-center gap-2">
          <Button onClick={openAdd}>
            <Plus className="h-4 w-4 mr-2" />Add Input
          </Button>
          <Button variant="outline" onClick={exportTemplate}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />Template
          </Button>
          <label className="inline-flex">
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
            <Button asChild variant="outline">
              <span><Upload className="h-4 w-4 mr-2" />Import Inputs</span>
            </Button>
          </label>
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative mb-4 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search employee by name or code"
            className="pl-8"
          />
        </div>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Absent Days</TableHead>
                  <TableHead>LWP Days</TableHead>
                  <TableHead>Disciplinary</TableHead>
                  <TableHead>Training</TableHead>
                  <TableHead>Current Salary</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead>Last Updated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.rows ?? []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="text-sm">{r.employee?.full_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{r.employee?.employee_code ?? ''}</div>
                    </TableCell>
                    <TableCell>{r.absent_days}</TableCell>
                    <TableCell>{r.lwp_days}</TableCell>
                    <TableCell>{r.disciplinary_actions}</TableCell>
                    <TableCell>{r.training_compliance}</TableCell>
                    <TableCell>{r.current_salary ?? '—'}</TableCell>
                    <TableCell><Badge variant="secondary">{r.source}</Badge></TableCell>
                    <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground" title={r.remarks ?? ''}>
                      {r.remarks || '—'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.updated_at ? new Date(r.updated_at).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {(data?.rows ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      {debouncedSearch
                        ? 'No employees match your search.'
                        : 'No inputs yet. Add employee inputs manually or import an Excel file to begin.'}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} · {data?.total ?? 0} total
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
      <IncrementInputDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        assessmentYear={year}
        employees={employees}
        existing={editingRow}
        existingEmployeeIds={existingEmployeeIds}
      />
    </Card>
  );
}

function CalculateIncrementTab({ year }: { year: string }) {
  const { data: runs = [], isLoading } = useIncrementRuns(year);
  const trigger = useTriggerIncrementRun();
  const { toast } = useToast();
  const { data: employees = [] } = useActiveEmployeesForCopy();
  const empById = useMemo(() => {
    const m = new Map<string, { name: string; code: string }>();
    employees.forEach((e) => m.set(e.id, { name: e.name, code: e.code }));
    return m;
  }, [employees]);

  // Inner sub-tabs: Run Calculation | Run Log
  const [innerTab, setInnerTab] = useState<'run' | 'log'>('run');

  // Run Calculation form
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);
  useEffect(() => { if (scope === 'all') setSelectedEmpIds([]); }, [scope]);

  // Run Log view mode + selected historical run
  const [logView, setLogView] = useState<'latest' | 'history'>('latest');
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [latestPage, setLatestPage] = useState(0);
  const pageSize = 50;

  useEffect(() => { setPage(0); }, [selectedRun]);

  const { data: itemsData, isLoading: itemsLoading } =
    useIncrementRunItems(selectedRun, page, pageSize);
  const totalPages = Math.max(1, Math.ceil((itemsData?.total ?? 0) / pageSize));

  const { data: latestRows = [], isLoading: latestLoading } =
    useLatestIncrementResults(year);
  const latestTotalPages = Math.max(1, Math.ceil(latestRows.length / pageSize));
  const latestPageRows = useMemo(
    () => latestRows.slice(latestPage * pageSize, latestPage * pageSize + pageSize),
    [latestRows, latestPage],
  );
  useEffect(() => { setLatestPage(0); }, [year]);

  const exportQuery = useExportIncrementRunItems(selectedRun);
  const exportLatest = useExportLatestIncrementResults(year);

  // Edit + Delete state
  const [editRow, setEditRow] = useState<any | null>(null);
  const [deleteRow, setDeleteRow] = useState<any | null>(null);
  const deleteMut = useDeleteIncrementRunItem();

  const runDisabled =
    trigger.isPending || (scope === 'selected' && selectedEmpIds.length === 0);

  const handleRun = async () => {
    try {
      const payload: any = { assessment_year: year };
      if (scope === 'selected') {
        payload.employee_ids = selectedEmpIds;
      }
      const result: any = await trigger.mutateAsync(payload);
      const newRunId = result?.run_id ?? result?.id ?? null;
      if (newRunId) {
        setSelectedRun(newRunId);
        setInnerTab('run');
      }
    } catch {
      /* toast already shown by hook */
    }
  };

  const buildExportRows = (items: any[]) =>
    items.map((r: any) => ({
      employee: r.employee?.full_name ?? '',
      employee_code: r.employee?.employee_code ?? '',
      pms_score: r.pms_score ?? '',
      rating_band: r.rating_band ?? '',
      slab_percent: r.slab_percent ?? '',
      eligibility: r.eligibility_status,
      // PMS-missing is a required-data issue, not an ineligibility-criterion breach —
      // blank it from the Ineligibility Reason column so the export wording stays accurate.
      ineligibility_reason:
        r.eligibility_status === 'no_score' ? '' : (r.ineligibility_reason ?? ''),
      method: r.method_used ?? '',
      eligible_percent: r.eligible_percent ?? '',
      service_months: r.service_months ?? '',
      current_salary: r.current_salary ?? '',
      increment_amount: r.increment_amount ?? '',
      revised_salary: r.revised_salary ?? '',
      remarks: r.remarks ?? '',
      conf_increment: r.confirmation_granted ? 'Yes' : 'No',
      conf_effective_date: r.confirmation_effective_date ?? '',
      period_covered_months: r.period_covered_months ?? '',
      balance_months: r.balance_eligible_months ?? '',
      carry_forward_months: r.carry_forward_months ?? '',
      final_eligible_months: r.final_eligible_months ?? '',
      treatment_applied: r.confirmation_treatment ?? '',
      adjustment_reason: r.adjustment_reason ?? '',
    }));

  const exportRun = async () => {
    if (!selectedRun) return;
    try {
      const res = await exportQuery.refetch();
      const items = (res.data ?? []) as any[];
      if (!items.length) {
        toast({ title: 'Nothing to export', description: 'This run has no rows.' });
        return;
      }
      const rows = buildExportRows(items);
      const run = runs.find((r) => r.id === selectedRun);
      const ss: any = run?.scope_snapshot ?? {};
      const scopeTag = ss.scope === 'single'
        ? `-single-${empById.get(ss.employee_id)?.code ?? 'emp'}`
        : ss.scope === 'multi'
          ? `-multi-${ss.count ?? (ss.employee_ids?.length ?? 'n')}`
          : '';
      const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
      downloadXlsx(`increment-run-${ts}${scopeTag}.xlsx`, rows, Object.keys(rows[0]));
    } catch (e: any) {
      toast({ title: 'Export failed', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    }
  };

  const exportLatestRun = async () => {
    try {
      const res = await exportLatest.refetch();
      const items = (res.data ?? []) as any[];
      if (!items.length) {
        toast({ title: 'Nothing to export', description: 'No latest calculations for this AY.' });
        return;
      }
      const rows = buildExportRows(items);
      const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
      downloadXlsx(`increment-latest-${year}-${ts}.xlsx`, rows, Object.keys(rows[0]));
    } catch (e: any) {
      toast({ title: 'Export failed', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    }
  };

  const renderScopeCell = (r: any) => {
    const ss: any = r.scope_snapshot ?? {};
    const s = ss.scope;
    if (s === 'single') {
      const id = ss.employee_id;
      const e = id ? empById.get(id) : null;
      return (
        <Badge variant="outline">
          Selected: {e ? `${e.name}${e.code ? ` (${e.code})` : ''}` : id?.slice(0, 8) ?? '—'}
        </Badge>
      );
    }
    if (s === 'multi') {
      const ids: string[] = ss.employee_ids ?? [];
      const names = ids
        .map((id) => {
          const e = empById.get(id);
          return e ? `${e.name}${e.code ? ` (${e.code})` : ''}` : id.slice(0, 8);
        })
        .join(', ');
      return (
        <Badge variant="outline" title={names}>
          Selected: {ss.count ?? ids.length} employees
        </Badge>
      );
    }
    return <Badge variant="secondary">All Employees</Badge>;
  };

  const ResultsTable = ({
    rows,
    loading,
    emptyText,
    page,
    totalPages,
    total,
    onPrev,
    onNext,
  }: {
    rows: any[];
    loading: boolean;
    emptyText: string;
    page: number;
    totalPages: number;
    total: number;
    onPrev: () => void;
    onNext: () => void;
  }) => {
    if (loading) return <Loader2 className="h-5 w-5 animate-spin" />;
    return (
      <>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Employee Code</TableHead>
              <TableHead>PMS Score</TableHead>
              <TableHead>Rating Band</TableHead>
              <TableHead>Slab %</TableHead>
              <TableHead>Eligibility</TableHead>
              <TableHead>Ineligibility Reason</TableHead>
              <TableHead>Method</TableHead>
              <TableHead>Eligible %</TableHead>
              <TableHead>Current Salary</TableHead>
              <TableHead>Increment Amount</TableHead>
              <TableHead>Revised Salary</TableHead>
              <TableHead>Conf.Inc?</TableHead>
              <TableHead>Final Eligible Months</TableHead>
              <TableHead>Treatment Applied</TableHead>
              <TableHead>Remarks</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span>{r.employee?.full_name ?? r.employee_id}</span>
                    {r.manually_edited && (
                      <Badge variant="outline" className="text-[10px]" title={r.edited_at ? `Edited ${new Date(r.edited_at).toLocaleString()}` : 'Manually edited'}>
                        Edited
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{r.employee?.employee_code ?? '—'}</TableCell>
                <TableCell>{r.pms_score ?? '—'}</TableCell>
                <TableCell>{r.rating_band ?? '—'}</TableCell>
                <TableCell>{r.slab_percent ?? '—'}%</TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Badge variant={r.eligibility_status === 'eligible' ? 'default' : r.eligibility_status === 'ineligible' ? 'destructive' : 'secondary'}>
                      {r.eligibility_status}
                    </Badge>
                    {r.criteria_exempt && (
                      <Badge variant="outline" className="text-[10px]" title={r.exemption_reason ?? 'Bypassed ineligibility criteria'}>
                        Ineligibility-criteria exempt
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={r.eligibility_status === 'no_score' ? '' : (r.ineligibility_reason ?? r.exemption_reason ?? '')}>
                  {r.eligibility_status === 'no_score'
                    ? '—'
                    : (r.ineligibility_reason ?? (r.criteria_exempt ? `Bypassed: ${r.exemption_reason ?? '—'}` : '—'))}
                </TableCell>
                <TableCell>{r.method_used ?? '—'}</TableCell>
                <TableCell>{r.eligible_percent ?? '—'}%</TableCell>
                <TableCell>{r.current_salary ?? '—'}</TableCell>
                <TableCell>{r.increment_amount ?? '—'}</TableCell>
                <TableCell>{r.revised_salary ?? '—'}</TableCell>
                <TableCell>{r.confirmation_granted ? <Badge variant="secondary">Yes</Badge> : '—'}</TableCell>
                <TableCell>{r.final_eligible_months ?? '—'}</TableCell>
                <TableCell className="text-xs">{r.confirmation_treatment ?? '—'}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={r.remarks ?? ''}>
                  {r.remarks ?? '—'}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="sm" onClick={() => setEditRow(r)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteRow(r)} className="text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={17} className="text-center text-muted-foreground py-8">
                  {emptyText}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages} · {total} total
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={onPrev}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={onNext}>Next</Button>
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="space-y-6">
      <Tabs value={innerTab} onValueChange={(v) => setInnerTab(v as 'run' | 'log')}>
        <TabsList>
          <TabsTrigger value="run">Run Calculation</TabsTrigger>
          <TabsTrigger value="log">Run Log</TabsTrigger>
        </TabsList>

        <TabsContent value="run">
          <Card>
            <CardHeader>
              <CardTitle>Run Calculation · AY {year}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-muted-foreground">Scope:</span>
                <Select value={scope} onValueChange={(v) => setScope(v as 'all' | 'selected')}>
                  <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    <SelectItem value="selected">Selected Employee(s)</SelectItem>
                  </SelectContent>
                </Select>
                <Button onClick={handleRun} disabled={runDisabled}>
                  {trigger.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  Run Calculation
                </Button>
              </div>
              {scope === 'selected' && (
                <div className="w-full sm:w-[460px]">
                  <EmployeeMultiSelect
                    employees={employees}
                    value={selectedEmpIds}
                    onChange={setSelectedEmpIds}
                    placeholder="Search employee by name or code…"
                  />
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Choose scope and run calculation. Results appear below once the run completes. Full history is available under <strong>Run Log</strong>.
              </p>
            </CardContent>
          </Card>

          {selectedRun && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>Calculated / Run Details</CardTitle>
                <Button
                  variant="outline"
                  onClick={exportRun}
                  disabled={!itemsData?.rows?.length || exportQuery.isFetching}
                >
                  {exportQuery.isFetching
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <FileSpreadsheet className="h-4 w-4 mr-2" />}
                  Export Excel
                </Button>
              </CardHeader>
              <CardContent>
                <ResultsTable
                  rows={itemsData?.rows ?? []}
                  loading={itemsLoading}
                  emptyText="No calculated rows found for this run."
                  page={page}
                  totalPages={totalPages}
                  total={itemsData?.total ?? 0}
                  onPrev={() => setPage((p) => Math.max(0, p - 1))}
                  onNext={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="log" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0">
              <CardTitle>Run Log · AY {year}</CardTitle>
              <Tabs value={logView} onValueChange={(v) => setLogView(v as 'latest' | 'history')}>
                <TabsList>
                  <TabsTrigger value="latest">Latest Calculations</TabsTrigger>
                  <TabsTrigger value="history">Historical Run Log</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              {logView === 'history' ? (
                isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : runs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No calculation runs yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Triggered At</TableHead>
                        <TableHead>Scope</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Summary</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {runs.map((r) => (
                        <TableRow key={r.id} className={selectedRun === r.id ? 'bg-muted/40' : ''}>
                          <TableCell>{new Date(r.triggered_at).toLocaleString()}</TableCell>
                          <TableCell>{renderScopeCell(r)}</TableCell>
                          <TableCell>
                            <Badge variant={r.status === 'completed' ? 'default' : r.status === 'failed' ? 'destructive' : 'secondary'}>
                              {r.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {(() => {
                              const s = r.summary ?? {};
                              const parts = [
                                `${s.total ?? 0} employees`,
                                `${s.eligible ?? 0} eligible`,
                                `${s.ineligible ?? 0} ineligible`,
                              ];
                              if ((s.no_score ?? 0) > 0) parts.push(`${s.no_score} no-score`);
                              if ((s.criteria_exempt ?? 0) > 0) parts.push(`${s.criteria_exempt} criteria-exempt`);
                              if ((s.excluded ?? 0) > 0) parts.push(`${s.excluded} excluded (legacy)`);
                              return parts.join(' · ');
                            })()}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => setSelectedRun(r.id)}>View</Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    One latest row per employee for AY {year}. Historical runs remain available under <strong>Historical Run Log</strong>.
                  </p>
                  <Button
                    variant="outline"
                    onClick={exportLatestRun}
                    disabled={latestRows.length === 0 || exportLatest.isFetching}
                  >
                    {exportLatest.isFetching
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <FileSpreadsheet className="h-4 w-4 mr-2" />}
                    Export Excel
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {logView === 'latest' && (
            <Card>
              <CardHeader>
                <CardTitle>Latest Calculations · AY {year}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResultsTable
                  rows={latestPageRows}
                  loading={latestLoading}
                  emptyText="No latest calculations found for this assessment year."
                  page={latestPage}
                  totalPages={latestTotalPages}
                  total={latestRows.length}
                  onPrev={() => setLatestPage((p) => Math.max(0, p - 1))}
                  onNext={() => setLatestPage((p) => Math.min(latestTotalPages - 1, p + 1))}
                />
              </CardContent>
            </Card>
          )}

        </TabsContent>
      </Tabs>

      <IncrementResultEditDialog
        open={!!editRow}
        onOpenChange={(v) => { if (!v) setEditRow(null); }}
        row={editRow}
      />
      <ConfirmDestructiveDialog
        open={!!deleteRow}
        onCancel={() => setDeleteRow(null)}
        onConfirm={async () => {
          if (!deleteRow) return;
          await deleteMut.mutateAsync(deleteRow.id);
          setDeleteRow(null);
        }}
        title="Delete this calculated row?"
        description="This removes only the calculated result row. Employee, increment input, PMS score, and configuration data are untouched."
        confirmLabel="Delete row"
        isLoading={deleteMut.isPending}
      />
    </div>
  );
}

export default function IncrementInputs() {
  const ayOptions = useMemo(() => generateAssessmentYears(2), []);
  const [year, setYear] = useState<string>(getCurrentAssessmentYear());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Increment Inputs"
        description="Manage per-employee inputs and run the annual increment calculation"
      />

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Assessment Year:</span>
        <Select value={year} onValueChange={setYear}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ayOptions.map((y) => <SelectItem key={y} value={y}>AY {y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="inputs">
        <TabsList>
          <TabsTrigger value="inputs">Enter Inputs</TabsTrigger>
          <TabsTrigger value="calculate">Calculate Increment %</TabsTrigger>
        </TabsList>
        <TabsContent value="inputs"><EnterInputsTab year={year} /></TabsContent>
        <TabsContent value="calculate"><CalculateIncrementTab year={year} /></TabsContent>
      </Tabs>
    </div>
  );
}