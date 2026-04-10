import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Ban, Download, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { invokeAdminEdgeFunction } from '@/lib/adminEdgeFunction';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';

interface ScanDetailRow {
  kpi_id: string;
  employee_id: string;
  employee_name: string;
  kpi_name: string;
  kra_name: string;
  category: string;
  current_status: string;
  action: 'zero_scorable' | 'skippable';
  reason: string;
}

interface OrgDetailRow {
  org_kpi_id: string;
  kpi_name: string;
  kra_name: string;
  category: string;
  current_value: number | null;
  current_status: string | null;
  action: 'zero_scorable';
  reason: string;
}

const REASON_LABELS: Record<string, string> = {
  stuck_at_kra_set: 'Stuck at KRA Set',
  stuck_at_self_review: 'Stuck at Self Review',
  sent_back_open_query: 'Sent back (excluded)',
  non_terminal_multi_month: 'Non-terminal month',
  na_marked: 'N/A marked (excluded)',
  no_data_entered: 'Org KPI — no data entered',
  not_propagated: 'Org KPI — not propagated',
  all_levels_zeroed: 'All levels scored 0',
};

interface Props {
  employeeId: string;
  employeeName: string;
  reviewPeriod: string;
  reviewYear: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 'idle' | 'scanning' | 'results' | 'executing' | 'done';

export function EmployeeBulkZeroScoreDialog({ employeeId, employeeName, reviewPeriod, reviewYear, open, onOpenChange }: Props) {
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>('idle');
  const [includeOrgKpis, setIncludeOrgKpis] = useState(false);
  const [adminRemarks, setAdminRemarks] = useState('Data not submitted by deadline');
  const [confirmText, setConfirmText] = useState('');

  const [details, setDetails] = useState<ScanDetailRow[]>([]);
  const [orgDetails, setOrgDetails] = useState<OrgDetailRow[]>([]);
  const [selectedKpiIds, setSelectedKpiIds] = useState<Set<string>>(new Set());
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set());
  const [priorWarning, setPriorWarning] = useState<string | null>(null);

  const [executeResult, setExecuteResult] = useState<any>(null);

  const zeroScorable = details.filter(d => d.action === 'zero_scorable');
  const skippable = details.filter(d => d.action === 'skippable');

  const reset = () => {
    setStep('idle');
    setDetails([]);
    setOrgDetails([]);
    setSelectedKpiIds(new Set());
    setSelectedOrgIds(new Set());
    setPriorWarning(null);
    setConfirmText('');
    setExecuteResult(null);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleScan = async () => {
    setStep('scanning');
    try {
      const result = await invokeAdminEdgeFunction<any>('bulk-zero-score-non-submitters', {
        mode: 'scan',
        review_period: reviewPeriod,
        review_year: reviewYear,
        include_org_kpis: includeOrgKpis,
        employee_id: employeeId,
      });
      setDetails(result.details || []);
      setOrgDetails(result.org_details || []);
      setPriorWarning(result.prior_batch_warning || null);
      const autoSelect = new Set<string>(
        (result.details || []).filter((d: ScanDetailRow) => d.action === 'zero_scorable').map((d: ScanDetailRow) => d.kpi_id)
      );
      setSelectedKpiIds(autoSelect);
      const autoSelectOrg = new Set<string>(
        (result.org_details || []).map((d: OrgDetailRow) => d.org_kpi_id)
      );
      setSelectedOrgIds(autoSelectOrg);
      setStep('results');
    } catch (e: any) {
      toast({ title: 'Scan failed', description: e.message, variant: 'destructive' });
      setStep('idle');
    }
  };

  const handleExecute = async () => {
    if (confirmText !== 'ZERO') return;
    setStep('executing');
    try {
      const result = await invokeAdminEdgeFunction<any>('bulk-zero-score-non-submitters', {
        mode: 'execute',
        review_period: reviewPeriod,
        review_year: reviewYear,
        kpi_ids: Array.from(selectedKpiIds),
        org_kpi_ids: Array.from(selectedOrgIds),
        admin_remarks: adminRemarks,
        employee_id: employeeId,
      });
      setExecuteResult(result);
      setStep('done');
      toast({ title: 'Zero-score complete', description: `${result.zero_scored} KPIs zeroed for ${employeeName}` });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
    } catch (e: any) {
      toast({ title: 'Execution failed', description: e.message, variant: 'destructive' });
      setStep('results');
    }
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    if (details.length > 0) {
      const ws = XLSX.utils.json_to_sheet(details);
      XLSX.utils.book_append_sheet(wb, ws, 'KPIs');
    }
    if (orgDetails.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(orgDetails);
      XLSX.utils.book_append_sheet(wb, ws2, 'Org KPIs');
    }
    XLSX.writeFile(wb, `zero-score-${employeeName.replace(/\s+/g, '_')}-${reviewPeriod}-${reviewYear}.xlsx`);
  };

  const toggleKpi = (id: string) => {
    const next = new Set(selectedKpiIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedKpiIds(next);
  };

  const toggleAllKpis = () => {
    if (selectedKpiIds.size === zeroScorable.length) {
      setSelectedKpiIds(new Set());
    } else {
      setSelectedKpiIds(new Set(zeroScorable.map(d => d.kpi_id)));
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" />
            Bulk Zero-Score — {employeeName}
          </DialogTitle>
          <DialogDescription>
            Zero-score non-submitted KPIs for {reviewPeriod} {reviewYear}
          </DialogDescription>
        </DialogHeader>

        {/* IDLE — show scan controls */}
        {step === 'idle' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="incOrgKpis"
                checked={includeOrgKpis}
                onCheckedChange={(c) => setIncludeOrgKpis(!!c)}
              />
              <Label htmlFor="incOrgKpis" className="text-sm">Include Org KPIs</Label>
            </div>
            <Button onClick={handleScan} className="w-full">
              <RefreshCw className="h-4 w-4 mr-2" /> Scan Non-Submitted KPIs
            </Button>
          </div>
        )}

        {/* SCANNING */}
        {step === 'scanning' && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Scanning…
          </div>
        )}

        {/* RESULTS */}
        {step === 'results' && (
          <div className="space-y-4">
            {priorWarning && (
              <div className="flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-950 dark:text-yellow-200">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {priorWarning}
              </div>
            )}

            <div className="flex items-center gap-3 text-sm">
              <Badge variant="secondary">{zeroScorable.length} zero-scorable</Badge>
              {skippable.length > 0 && <Badge variant="outline">{skippable.length} excluded</Badge>}
              {orgDetails.length > 0 && <Badge variant="secondary">{orgDetails.length} org KPIs</Badge>}
              <Button size="sm" variant="outline" onClick={exportExcel}>
                <Download className="h-3.5 w-3.5 mr-1" /> Export
              </Button>
            </div>

            {zeroScorable.length === 0 && orgDetails.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                No non-submitted KPIs found for this employee.
              </div>
            ) : (
              <>
                {/* KPI table */}
                {zeroScorable.length > 0 && (
                  <div className="border rounded-md max-h-48 overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={selectedKpiIds.size === zeroScorable.length && zeroScorable.length > 0}
                              onCheckedChange={toggleAllKpis}
                            />
                          </TableHead>
                          <TableHead>KPI</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {zeroScorable.map(row => (
                          <TableRow key={row.kpi_id}>
                            <TableCell>
                              <Checkbox
                                checked={selectedKpiIds.has(row.kpi_id)}
                                onCheckedChange={() => toggleKpi(row.kpi_id)}
                              />
                            </TableCell>
                            <TableCell className="text-xs">{row.kpi_name}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{row.current_status}</Badge></TableCell>
                            <TableCell className="text-xs text-muted-foreground">{REASON_LABELS[row.reason] || row.reason}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}

                {/* Skipped items summary */}
                {skippable.length > 0 && (
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">{skippable.length} KPIs excluded (click to view)</summary>
                    <ul className="mt-1 ml-4 list-disc space-y-0.5">
                      {skippable.map(s => (
                        <li key={s.kpi_id}>{s.kpi_name} — {REASON_LABELS[s.reason] || s.reason}</li>
                      ))}
                    </ul>
                  </details>
                )}

                {/* Admin remarks */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Admin Remarks</Label>
                  <Textarea
                    value={adminRemarks}
                    onChange={e => setAdminRemarks(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                </div>

                {/* Confirm */}
                <div className="space-y-1.5">
                  <Label className="text-sm">Type <span className="font-mono font-bold text-destructive">ZERO</span> to confirm</Label>
                  <Input
                    value={confirmText}
                    onChange={e => setConfirmText(e.target.value)}
                    placeholder="ZERO"
                    className="font-mono"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* EXECUTING */}
        {step === 'executing' && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Executing zero-score…
          </div>
        )}

        {/* DONE */}
        {step === 'done' && executeResult && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Zero-score complete</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>KPIs zeroed: <strong>{executeResult.zero_scored}</strong></div>
              <div>Skipped: <strong>{executeResult.skipped}</strong></div>
              {executeResult.org_zero_scored > 0 && <div>Org KPIs zeroed: <strong>{executeResult.org_zero_scored}</strong></div>}
            </div>
            {executeResult.errors?.length > 0 && (
              <div className="text-destructive text-xs">
                Errors: {executeResult.errors.join(', ')}
              </div>
            )}
            <Button size="sm" variant="outline" onClick={exportExcel}>
              <Download className="h-3.5 w-3.5 mr-1" /> Export Results
            </Button>
          </div>
        )}

        <DialogFooter>
          {step === 'results' && (selectedKpiIds.size > 0 || selectedOrgIds.size > 0) && (
            <Button
              variant="destructive"
              disabled={confirmText !== 'ZERO'}
              onClick={handleExecute}
            >
              <Ban className="h-4 w-4 mr-2" />
              Zero-Score {selectedKpiIds.size + selectedOrgIds.size} Items
            </Button>
          )}
          {step === 'results' && (
            <Button variant="outline" onClick={reset}>Re-scan</Button>
          )}
          {step === 'done' && (
            <Button variant="outline" onClick={() => handleOpenChange(false)}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
