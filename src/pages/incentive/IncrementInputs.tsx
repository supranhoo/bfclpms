import { useMemo, useState } from 'react';
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
} from '@/hooks/useIncrementRuns';
import { Loader2, Upload, Play, FileSpreadsheet } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { generateAssessmentYears, getCurrentAssessmentYear } from '@/lib/assessmentYear';
import * as XLSX from 'xlsx';

function downloadXlsx(filename: string, rows: any[], headers: string[]) {
  const data = rows.length
    ? rows.map((r) => headers.reduce((o, h) => ({ ...o, [h]: r[h] ?? '' }), {} as any))
    : [headers.reduce((o, h) => ({ ...o, [h]: '' }), {} as any)];
  const ws = XLSX.utils.json_to_sheet(data, { header: headers });
  // If we only used the placeholder row, drop it so the sheet is just the header.
  if (!rows.length) XLSX.utils.sheet_add_aoa(ws, [headers], { origin: 'A1' }), ws['!ref'] = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: headers.length - 1, r: 0 } });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  XLSX.writeFile(wb, filename);
}

function EnterInputsTab({ year }: { year: string }) {
  const [page, setPage] = useState(0);
  const pageSize = 50;
  const { data, isLoading } = useIncrementInputs(year, page, pageSize);
  const upsert = useUpsertIncrementInput();
  const importMut = useBulkImportIncrementInputs();
  const { toast } = useToast();

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const parsed = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });
      const rows = parsed.map((o: any) => ({
          employee_id: o.employee_id,
          absent_days: Number(o.absent_days ?? 0),
          lwp_days: Number(o.lwp_days ?? 0),
          disciplinary_actions: Number(o.disciplinary_actions ?? 0),
          training_compliance: Number(o.training_compliance ?? 0),
          current_salary: o.current_salary ? Number(o.current_salary) : null,
      })).filter((r) => r.employee_id);
      await importMut.mutateAsync({ rows, assessment_year: year });
    } catch (err: any) {
      toast({ title: 'Import failed', description: err?.message ?? 'Parse error', variant: 'destructive' });
    } finally {
      e.target.value = '';
    }
  };

  const exportTemplate = () => {
    downloadXlsx('Import Inputs.xlsx', [], [
      'employee_id', 'absent_days', 'lwp_days', 'disciplinary_actions',
      'training_compliance', 'current_salary',
    ]);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Employee Inputs · AY {year}</CardTitle>
        <div className="flex items-center gap-2">
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.rows ?? []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className="text-sm">{r.employee?.full_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{r.employee?.employee_id ?? r.employee_id}</div>
                    </TableCell>
                    <TableCell>{r.absent_days}</TableCell>
                    <TableCell>{r.lwp_days}</TableCell>
                    <TableCell>{r.disciplinary_actions}</TableCell>
                    <TableCell>{r.training_compliance}</TableCell>
                    <TableCell>{r.current_salary ?? '—'}</TableCell>
                    <TableCell><Badge variant="secondary">{r.source}</Badge></TableCell>
                  </TableRow>
                ))}
                {(data?.rows ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No inputs yet. Import an Excel file to begin.
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
    </Card>
  );
}

function CalculateIncrementTab({ year }: { year: string }) {
  const { data: runs = [], isLoading } = useIncrementRuns(year);
  const trigger = useTriggerIncrementRun();
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const { data: itemsData } = useIncrementRunItems(selectedRun, 0, 200);

  const exportRun = () => {
    if (!itemsData?.rows?.length) return;
    const rows = itemsData.rows.map((r: any) => ({
      employee: r.employee?.full_name ?? '',
      employee_id: r.employee?.employee_id ?? r.employee_id,
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
    downloadXlsx(`increment-run-${selectedRun}.xlsx`, rows, Object.keys(rows[0]));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Calculate Increment % · AY {year}</CardTitle>
          <Button onClick={() => trigger.mutate({ assessment_year: year })} disabled={trigger.isPending}>
            {trigger.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
            Run Calculation
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet. Click "Run Calculation" to start.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Triggered At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Summary</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id} className={selectedRun === r.id ? 'bg-muted/40' : ''}>
                    <TableCell>{new Date(r.triggered_at).toLocaleString()}</TableCell>
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
            <Button variant="outline" onClick={exportRun} disabled={!itemsData?.rows?.length}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />Export Excel
            </Button>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>PMS Score</TableHead>
                  <TableHead>Slab %</TableHead>
                  <TableHead>Eligibility</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Eligible %</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Increment</TableHead>
                  <TableHead>Revised</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Conf.Inc?</TableHead>
                  <TableHead>Conf.Date</TableHead>
                  <TableHead>Period Covered</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Carry Fwd</TableHead>
                  <TableHead>Final Months</TableHead>
                  <TableHead>Treatment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(itemsData?.rows ?? []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.employee?.full_name ?? r.employee_id}</TableCell>
                    <TableCell>{r.pms_score ?? '—'}</TableCell>
                    <TableCell>{r.slab_percent ?? '—'}%</TableCell>
                    <TableCell>
                      <Badge variant={r.eligibility_status === 'eligible' ? 'default' : 'destructive'}>
                        {r.eligibility_status}
                      </Badge>
                    </TableCell>
                    <TableCell>{r.method_used ?? '—'}</TableCell>
                    <TableCell>{r.eligible_percent ?? '—'}%</TableCell>
                    <TableCell>{r.current_salary ?? '—'}</TableCell>
                    <TableCell>{r.increment_amount ?? '—'}</TableCell>
                    <TableCell>{r.revised_salary ?? '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.ineligibility_reason ?? ''}</TableCell>
                    <TableCell>{r.confirmation_granted ? <Badge variant="secondary">Yes</Badge> : '—'}</TableCell>
                    <TableCell className="text-xs">{r.confirmation_effective_date ?? '—'}</TableCell>
                    <TableCell>{r.period_covered_months ?? '—'}</TableCell>
                    <TableCell>{r.balance_eligible_months ?? '—'}</TableCell>
                    <TableCell>{r.carry_forward_months ?? '—'}</TableCell>
                    <TableCell>{r.final_eligible_months ?? '—'}</TableCell>
                    <TableCell className="text-xs">{r.confirmation_treatment ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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