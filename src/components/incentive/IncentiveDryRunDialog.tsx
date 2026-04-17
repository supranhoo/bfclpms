import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, Loader2, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const NA = <span className="text-muted-foreground italic">N/A</span>;

const toNum = (v: any): number => {
  const n = Number(v ?? 0);
  return isNaN(n) ? 0 : n;
};

interface DryRunResult {
  computed: number;
  program: string;
  message?: string | null;
  diagnostics?: {
    detected_program_type?: string;
    employees_in_scope?: number;
    employees_processed?: number;
    employees_with_daily_entries?: number;
    employees_with_selected_period_data?: number;
    employees_with_resolved_rate?: number;
    employees_skipped_no_rate?: number;
    vessel_program_detected?: boolean;
    employees_with_vessel_rate?: number;
    employees_with_vessel_entries?: number;
    records_pre_scope?: number;
    records_post_scope?: number;
  };
  summary: {
    total: number;
    eligible: number;
    disqualified: number;
    avg_incentive_percent: number;
    total_amount?: number;
  };
  records: Array<{
    employee_id: string;
    pms_score: number | null;
    base_incentive_percent: number;
    is_disqualified: boolean;
    disqualification_reasons: string[] | null;
    lti_penalty_percent: number;
    pro_rata_factor: number;
    final_incentive_percent: number;
    production_value: number | null;
    incentive_amount?: number;
  }>;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: DryRunResult | null;
  onConfirm: () => void;
  isConfirming: boolean;
  employeeNames?: Map<string, { name: string; code: string }>;
  scopeText?: string;
}

export function IncentiveDryRunDialog({ open, onOpenChange, result, onConfirm, isConfirming, employeeNames, scopeText }: Props) {
  if (!result) return null;
  const summary = result.summary || { total: 0, eligible: 0, disqualified: 0, avg_incentive_percent: 0, total_amount: 0 };
  const records = result.records || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle>Incentive Computation Preview</DialogTitle>
          <DialogDescription>
            Review the results before committing. Program: {result.program}
            {scopeText && (
              <span className="block mt-1 text-xs">
                Scope: <span className="font-medium text-foreground">{scopeText}</span> · {summary.total} record(s)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-5">
          {[
            { label: 'Total', value: summary.total ?? 0 },
            { label: 'Eligible', value: summary.eligible ?? 0 },
            { label: 'Disqualified', value: summary.disqualified ?? 0 },
            { label: 'Avg Incentive %', value: toNum(summary.avg_incentive_percent).toFixed(1) + '%' },
            { label: 'Total Amount', value: '₹' + Math.round(toNum(summary.total_amount)).toLocaleString('en-IN') },
          ].map(s => (
            <Card key={s.label}>
              <CardContent className="pt-3 pb-3">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {(result.message || result.diagnostics) && (
          <div className="rounded-md border bg-muted/40 p-3 text-xs space-y-1">
            {result.message && <p className="font-medium text-foreground">{result.message}</p>}
            {result.diagnostics && (
              <p className="text-muted-foreground">
                Mode: <span className="font-medium">{result.diagnostics.detected_program_type ?? '—'}</span>
                {result.diagnostics.vessel_program_detected && <> · <span className="font-medium text-foreground">Vessel-based</span></>} ·
                In scope: <span className="font-medium">{result.diagnostics.employees_in_scope ?? '—'}</span> ·
                {result.diagnostics.vessel_program_detected ? (
                  <>
                    With vessel rate: <span className="font-medium">{result.diagnostics.employees_with_vessel_rate ?? 0}</span> ·
                    With vessel entries: <span className="font-medium">{result.diagnostics.employees_with_vessel_entries ?? 0}</span>
                  </>
                ) : (
                  <>
                    With daily data: <span className="font-medium">{result.diagnostics.employees_with_daily_entries ?? '—'}</span> ·
                    With rate: <span className="font-medium">{result.diagnostics.employees_with_resolved_rate ?? '—'}</span> ·
                    Skipped (no rate): <span className="font-medium">{result.diagnostics.employees_skipped_no_rate ?? 0}</span>
                  </>
                )}
              </p>
            )}
          </div>
        )}

        {records.length === 0 ? (
          <div className="h-[200px] rounded-md border flex items-center justify-center text-sm text-muted-foreground">
            No records to compute (filters returned 0 employees).
          </div>
        ) : (
          <ScrollArea className="h-[400px] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 cursor-help">
                            PMS Score <Info className="h-3 w-3 text-muted-foreground" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          Employees without assigned KRAs will show N/A here.
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableHead>
                  <TableHead>Base %</TableHead>
                  <TableHead>DQ Reason</TableHead>
                  <TableHead>LTI Penalty</TableHead>
                  <TableHead>Pro-rata</TableHead>
                  <TableHead>Final %</TableHead>
                  <TableHead>Amount (₹)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r, i) => {
                  const emp = employeeNames?.get(r.employee_id);
                  const isVesselProgram = !!result.diagnostics?.vessel_program_detected;
                  const hasVesselData = toNum((r as any).vessel_count) > 0 || toNum(r.production_value) > 0;
                  const showVesselBadge = isVesselProgram && hasVesselData;
                  const hasPms = r.pms_score != null;
                  const lti = toNum(r.lti_penalty_percent);
                  const prorata = toNum(r.pro_rata_factor);
                  const finalPct = toNum(r.final_incentive_percent);
                  const amount = toNum(r.incentive_amount);
                  const dqReason = r.disqualification_reasons?.[0];
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div>
                            <div className="text-sm font-medium">{emp?.name || r.employee_id.slice(0, 8)}</div>
                            {emp?.code && <div className="text-xs text-muted-foreground">{emp.code}</div>}
                          </div>
                          {showVesselBadge && <Badge variant="outline" className="text-[10px]">Vessel</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {hasPms ? toNum(r.pms_score).toFixed(2) : NA}
                      </TableCell>
                      <TableCell>{hasPms ? `${toNum(r.base_incentive_percent)}%` : NA}</TableCell>
                      <TableCell>
                        {r.is_disqualified && dqReason ? (
                          <Badge variant="destructive" className="text-xs">{dqReason}</Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{lti > 0 ? `${lti}%` : '—'}</TableCell>
                      <TableCell>{prorata > 0 && prorata < 1 ? prorata.toFixed(2) : '—'}</TableCell>
                      <TableCell>
                        {hasPms ? (
                          <Badge variant={finalPct > 0 ? 'default' : 'secondary'}>{finalPct}%</Badge>
                        ) : NA}
                      </TableCell>
                      <TableCell className="font-medium">
                        {amount > 0 ? `₹${Math.round(amount).toLocaleString('en-IN')}` : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onConfirm} disabled={isConfirming || records.length === 0}>
            {isConfirming ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            Confirm & Compute
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
