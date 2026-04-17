import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, Loader2 } from 'lucide-react';

const toNum = (v: any): number => {
  const n = Number(v ?? 0);
  return isNaN(n) ? 0 : n;
};

interface DryRunResult {
  computed: number;
  program: string;
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
                  <TableHead>PMS Score</TableHead>
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
                  const pmsScore = r.pms_score != null ? toNum(r.pms_score).toFixed(2) : (r.production_value ?? '—');
                  const lti = toNum(r.lti_penalty_percent);
                  const prorata = toNum(r.pro_rata_factor);
                  const finalPct = toNum(r.final_incentive_percent);
                  const amount = toNum(r.incentive_amount);
                  return (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="text-sm font-medium">{emp?.name || r.employee_id.slice(0, 8)}</div>
                        {emp?.code && <div className="text-xs text-muted-foreground">{emp.code}</div>}
                      </TableCell>
                      <TableCell>{pmsScore}</TableCell>
                      <TableCell>{toNum(r.base_incentive_percent)}%</TableCell>
                      <TableCell>
                        {r.is_disqualified ? (
                          <Badge variant="destructive" className="text-xs">{r.disqualification_reasons?.[0] || 'DQ'}</Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{lti > 0 ? `${lti}%` : '—'}</TableCell>
                      <TableCell>{prorata < 1 ? prorata.toFixed(2) : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={finalPct > 0 ? 'default' : 'secondary'}>
                          {finalPct}%
                        </Badge>
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
