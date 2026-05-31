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
} from '@/hooks/useIncrementRuns';
import { Loader2, Upload, Play, FileSpreadsheet, Plus, Pencil, Search } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { generateAssessmentYears, getCurrentAssessmentYear } from '@/lib/assessmentYear';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { IncrementInputDialog } from '@/components/incentive/IncrementInputDialog';
import { useActiveEmployeesForCopy } from '@/hooks/useActiveEmployeesForCopy';
import { EmployeeCombobox } from '@/components/admin/EmployeeCombobox';

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

  const [scope, setScope] = useState<'all' | 'single'>('all');
  const [selectedEmpId, setSelectedEmpId] = useState<string>('');
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  useEffect(() => { setPage(0); }, [selectedRun]);
  useEffect(() => { if (scope === 'all') setSelectedEmpId(''); }, [scope]);

  const { data: itemsData, isLoading: itemsLoading } = useIncrementRunItems(selectedRun, page, pageSize);
  const totalPages = Math.max(1, Math.ceil((itemsData?.total ?? 0) / pageSize));

  const exportQuery = useExportIncrementRunItems(selectedRun);

  const runDisabled =
    trigger.isPending || (scope === 'single' && !selectedEmpId);

  const handleRun = async () => {
    try {
      const result: any = await trigger.mutateAsync({
        assessment_year: year,
        employee_id: scope === 'single' ? selectedEmpId : null,
      });
      // Edge fn returns { run_id, ... } — auto-select to load details
      const newRunId = result?.run_id ?? result?.id ?? null;
      if (newRunId) setSelectedRun(newRunId);
    } catch {
      // toast already shown by hook
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
      ineligibility_reason: r.ineligibility_reason ?? '',
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
      const scopeTag = run?.scope_snapshot?.scope === 'single'
        ? `-single-${empById.get(run.scope_snapshot.employee_id)?.code ?? 'emp'}`
        : '';
      const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
      downloadXlsx(`increment-run-${ts}${scopeTag}.xlsx`, rows, Object.keys(rows[0]));
    } catch (e: any) {
      toast({ title: 'Export failed', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    }
  };

  const renderScopeCell = (r: any) => {
    const s = r.scope_snapshot?.scope;
    if (s === 'single') {
      const id = r.scope_snapshot?.employee_id;
      const e = id ? empById.get(id) : null;
      return (
        <Badge variant="outline">
          Single · {e ? `${e.name}${e.code ? ` (${e.code})` : ''}` : id?.slice(0, 8) ?? '—'}
        </Badge>
      );
    }
    return <Badge variant="secondary">All</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Calculate Increment % · AY {year}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Scope:</span>
              <Select value={scope} onValueChange={(v) => setScope(v as 'all' | 'single')}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  <SelectItem value="single">Single Employee</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleRun} disabled={runDisabled}>
                {trigger.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Run Calculation
              </Button>
            </div>
          </div>
          {scope === 'single' && (
            <div className="w-full sm:w-[420px]">
              <EmployeeCombobox
                employees={employees}
                value={selectedEmpId}
                onChange={setSelectedEmpId}
                placeholder="Select employee to calculate…"
              />
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No runs yet. Choose calculation scope and click "Run Calculation" to start.
            </p>
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
                      {r.summary?.total ?? 0} employees · {r.summary?.eligible ?? 0} eligible · {r.summary?.ineligible ?? 0} ineligible
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setSelectedRun(r.id)}>View</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedRun && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Run Details</CardTitle>
            <Button variant="outline" onClick={exportRun} disabled={!itemsData?.rows?.length || exportQuery.isFetching}>
              {exportQuery.isFetching
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <FileSpreadsheet className="h-4 w-4 mr-2" />}
              Export Excel
            </Button>
          </CardHeader>
          <CardContent>
            {itemsLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {(itemsData?.rows ?? []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.employee?.full_name ?? r.employee_id}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.employee?.employee_code ?? '—'}</TableCell>
                    <TableCell>{r.pms_score ?? '—'}</TableCell>
                    <TableCell>{r.rating_band ?? '—'}</TableCell>
                    <TableCell>{r.slab_percent ?? '—'}%</TableCell>
                    <TableCell>
                      <Badge variant={r.eligibility_status === 'eligible' ? 'default' : 'destructive'}>
                        {r.eligibility_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={r.ineligibility_reason ?? ''}>
                      {r.ineligibility_reason ?? '—'}
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
                  </TableRow>
                ))}
                {(itemsData?.rows ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={16} className="text-center text-muted-foreground py-8">
                      No items for this run.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            <div className="flex items-center justify-between mt-4">
              <div className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages} · {itemsData?.total ?? 0} total
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
            </>
            )}
          </CardContent>
        </Card>
      )}
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