import { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, Search, Download, AlertTriangle, CheckCircle2, SkipForward, Users, FileSpreadsheet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import {
  MAX_ROLLOUT_PERIODS,
  describeTargets,
  resolveRolloutTargets,
  type RepeatMode,
  type RolloverTarget,
} from '@/lib/rolloverTargets';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface EmployeeResult {
  employee_id: string;
  employee_name: string;
  employee_code: string;
  department: string;
  kpis_copied: number;
  status: 'rolled_over' | 'balance_only' | 'skipped';
  existing_kpi_count: number;
  existing_kpi_names: string[];
  source_kpi_count: number;
}

interface RolloverResponse {
  success: boolean;
  dry_run?: boolean;
  rolled_over: EmployeeResult[];
  skipped_employees: EmployeeResult[];
  conflicts: EmployeeResult[];
  total_kpis_copied: number;
  total_employees_affected: number;
  duplicates_skipped?: number;
  source_period: string;
  source_year: number;
  target_period: string;
  target_year: number;
  skipped?: boolean;
  reason?: string;
  error?: string;
  audit_assignments_cloned?: number;
  audit_assignments_skipped_already_assigned?: number;
  audit_clone_errors?: string[];
  employees_skipped_already_issued?: number;
  weightage_warnings?: Array<{ employee_id: string; employee_name: string; total_weightage: number }>;
}

/** Per-target-period summary shown for a multi-month rollout. */
interface PeriodSummary {
  month: string;
  year: number;
  new_kpis: number;
  employees: number;
  conflicts: number;
}

interface RolloverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * When provided, locks the dialog to a single employee. Hides the All-Employees
   * switch and the picker list. Used from the per-employee scorecard header.
   */
  scopedEmployee?: { id: string; name: string; code?: string };
  /** Default target month/year (e.g. the currently-displayed scorecard period). */
  defaultTargetMonth?: string;
  defaultTargetYear?: number;
}

type Step = 'config' | 'preview' | 'results';

/** Folds one response per target period into a single results payload. */
function mergeResponses(responses: RolloverResponse[], targets: RolloverTarget[]): RolloverResponse {
  const base = responses[responses.length - 1];
  const byEmployee = new Map<string, EmployeeResult>();
  for (const res of responses) {
    for (const r of res.rolled_over ?? []) {
      const prev = byEmployee.get(r.employee_id);
      byEmployee.set(
        r.employee_id,
        prev ? { ...prev, kpis_copied: prev.kpis_copied + r.kpis_copied } : { ...r },
      );
    }
  }
  const skipped = new Map<string, EmployeeResult>();
  for (const res of responses) {
    for (const s of res.skipped_employees ?? []) {
      if (!byEmployee.has(s.employee_id)) skipped.set(s.employee_id, s);
    }
  }
  return {
    ...base,
    rolled_over: Array.from(byEmployee.values()),
    skipped_employees: Array.from(skipped.values()),
    conflicts: [],
    total_kpis_copied: responses.reduce((s, r) => s + (r.total_kpis_copied ?? 0), 0),
    duplicates_skipped: responses.reduce((s, r) => s + (r.duplicates_skipped ?? 0), 0),
    total_employees_affected: byEmployee.size,
    audit_assignments_cloned: responses.reduce((s, r) => s + (r.audit_assignments_cloned ?? 0), 0),
    audit_assignments_skipped_already_assigned: responses.reduce(
      (s, r) => s + (r.audit_assignments_skipped_already_assigned ?? 0),
      0,
    ),
    audit_clone_errors: responses.flatMap((r) => r.audit_clone_errors ?? []),
    weightage_warnings: responses.flatMap((r) => r.weightage_warnings ?? []),
    target_period: targets[0]?.month ?? base.target_period,
    target_year: targets[0]?.year ?? base.target_year,
  };
}

export function RolloverDialog({ open, onOpenChange, scopedEmployee, defaultTargetMonth, defaultTargetYear }: RolloverDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const now = new Date();
  const initialTargetIdx = defaultTargetMonth && MONTHS.includes(defaultTargetMonth)
    ? MONTHS.indexOf(defaultTargetMonth)
    : now.getMonth();
  const initialTargetYear = defaultTargetYear ?? now.getFullYear();
  const initialSourceIdx = (initialTargetIdx + 11) % 12;
  const initialSourceYear = initialTargetIdx === 0 ? initialTargetYear - 1 : initialTargetYear;

  const [step, setStep] = useState<Step>('config');
  const [sourceMonth, setSourceMonth] = useState(MONTHS[initialSourceIdx]);
  const [sourceYear, setSourceYear] = useState(initialSourceYear);
  const [targetMonth, setTargetMonth] = useState(MONTHS[initialTargetIdx]);
  const [targetYear, setTargetYear] = useState(initialTargetYear);
  const [allEmployees, setAllEmployees] = useState(!scopedEmployee);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>(
    scopedEmployee ? [scopedEmployee.id] : []
  );
  const [empSearch, setEmpSearch] = useState('');
  const [previewData, setPreviewData] = useState<RolloverResponse | null>(null);
  const [balanceIds, setBalanceIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<RolloverResponse | null>(null);
  // Opt-in: carry forward `audit_kpi_level_assignments` (per-KPI auditor
  // mappings) from the source period onto the newly created target KPIs.
  // Off by default — existing assignments on target KPIs are never overwritten.
  const [carryAuditAssignments, setCarryAuditAssignments] = useState(true);
  // ADR-248 — multi-month rollout
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('single');
  const [repeatCount, setRepeatCount] = useState(3);
  const [periodSummaries, setPeriodSummaries] = useState<PeriodSummary[] | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  const rolloutTargets: RolloverTarget[] = useMemo(
    () => resolveRolloutTargets({ month: targetMonth as any, year: targetYear }, repeatMode, repeatCount),
    [targetMonth, targetYear, repeatMode, repeatCount],
  );
  const isMultiMonth = rolloutTargets.length > 1;

  // When opened in scoped mode, ensure state stays locked to the scoped employee
  // and the supplied target period each time the dialog is reopened.
  useEffect(() => {
    if (!open) return;
    if (scopedEmployee) {
      setAllEmployees(false);
      setSelectedEmployeeIds([scopedEmployee.id]);
    }
    if (defaultTargetMonth && MONTHS.includes(defaultTargetMonth)) {
      const idx = MONTHS.indexOf(defaultTargetMonth);
      const yr = defaultTargetYear ?? now.getFullYear();
      setTargetMonth(MONTHS[idx]);
      setTargetYear(yr);
      setSourceMonth(MONTHS[(idx + 11) % 12]);
      setSourceYear(idx === 0 ? yr - 1 : yr);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scopedEmployee?.id, defaultTargetMonth, defaultTargetYear]);

  // Fetch employees for selector
  const { data: employees = [] } = useQuery({
    queryKey: ['rollover-employees'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code, departments:department_id(name)')
        .order('full_name');
      return (data || []).map((e: any) => ({
        id: e.id,
        name: e.full_name || e.id,
        code: e.employee_code || '',
        department: e.departments?.name || '',
      }));
    },
    enabled: open && !scopedEmployee,
  });

  const filteredEmployees = useMemo(() => {
    if (!empSearch) return employees;
    const q = empSearch.toLowerCase();
    return employees.filter((e: any) => e.name.toLowerCase().includes(q) || e.code.toLowerCase().includes(q) || e.department.toLowerCase().includes(q));
  }, [employees, empSearch]);

  // Preview mutation (dry run). For a multi-month rollout every target period
  // is dry-run sequentially; the first period drives the conflict UI and the
  // rest are summarised per-period (ADR-248).
  const previewMutation = useMutation({
    mutationFn: async () => {
      const summaries: PeriodSummary[] = [];
      let first: RolloverResponse | null = null;
      for (const t of rolloutTargets) {
        setProgress(`Checking ${t.month} ${t.year}…`);
        const { data, error } = await supabase.functions.invoke('auto-rollover-kpis', {
          body: {
            triggered_by: 'admin_manual',
            source_month: sourceMonth,
            source_year: sourceYear,
            target_month: t.month,
            target_year: t.year,
            employee_ids: allEmployees ? undefined : selectedEmployeeIds,
            dry_run: true,
          },
        });
        if (error) throw error;
        const res = data as RolloverResponse;
        summaries.push({
          month: t.month,
          year: t.year,
          new_kpis:
            (res.rolled_over ?? []).reduce((s, r) => s + r.kpis_copied, 0) +
            (res.conflicts ?? []).reduce((s, r) => s + r.kpis_copied, 0),
          employees: (res.rolled_over ?? []).length + (res.conflicts ?? []).length,
          conflicts: (res.conflicts ?? []).length,
        });
        if (!first) first = res;
      }
      setProgress(null);
      return { first: first!, summaries };
    },
    onSuccess: ({ first, summaries }) => {
      const data = first;
      setPeriodSummaries(summaries);
      if (data.skipped) {
        toast({ title: 'No KPIs Found', description: data.reason });
        return;
      }
      setPreviewData(data);
      // Default all conflicts to balance-only
      setBalanceIds(new Set(data.conflicts.map((c: EmployeeResult) => c.employee_id)));
      setStep('preview');
    },
    onError: (err: Error) => {
      setProgress(null);
      toast({ title: 'Preview Failed', description: err.message, variant: 'destructive' });
    },
  });

  // Execute mutation
  const executeMutation = useMutation({
    mutationFn: async () => {
      const skipIds = previewData?.conflicts
        .filter((c: EmployeeResult) => !balanceIds.has(c.employee_id))
        .map((c: EmployeeResult) => c.employee_id) || [];

      const { data: auth } = await supabase.auth.getUser();
      const responses: RolloverResponse[] = [];
      for (const t of rolloutTargets) {
        setProgress(`Rolling over ${t.month} ${t.year}…`);
        const { data, error } = await supabase.functions.invoke('auto-rollover-kpis', {
          body: {
            triggered_by: 'admin_manual',
            source_month: sourceMonth,
            source_year: sourceYear,
            target_month: t.month,
            target_year: t.year,
            employee_ids: allEmployees ? undefined : selectedEmployeeIds,
            dry_run: false,
            rollover_balance_only: true,
            skip_employee_ids: skipIds,
            carry_audit_assignments: carryAuditAssignments,
            mark_issued: true,
            issued_by: auth?.user?.id,
          },
        });
        if (error) {
          throw new Error(
            `${t.month} ${t.year}: ${error.message}` +
              (responses.length ? ` (${responses.length} earlier period(s) already applied)` : ''),
          );
        }
        responses.push(data as RolloverResponse);
      }
      setProgress(null);
      return mergeResponses(responses, rolloutTargets);
    },
    onSuccess: (data) => {
      setResults(data);
      setStep('results');
      queryClient.invalidateQueries({ queryKey: ['rollover-logs'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      {
        const dups = data.duplicates_skipped ?? 0;
        const base = `${data.total_kpis_copied} KPIs copied for ${data.total_employees_affected} employees.`;
        toast({
          title: 'Rollover Complete',
          description: dups > 0 ? `${base} ${dups} pre-existing duplicate(s) skipped.` : base,
        });
      }
    },
    onError: (err: Error) => {
      setProgress(null);
      toast({ title: 'Rollover Failed', description: err.message, variant: 'destructive' });
    },
  });

  const handleDownloadReport = () => {
    if (!results) return;
    const allRows = [...results.rolled_over, ...results.skipped_employees].map((r) => ({
      'Employee Name': r.employee_name,
      'Employee Code': r.employee_code,
      'Department': r.department,
      'Source Period': `${results.source_period} ${results.source_year}`,
      'Target Period': `${results.target_period} ${results.target_year}`,
      'KPIs Copied': r.kpis_copied,
      'Status': r.status === 'rolled_over' ? 'Rolled Over' : r.status === 'balance_only' ? 'Balance Only' : 'Skipped',
      'Existing KPIs': r.existing_kpi_count,
      'Existing KPI Names': r.existing_kpi_names.join(', '),
    }));

    const ws = XLSX.utils.json_to_sheet(allRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rollover Report');
    XLSX.writeFile(wb, `KRA_Rollover_${results.source_period}_${results.source_year}_to_${results.target_period}_${results.target_year}.xlsx`);
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset after animation
    setTimeout(() => {
      setStep('config');
      setPreviewData(null);
      setResults(null);
      setBalanceIds(new Set());
    }, 300);
  };

  const toggleEmployee = (id: string) => {
    setSelectedEmployeeIds(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  };

  const toggleAllBalance = (checked: boolean) => {
    if (checked && previewData) {
      setBalanceIds(new Set(previewData.conflicts.map(c => c.employee_id)));
    } else {
      setBalanceIds(new Set());
    }
  };

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className={cn(
        "max-w-3xl flex flex-col overflow-hidden",
        step !== 'config' ? "h-[85vh] max-h-[85vh]" : "max-h-[85vh]"
      )}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            {scopedEmployee ? `KRA Rollover — ${scopedEmployee.name}` : 'KRA Rollover'}
            {step !== 'config' && (
              <Badge variant="outline" className="ml-2">
                {step === 'preview' ? 'Step 2: Preview' : 'Step 3: Results'}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {step === 'config' && 'Configure source and target periods, then preview before rolling over.'}
            {step === 'preview' && 'Review conflicts and choose which employees to rollover.'}
            {step === 'results' && 'Rollover complete. Download the report below.'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 pr-4" type="always">
          {/* Step 1: Configuration */}
          {step === 'config' && (
            <div className="space-y-6 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-medium">Source Period</Label>
                  <div className="flex gap-2">
                    <Select value={sourceMonth} onValueChange={setSourceMonth}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={String(sourceYear)} onValueChange={(v) => setSourceYear(Number(v))}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-medium">Target Period</Label>
                  <div className="flex gap-2">
                    <Select value={targetMonth} onValueChange={setTargetMonth}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={String(targetYear)} onValueChange={(v) => setTargetYear(Number(v))}>
                      <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* ADR-248 — multi-month rollout */}
              <div className="space-y-2 rounded-lg border p-4">
                <Label className="font-medium">Repeat for</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={repeatMode} onValueChange={(v) => setRepeatMode(v as RepeatMode)}>
                    <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single month</SelectItem>
                      <SelectItem value="next_n">Next N months</SelectItem>
                      <SelectItem value="rest_of_fy">Rest of fiscal year (to June)</SelectItem>
                      <SelectItem value="full_fy">Full assessment period (Jul–Jun)</SelectItem>
                    </SelectContent>
                  </Select>
                  {repeatMode === 'next_n' && (
                    <Input
                      type="number"
                      min={2}
                      max={MAX_ROLLOUT_PERIODS}
                      value={repeatCount}
                      onChange={(e) => setRepeatCount(Number(e.target.value) || 1)}
                      className="w-20"
                    />
                  )}
                  <Badge variant="secondary" className="font-normal">
                    {describeTargets(rolloutTargets)} — {rolloutTargets.length} period{rolloutTargets.length === 1 ? '' : 's'}
                  </Badge>
                </div>
                {isMultiMonth && (
                  <p className="text-xs text-muted-foreground">
                    The same source KRA set is applied to each period in turn. Existing KPIs are never
                    duplicated, and each period is logged separately. Maximum {MAX_ROLLOUT_PERIODS} periods per run.
                  </p>
                )}
              </div>

              {scopedEmployee ? (
                <Alert className="border-primary/30 bg-primary/5">
                  <Users className="h-4 w-4" />
                  <AlertDescription>
                    Rolling over KRAs for <span className="font-semibold">{scopedEmployee.name}</span>
                    {scopedEmployee.code ? <> (<span className="font-mono">{scopedEmployee.code}</span>)</> : null}
                    {' '}only.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div>
                    <Label className="text-base font-medium">All Employees</Label>
                    <p className="text-sm text-muted-foreground">Rollover KPIs for all employees with KPIs in the source period.</p>
                  </div>
                  <Switch checked={allEmployees} onCheckedChange={setAllEmployees} />
                </div>
              )}

              {!scopedEmployee && !allEmployees && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search employees..."
                      value={empSearch}
                      onChange={(e) => setEmpSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <div className="border rounded-lg max-h-48 overflow-y-auto">
                    {filteredEmployees.map((emp: any) => (
                      <label key={emp.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/50 cursor-pointer border-b last:border-0">
                        <Checkbox
                          checked={selectedEmployeeIds.includes(emp.id)}
                          onCheckedChange={() => toggleEmployee(emp.id)}
                        />
                        <span className="text-sm font-medium">{emp.name}</span>
                        {emp.code && <Badge variant="outline" className="text-xs">{emp.code}</Badge>}
                        <span className="text-xs text-muted-foreground ml-auto">{emp.department}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{selectedEmployeeIds.length} employees selected</p>
                </div>
              )}

              <Button
                onClick={() => previewMutation.mutate()}
                disabled={previewMutation.isPending || (!allEmployees && selectedEmployeeIds.length === 0)}
                className="w-full"
              >
                {previewMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />{progress ?? 'Checking...'}</>
                ) : (
                  <><Search className="h-4 w-4 mr-2" />Check & Preview</>
                )}
              </Button>

              <div className="flex items-start justify-between gap-3 p-4 rounded-lg border bg-muted/30">
                <div className="flex-1">
                  <Label htmlFor="carry-audit" className="text-sm font-medium">
                    Carry forward auditor mappings
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Clone each source KPI's assigned auditor onto the newly created
                    target KPI. Target KPIs that already have an auditor are
                    preserved. Action is audit-logged.
                  </p>
                </div>
                <Switch
                  id="carry-audit"
                  checked={carryAuditAssignments}
                  onCheckedChange={setCarryAuditAssignments}
                />
              </div>
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && previewData && (
            <div className="space-y-4 py-2">
              {periodSummaries && periodSummaries.length > 1 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Per-period plan ({periodSummaries.length} periods)</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-center">Employees</TableHead>
                        <TableHead className="text-center">New KPIs</TableHead>
                        <TableHead className="text-center">Already present</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {periodSummaries.map((p) => (
                        <TableRow key={`${p.month}-${p.year}`}>
                          <TableCell className="font-medium">{p.month} {p.year}</TableCell>
                          <TableCell className="text-center">{p.employees}</TableCell>
                          <TableCell className="text-center">{p.new_kpis || <span className="text-muted-foreground">nothing to create</span>}</TableCell>
                          <TableCell className="text-center">{p.conflicts}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <p className="text-xs text-muted-foreground">
                    The conflict choices below apply to every period in this rollout.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <CheckCircle2 className="h-6 w-6 mx-auto text-green-500 mb-1" />
                    <p className="text-2xl font-bold">{previewData.rolled_over.length}</p>
                    <p className="text-xs text-muted-foreground">Ready to rollover</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <AlertTriangle className="h-6 w-6 mx-auto text-amber-500 mb-1" />
                    <p className="text-2xl font-bold">{balanceIds.size}</p>
                    <p className="text-xs text-muted-foreground">Balance rollover</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <SkipForward className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                    <p className="text-2xl font-bold">{previewData.skipped_employees.length + previewData.conflicts.length - balanceIds.size}</p>
                    <p className="text-xs text-muted-foreground">Will be skipped</p>
                  </CardContent>
                </Card>
              </div>

              {previewData.rolled_over.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    Ready ({previewData.rolled_over.length} employees, {previewData.rolled_over.reduce((s, r) => s + r.kpis_copied, 0)} KPIs)
                  </h4>
                </div>
              )}

              {previewData.conflicts.length > 0 && (
                <div className="space-y-2">
                  <Alert variant="default" className="border-amber-500/50 bg-amber-500/5">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <AlertDescription>
                      {previewData.conflicts.length} employees already have KPIs in {previewData.target_period} {previewData.target_year}.
                      Check the box to rollover only missing (balance) KPIs, or uncheck to skip.
                    </AlertDescription>
                  </Alert>

                  <div className="flex items-center gap-2 px-1">
                    <Checkbox
                      checked={balanceIds.size === previewData.conflicts.length}
                      onCheckedChange={(c) => toggleAllBalance(!!c)}
                    />
                    <Label className="text-sm">Select All (Rollover Balance)</Label>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">Balance</TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead className="text-center">Existing</TableHead>
                        <TableHead className="text-center">Source</TableHead>
                        <TableHead className="text-center">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.conflicts.map((c) => (
                        <TableRow key={c.employee_id}>
                          <TableCell>
                            <Checkbox
                              checked={balanceIds.has(c.employee_id)}
                              onCheckedChange={(checked) => {
                                const next = new Set(balanceIds);
                                checked ? next.add(c.employee_id) : next.delete(c.employee_id);
                                setBalanceIds(next);
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{c.employee_name}</p>
                              {c.employee_code && <p className="text-xs text-muted-foreground">{c.employee_code}</p>}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{c.department}</TableCell>
                          <TableCell className="text-center">{c.existing_kpi_count}</TableCell>
                          <TableCell className="text-center">{c.source_kpi_count}</TableCell>
                          <TableCell className="text-center font-medium">{c.kpis_copied}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Results */}
          {step === 'results' && results && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-3 gap-3">
                <Card>
                  <CardContent className="pt-4 text-center">
                    <CheckCircle2 className="h-6 w-6 mx-auto text-green-500 mb-1" />
                    <p className="text-2xl font-bold">{results.rolled_over.filter(r => r.status === 'rolled_over').length}</p>
                    <p className="text-xs text-muted-foreground">Rolled Over</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <FileSpreadsheet className="h-6 w-6 mx-auto text-blue-500 mb-1" />
                    <p className="text-2xl font-bold">{results.rolled_over.filter(r => r.status === 'balance_only').length}</p>
                    <p className="text-xs text-muted-foreground">Balance Only</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 text-center">
                    <SkipForward className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
                    <p className="text-2xl font-bold">{results.skipped_employees.length}</p>
                    <p className="text-xs text-muted-foreground">Skipped</p>
                  </CardContent>
                </Card>
              </div>

              <div className="text-sm text-muted-foreground text-center">
                Total: {results.total_kpis_copied} KPIs copied for {results.total_employees_affected} employees
              </div>

              {(results.audit_assignments_cloned ?? 0) +
                (results.audit_assignments_skipped_already_assigned ?? 0) >
                0 && (
                <Alert className="border-primary/30 bg-primary/5">
                  <Users className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    Auditor mappings:{' '}
                    <span className="font-semibold">{results.audit_assignments_cloned ?? 0}</span> cloned
                    {(results.audit_assignments_skipped_already_assigned ?? 0) > 0 && (
                      <>
                        {', '}
                        <span className="font-semibold">
                          {results.audit_assignments_skipped_already_assigned}
                        </span>{' '}
                        preserved (target already assigned)
                      </>
                    )}
                    {(results.audit_clone_errors?.length ?? 0) > 0 && (
                      <span className="text-destructive">
                        {' '}— {results.audit_clone_errors!.length} error(s); see edge-function logs.
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead className="text-center">KPIs Copied</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...results.rolled_over, ...results.skipped_employees].map((r) => (
                    <TableRow key={r.employee_id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{r.employee_name}</p>
                          {r.employee_code && <p className="text-xs text-muted-foreground">{r.employee_code}</p>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{r.department}</TableCell>
                      <TableCell className="text-center">{r.kpis_copied}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'rolled_over' ? 'default' : r.status === 'balance_only' ? 'secondary' : 'outline'}>
                          {r.status === 'rolled_over' ? 'Rolled Over' : r.status === 'balance_only' ? 'Balance Only' : 'Skipped'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </ScrollArea>

        {/* Fixed footer buttons for Preview step */}
        {step === 'preview' && previewData && (
          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => setStep('config')}>Back</Button>
            <Button
              onClick={() => executeMutation.mutate()}
              disabled={executeMutation.isPending}
              className="flex-1"
            >
              {executeMutation.isPending ? (
                <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Rolling Over...</>
              ) : (
                <><RefreshCw className="h-4 w-4 mr-2" />Proceed with Rollover</>
              )}
            </Button>
          </div>
        )}

        {/* Fixed footer buttons for Results step */}
        {step === 'results' && results && (
          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" onClick={handleClose}>Close</Button>
            <Button onClick={handleDownloadReport} className="flex-1 gap-2">
              <Download className="h-4 w-4" />
              Download Report (Excel)
            </Button>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
