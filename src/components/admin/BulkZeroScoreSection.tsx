import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertCircle, AlertTriangle, Ban, CheckCircle2, Download, RefreshCw, Search } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import { invokeAdminEdgeFunction } from '@/lib/adminEdgeFunction';

const ALL_MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

interface ScanDetailRow {
  kpi_id: string;
  employee_id: string;
  employee_name: string;
  kpi_name: string;
  kra_name: string;
  category: string;
  review_period: string;
  review_year: number;
  current_status: string;
  action: 'zero_scorable' | 'skippable';
  reason: string;
}

interface OrgDetailRow {
  org_kpi_id: string;
  kpi_name: string;
  kra_name: string;
  category: string;
  review_period: string;
  review_year: number;
  current_value: number | null;
  current_status: string | null;
  action: 'zero_scorable';
  reason: string;
}

interface ExecuteResult {
  mode: 'execute';
  zero_scored: number;
  skipped: number;
  org_zero_scored: number;
  total_checked: number;
  errors: string[];
  details: any[];
  batch_id: string;
  verification: {
    kpis_at_approved: number;
    submissions_with_zero: number;
    checked: number;
  } | null;
  ran_at: string;
}

const REASON_LABELS: Record<string, string> = {
  stuck_at_kra_set: 'Stuck at KRA Set — no self-review submitted',
  stuck_at_self_review: 'Stuck at Self Review — not forwarded',
  sent_back_open_query: 'Sent back (open query) — excluded',
  non_terminal_multi_month: 'Non-terminal month — not yet due',
  no_data_entered: 'Org KPI — no data entered',
  not_propagated: 'Org KPI — not yet propagated',
  all_levels_zeroed: 'All levels scored 0 successfully',
};

export function BulkZeroScoreSection() {
  const currentDate = new Date();
  const [reviewPeriod, setReviewPeriod] = useState(ALL_MONTHS[currentDate.getMonth()]);
  const [reviewYear, setReviewYear] = useState(currentDate.getFullYear());
  const [includeOrgKpis, setIncludeOrgKpis] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);

  const [scanDetails, setScanDetails] = useState<ScanDetailRow[] | null>(null);
  const [orgDetails, setOrgDetails] = useState<OrgDetailRow[]>([]);
  const [priorBatchWarning, setPriorBatchWarning] = useState<string | null>(null);
  const [selectedKpiIds, setSelectedKpiIds] = useState<Set<string>>(new Set());
  const [selectedOrgIds, setSelectedOrgIds] = useState<Set<string>>(new Set());
  const [executeResult, setExecuteResult] = useState<ExecuteResult | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [adminRemarks, setAdminRemarks] = useState('Data not submitted by deadline');

  const zeroScorableRows = useMemo(
    () => scanDetails?.filter(r => r.action === 'zero_scorable') ?? [],
    [scanDetails],
  );

  const handleScan = async () => {
    setIsScanning(true);
    setScanDetails(null);
    setOrgDetails([]);
    setExecuteResult(null);
    setSelectedKpiIds(new Set());
    setSelectedOrgIds(new Set());
    setPriorBatchWarning(null);
    setConfirmText('');
    try {
      const data = await invokeAdminEdgeFunction<any>('bulk-zero-score-non-submitters', {
        mode: 'scan',
        review_period: reviewPeriod,
        review_year: reviewYear,
        include_org_kpis: includeOrgKpis,
      });

      setScanDetails(data.details || []);
      setOrgDetails(data.org_details || []);
      setPriorBatchWarning(data.prior_batch_warning || null);

      // Auto-select all zero-scorable
      const kpiIds = new Set<string>((data.details || []).filter((d: ScanDetailRow) => d.action === 'zero_scorable').map((d: ScanDetailRow) => d.kpi_id));
      setSelectedKpiIds(kpiIds);
      const orgIds = new Set<string>((data.org_details || []).map((d: OrgDetailRow) => d.org_kpi_id));
      setSelectedOrgIds(orgIds);

      toast({
        title: 'Scan complete',
        description: `Found ${kpiIds.size} zero-scorable KPIs${data.org_details?.length ? ` and ${data.org_details.length} Org KPIs` : ''}.`,
      });
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsScanning(false);
    }
  };

  const handleExecute = async () => {
    setShowConfirm(false);
    setConfirmText('');
    setIsExecuting(true);
    try {
      const data = await invokeAdminEdgeFunction<ExecuteResult>('bulk-zero-score-non-submitters', {
        mode: 'execute',
        review_period: reviewPeriod,
        review_year: reviewYear,
        kpi_ids: Array.from(selectedKpiIds),
        org_kpi_ids: includeOrgKpis ? Array.from(selectedOrgIds) : [],
        admin_remarks: adminRemarks,
      });
      setExecuteResult(data);
      setScanDetails(null);
      setOrgDetails([]);
      toast({
        title: 'Zero-scoring completed',
        description: `${data.zero_scored} KPIs zero-scored${data.org_zero_scored ? `, ${data.org_zero_scored} Org KPIs` : ''}. Batch: ${data.batch_id?.slice(0, 8)}`,
      });
    } catch (err: any) {
      toast({ title: 'Execution failed', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsExecuting(false);
    }
  };

  const toggleKpiId = (id: string) => {
    setSelectedKpiIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllKpis = () => {
    if (selectedKpiIds.size === zeroScorableRows.length) {
      setSelectedKpiIds(new Set());
    } else {
      setSelectedKpiIds(new Set(zeroScorableRows.map(r => r.kpi_id)));
    }
  };

  const toggleOrgId = (id: string) => {
    setSelectedOrgIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exportToExcel = (rows: any[], fileName: string, summary?: ExecuteResult) => {
    const wb = XLSX.utils.book_new();

    if (summary) {
      const summaryData = [
        ['Bulk Zero-Score Report'],
        ['Batch ID', summary.batch_id],
        ['Ran At', summary.ran_at],
        ['Period', `${reviewPeriod} ${reviewYear}`],
        ['KPIs Zero-Scored', summary.zero_scored],
        ['Org KPIs Zero-Scored', summary.org_zero_scored],
        ['Skipped', summary.skipped],
        ['Total Checked', summary.total_checked],
        ['Errors', summary.errors.length],
      ];
      const sumWs = XLSX.utils.aoa_to_sheet(summaryData);
      sumWs['!cols'] = [{ wch: 22 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, sumWs, 'Summary');
    }

    const detailSheet = rows.map((r: any) => ({
      Employee: r.employee_name || '',
      'KRA': r.kra_name || '',
      'KPI': r.kpi_name || '',
      Category: r.category || '',
      Period: r.review_period,
      Year: r.review_year,
      Status: r.current_status || r.action,
      Reason: REASON_LABELS[r.reason] || r.reason,
    }));
    const detWs = XLSX.utils.json_to_sheet(detailSheet);
    detWs['!cols'] = [{ wch: 22 }, { wch: 25 }, { wch: 35 }, { wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, detWs, 'Details');

    if (summary?.errors?.length) {
      const errData = summary.errors.map(e => ({ Error: e }));
      const errWs = XLSX.utils.json_to_sheet(errData);
      errWs['!cols'] = [{ wch: 80 }];
      XLSX.utils.book_append_sheet(wb, errWs, 'Errors');
    }

    XLSX.writeFile(wb, fileName);
  };

  const totalSelected = selectedKpiIds.size + (includeOrgKpis ? selectedOrgIds.size : 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ban className="h-5 w-5" />
          Bulk Zero-Score Non-Submitters
        </CardTitle>
        <CardDescription>
          Assign score 0 across all review levels for KPIs where employees have not submitted data on time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Instructions */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <p className="text-muted-foreground">
            <strong>Step 1:</strong> Select period and scan for non-submitters.{' '}
            <strong>Step 2:</strong> Review and select entries.{' '}
            <strong>Step 3:</strong> Type "ZERO" to confirm and apply zero scores across all levels.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Period</label>
            <Select value={reviewPeriod} onValueChange={setReviewPeriod}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ALL_MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Year</label>
            <Select value={String(reviewYear)} onValueChange={v => setReviewYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <Checkbox
              id="include-org"
              checked={includeOrgKpis}
              onCheckedChange={(v) => setIncludeOrgKpis(!!v)}
            />
            <label htmlFor="include-org" className="text-sm cursor-pointer">Include Org KPIs</label>
          </div>
          <Button onClick={handleScan} disabled={isScanning || isExecuting} variant="outline">
            {isScanning ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Scanning…</>
            ) : (
              <><Search className="h-4 w-4" /> Scan Non-Submitters</>
            )}
          </Button>
        </div>

        {/* Prior batch warning */}
        {priorBatchWarning && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-destructive shrink-0" />
            <span className="text-destructive">{priorBatchWarning}</span>
          </div>
        )}

        {/* Scan Results */}
        {scanDetails && scanDetails.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{scanDetails.length} found</Badge>
                <Badge variant="outline">{zeroScorableRows.length} zero-scorable</Badge>
                <Badge variant="outline">{selectedKpiIds.size} selected</Badge>
                {orgDetails.length > 0 && (
                  <Badge variant="outline">{selectedOrgIds.size} Org KPIs</Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    exportToExcel([...scanDetails, ...orgDetails], `ZeroScore_Scan_${ts}.xlsx`);
                  }}
                >
                  <Download className="h-4 w-4" /> Download Scan
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={totalSelected === 0 || isExecuting}
                  onClick={() => setShowConfirm(true)}
                >
                  <Ban className="h-4 w-4" /> Apply Zero Score ({totalSelected})
                </Button>
              </div>
            </div>

            {/* Admin remarks */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Remarks (visible in all review levels)</label>
              <Input
                value={adminRemarks}
                onChange={e => setAdminRemarks(e.target.value)}
                placeholder="Data not submitted by deadline"
                className="max-w-md"
              />
            </div>

            {/* KPI Table */}
            <div className="rounded-md border max-h-[400px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={zeroScorableRows.length > 0 && selectedKpiIds.size === zeroScorableRows.length}
                        onCheckedChange={toggleAllKpis}
                      />
                    </TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>KRA</TableHead>
                    <TableHead>KPI</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {scanDetails.map(row => (
                    <TableRow key={row.kpi_id} className={row.action === 'skippable' ? 'opacity-50' : ''}>
                      <TableCell>
                        {row.action === 'zero_scorable' ? (
                          <Checkbox checked={selectedKpiIds.has(row.kpi_id)} onCheckedChange={() => toggleKpiId(row.kpi_id)} />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{row.employee_name}</TableCell>
                      <TableCell className="text-sm max-w-[150px] truncate">{row.kra_name}</TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate">{row.kpi_name}</TableCell>
                      <TableCell>
                        <Badge variant={row.action === 'zero_scorable' ? 'destructive' : 'secondary'} className="text-xs">
                          {row.current_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{REASON_LABELS[row.reason] || row.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Org KPI Table */}
            {orgDetails.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Org KPIs — No Data Submitted</h4>
                <div className="rounded-md border max-h-[250px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={selectedOrgIds.size === orgDetails.length && orgDetails.length > 0}
                            onCheckedChange={() => {
                              if (selectedOrgIds.size === orgDetails.length) {
                                setSelectedOrgIds(new Set());
                              } else {
                                setSelectedOrgIds(new Set(orgDetails.map(d => d.org_kpi_id)));
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead>KRA</TableHead>
                        <TableHead>KPI</TableHead>
                        <TableHead>Value</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orgDetails.map(row => (
                        <TableRow key={row.org_kpi_id}>
                          <TableCell>
                            <Checkbox checked={selectedOrgIds.has(row.org_kpi_id)} onCheckedChange={() => toggleOrgId(row.org_kpi_id)} />
                          </TableCell>
                          <TableCell className="text-sm max-w-[150px] truncate">{row.kra_name}</TableCell>
                          <TableCell className="text-sm max-w-[180px] truncate">{row.kpi_name}</TableCell>
                          <TableCell className="text-sm">{row.current_value ?? '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{REASON_LABELS[row.reason] || row.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}

        {scanDetails && scanDetails.length === 0 && (
          <div className="flex items-center gap-2 p-4 rounded-lg border text-sm">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span>No non-submitters found for {reviewPeriod} {reviewYear}. All employees have submitted!</span>
          </div>
        )}

        {/* Execute Results */}
        {executeResult && (
          <div className="rounded-lg border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span className="font-medium text-sm">Zero-Score Results</span>
                <Badge variant="outline" className="text-xs font-mono">Batch: {executeResult.batch_id.slice(0, 8)}</Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                  exportToExcel(executeResult.details, `ZeroScore_Report_${ts}.xlsx`, executeResult);
                }}
              >
                <Download className="h-4 w-4" /> Download Report
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="text-center p-2 rounded bg-muted/50">
                <div className="text-lg font-bold">{executeResult.zero_scored}</div>
                <div className="text-xs text-muted-foreground">KPIs Zero-Scored</div>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <div className="text-lg font-bold">{executeResult.org_zero_scored}</div>
                <div className="text-xs text-muted-foreground">Org KPIs</div>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <div className="text-lg font-bold">{executeResult.skipped}</div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
              <div className="text-center p-2 rounded bg-muted/50">
                <div className="text-lg font-bold">{executeResult.total_checked}</div>
                <div className="text-xs text-muted-foreground">Total Checked</div>
              </div>
            </div>

            {executeResult.details.length > 0 && (
              <div className="rounded-md border max-h-[300px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>KPI</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {executeResult.details.map((row: any) => (
                      <TableRow key={row.kpi_id}>
                        <TableCell className="text-sm">{row.employee_name}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate">{row.kpi_name}</TableCell>
                        <TableCell>
                          <Badge
                            variant={row.action === 'zero_scored' ? 'default' : row.action === 'error' ? 'destructive' : 'secondary'}
                            className="text-xs"
                          >
                            {row.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{REASON_LABELS[row.reason] || row.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {executeResult.verification && (
              <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30 p-3 space-y-2">
                <span className="text-sm font-medium">Post-Execution Verification</span>
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-2 rounded bg-background">
                    <div className="text-lg font-bold">{executeResult.verification.kpis_at_approved}</div>
                    <div className="text-xs text-muted-foreground">KPIs → Approved ✓</div>
                  </div>
                  <div className="text-center p-2 rounded bg-background">
                    <div className="text-lg font-bold">{executeResult.verification.submissions_with_zero}</div>
                    <div className="text-xs text-muted-foreground">Submissions = 0 ✓</div>
                  </div>
                  <div className="text-center p-2 rounded bg-background">
                    <div className="text-lg font-bold">{executeResult.verification.checked}</div>
                    <div className="text-xs text-muted-foreground">Verified</div>
                  </div>
                </div>
              </div>
            )}

            {executeResult.errors.length > 0 && (
              <div className="space-y-1">
                <span className="text-xs font-medium text-destructive">Errors ({executeResult.errors.length}):</span>
                {executeResult.errors.map((e, i) => (
                  <p key={i} className="text-xs text-destructive/80 font-mono">{e}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Elevated Confirmation Dialog */}
        <AlertDialog open={showConfirm} onOpenChange={(v) => { if (!v) { setShowConfirm(false); setConfirmText(''); } }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Zero-Score {totalSelected} item(s)?</AlertDialogTitle>
              <AlertDialogDescription>
                This will set score 0 across ALL review levels for {selectedKpiIds.size} KPI(s)
                {selectedOrgIds.size > 0 ? ` and ${selectedOrgIds.size} Org KPI(s)` : ''} in {reviewPeriod} {reviewYear}.
                Status will advance to "Approved". This action is IRREVERSIBLE.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2 py-2">
              <label className="text-sm font-medium">
                Type <span className="font-mono font-bold text-destructive">ZERO</span> to confirm:
              </label>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value.toUpperCase())}
                placeholder="ZERO"
                className="max-w-[200px]"
                autoFocus
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isExecuting} onClick={() => { setShowConfirm(false); setConfirmText(''); }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleExecute}
                disabled={confirmText !== 'ZERO' || isExecuting}
                className={cn(buttonVariants({ variant: 'destructive' }))}
              >
                {isExecuting ? 'Processing…' : 'Apply Zero Score'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
