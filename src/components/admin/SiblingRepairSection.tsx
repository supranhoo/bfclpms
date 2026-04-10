import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { AlertCircle, CheckCircle2, ChevronDown, Download, RefreshCw, Search, Wrench } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface SiblingDetailRow {
  kpi_id: string;
  kpi_name: string;
  kra_name: string;
  employee_id: string;
  employee_name: string;
  category: string;
  review_period: string;
  review_year: number;
  terminal_period: string | null;
  terminal_year: number | null;
  terminal_score: number | null;
  terminal_rating: string | null;
  recovery_type: 'same_year' | 'cross_year' | 'audit_log' | null;
  action: 'repairable' | 'skippable' | 'repaired' | 'error';
  reason: string;
}

interface SiblingRepairResult {
  mode: 'scan' | 'repair';
  repaired: number;
  skipped: number;
  total_checked: number;
  errors: string[];
  details: SiblingDetailRow[];
  ran_at: string;
  verification?: {
    kpis_verified: number;
    submissions_verified: number;
    remaining_stuck: number;
  } | null;
}

const REASON_LABELS: Record<string, string> = {
  no_cycle_match: 'No cycle match found',
  is_terminal_month: 'Is terminal month (genuinely pending)',
  terminal_not_approved: 'Terminal month not yet approved',
  terminal_no_final_score: 'Terminal has no final score',
  same_year_terminal_recoverable: 'Recoverable — same-year terminal approved',
  cross_year_terminal_recoverable: 'Recoverable — cross-year terminal approved',
  audit_log_recoverable: 'Recoverable — prior approved journey in audit log',
  audit_data_insufficient: 'Audit log has insufficient data to reconstruct',
  sibling_recoverable: 'Recoverable — terminal sibling approved',
  sibling_re_percolated: 'Score re-percolated from terminal',
  audit_log_restored: 'Restored from audit log data',
};

export function SiblingRepairSection() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [scanResults, setScanResults] = useState<SiblingDetailRow[] | null>(null);
  const [repairResults, setRepairResults] = useState<SiblingRepairResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);

  const repairableRows = useMemo(
    () => scanResults?.filter(r => r.action === 'repairable') ?? [],
    [scanResults]
  );

  const crossYearCount = useMemo(
    () => repairableRows.filter(r => r.recovery_type === 'cross_year').length,
    [repairableRows]
  );

  const auditLogCount = useMemo(
    () => repairableRows.filter(r => r.recovery_type === 'audit_log').length,
    [repairableRows]
  );

  const handleScan = async () => {
    setIsScanning(true);
    setScanResults(null);
    setRepairResults(null);
    setSelectedIds(new Set());
    try {
      const { data, error } = await supabase.functions.invoke('repair-stepped-back-siblings', {
        body: { mode: 'scan', limit: 1500 },
      });
      if (error) throw error;
      const result = data as SiblingRepairResult;
      setScanResults(result.details || []);
      const repairableIds = new Set(
        (result.details || []).filter((d: SiblingDetailRow) => d.action === 'repairable').map((d: SiblingDetailRow) => d.kpi_id)
      );
      setSelectedIds(repairableIds);
      toast({
        title: 'Sibling scan complete',
        description: `Found ${repairableIds.size} recoverable and ${(result.details || []).length - repairableIds.size} skippable KPIs.`,
      });
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsScanning(false);
    }
  };

  const handleRepairSelected = async () => {
    setShowConfirm(false);
    setIsRepairing(true);
    try {
      const ids = Array.from(selectedIds);
      const { data, error } = await supabase.functions.invoke('repair-stepped-back-siblings', {
        body: { mode: 'repair', kpi_ids: ids, limit: 1500 },
      });
      if (error) throw error;
      const result = data as SiblingRepairResult;
      setRepairResults(result);
      setScanResults(null);
      toast({
        title: 'Sibling repair completed',
        description: `Repaired: ${result.repaired}, Skipped: ${result.skipped}`,
      });
    } catch (err: any) {
      toast({ title: 'Repair failed', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setIsRepairing(false);
    }
  };

  const toggleId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === repairableRows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(repairableRows.map(r => r.kpi_id)));
    }
  };

  const exportToExcel = (rows: SiblingDetailRow[], fileName: string, summary?: SiblingRepairResult) => {
    const detailSheet = rows.map(r => ({
      'Employee': r.employee_name,
      'Category': r.category,
      'KRA': r.kra_name,
      'KPI': r.kpi_name,
      'Period': r.review_period,
      'Year': r.review_year,
      'Terminal Period': r.terminal_period ?? '',
      'Terminal Year': r.terminal_year ?? '',
      'Terminal Score': r.terminal_score ?? '',
      'Terminal Rating': r.terminal_rating ?? '',
      'Recovery Type': r.recovery_type === 'cross_year' ? 'Cross-Year' : r.recovery_type === 'same_year' ? 'Same-Year' : r.recovery_type === 'audit_log' ? 'Audit Log' : '',
      'Status': r.action,
      'Reason': REASON_LABELS[r.reason] || r.reason,
    }));

    const wb = XLSX.utils.book_new();

    if (summary) {
      const summaryData = [
        ['Sibling Repair Report'],
        ['Ran At', summary.ran_at],
        ['Total Checked', summary.total_checked],
        ['Repaired', summary.repaired],
        ['Skipped', summary.skipped],
        ['Errors', summary.errors.length],
      ];
      const sumWs = XLSX.utils.aoa_to_sheet(summaryData);
      sumWs['!cols'] = [{ wch: 20 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, sumWs, 'Summary');
    }

    const detWs = XLSX.utils.json_to_sheet(detailSheet);
    detWs['!cols'] = [
      { wch: 22 }, { wch: 18 }, { wch: 25 }, { wch: 35 },
      { wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 8 },
      { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 35 },
    ];
    XLSX.utils.book_append_sheet(wb, detWs, 'Details');

    if (summary && summary.errors.length > 0) {
      const errData = summary.errors.map(e => {
        const [id, ...msg] = e.split(': ');
        return { 'KPI ID': id, 'Error': msg.join(': ') };
      });
      const errWs = XLSX.utils.json_to_sheet(errData);
      errWs['!cols'] = [{ wch: 40 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, errWs, 'Errors');
    }

    XLSX.writeFile(wb, fileName);
  };

  return (
    <Card>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CardHeader className="cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between w-full">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Wrench className="h-5 w-5" />
                  Repair Stepped-Back Siblings
                </CardTitle>
                <CardDescription className="mt-1">
                  Recover multi-month KPIs stuck at "KRA Set" after bulk step-back, including cross-year cycles (e.g. Dec 2025 → Jan 2026).
                </CardDescription>
              </div>
              <ChevronDown className={`h-5 w-5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              <p className="text-muted-foreground">
                <strong>Step 1:</strong> Scan for non-terminal multi-month KPIs at "KRA Set" whose terminal month is approved (same-year and cross-year).{' '}
                <strong>Step 2:</strong> Review and select entries.{' '}
                <strong>Step 3:</strong> Re-percolate scores from terminal siblings.
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleScan} disabled={isScanning || isRepairing} variant="outline">
                {isScanning ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" /> Scanning…</>
                ) : (
                  <><Search className="h-4 w-4" /> Scan for Stuck Siblings</>
                )}
              </Button>
            </div>

            {/* Scan Results Table */}
            {scanResults && scanResults.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">{scanResults.length} found</Badge>
                    <Badge variant="outline">{repairableRows.length} recoverable</Badge>
                    {crossYearCount > 0 && (
                      <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-400">
                        {crossYearCount} cross-year
                      </Badge>
                    )}
                    {auditLogCount > 0 && (
                      <Badge variant="outline" className="border-purple-400 text-purple-700 dark:text-purple-400">
                        {auditLogCount} audit-log
                      </Badge>
                    )}
                    <Badge variant="outline">{selectedIds.size} selected</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                        exportToExcel(scanResults, `Sibling_Scan_${ts}.xlsx`);
                      }}
                    >
                      <Download className="h-4 w-4" /> Download Scan
                    </Button>
                    <Button
                      size="sm"
                      disabled={selectedIds.size === 0 || isRepairing}
                      onClick={() => setShowConfirm(true)}
                    >
                      <Wrench className="h-4 w-4" /> Repair Selected ({selectedIds.size})
                    </Button>
                  </div>
                </div>

                <div className="rounded-md border max-h-[500px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={repairableRows.length > 0 && selectedIds.size === repairableRows.length}
                            onCheckedChange={toggleAll}
                          />
                        </TableHead>
                        <TableHead>Employee</TableHead>
                        <TableHead>KPI</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Terminal</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scanResults.map(row => (
                        <TableRow key={row.kpi_id} className={row.action === 'skippable' ? 'opacity-60' : ''}>
                          <TableCell>
                            {row.action === 'repairable' ? (
                              <Checkbox
                                checked={selectedIds.has(row.kpi_id)}
                                onCheckedChange={() => toggleId(row.kpi_id)}
                              />
                            ) : (
                              <span className="text-muted-foreground text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{row.employee_name}</TableCell>
                          <TableCell className="text-sm max-w-[180px] truncate">{row.kpi_name}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{row.review_period} {row.review_year}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {row.terminal_period ? `${row.terminal_period} ${row.terminal_year ?? ''}` : '—'}
                          </TableCell>
                          <TableCell className="text-sm">{row.terminal_score ?? '—'}</TableCell>
                          <TableCell>
                            {row.recovery_type === 'cross_year' ? (
                              <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 dark:text-amber-400">Cross-Year</Badge>
                            ) : row.recovery_type === 'audit_log' ? (
                              <Badge variant="outline" className="text-xs border-purple-400 text-purple-700 dark:text-purple-400">Audit Log</Badge>
                            ) : row.recovery_type === 'same_year' ? (
                              <Badge variant="outline" className="text-xs">Same-Year</Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={row.action === 'repairable' ? 'default' : 'secondary'} className="text-xs">
                              {row.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{REASON_LABELS[row.reason] || row.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {scanResults && scanResults.length === 0 && (
              <div className="flex items-center gap-2 p-4 rounded-lg border text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>No stuck siblings found. All multi-month KPIs are consistent.</span>
              </div>
            )}

            {/* Repair Results */}
            {repairResults && (
              <div className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="font-medium text-sm">Sibling Repair Results</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                      exportToExcel(repairResults.details, `Sibling_Repair_${ts}.xlsx`, repairResults);
                    }}
                  >
                    <Download className="h-4 w-4" /> Download Report
                  </Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="text-center p-2 rounded bg-muted/50">
                    <div className="text-lg font-bold">{repairResults.repaired}</div>
                    <div className="text-xs text-muted-foreground">Re-percolated</div>
                  </div>
                  <div className="text-center p-2 rounded bg-muted/50">
                    <div className="text-lg font-bold">{repairResults.skipped}</div>
                    <div className="text-xs text-muted-foreground">Skipped</div>
                  </div>
                  <div className="text-center p-2 rounded bg-muted/50">
                    <div className="text-lg font-bold">{repairResults.total_checked}</div>
                    <div className="text-xs text-muted-foreground">Checked</div>
                  </div>
                </div>

                {repairResults.details.length > 0 && (
                  <div className="rounded-md border max-h-[400px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employee</TableHead>
                          <TableHead>KPI</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead>Terminal</TableHead>
                          <TableHead>Score</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Reason</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {repairResults.details.map(row => (
                          <TableRow key={row.kpi_id}>
                            <TableCell className="text-sm">{row.employee_name}</TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate">{row.kpi_name}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{row.review_period} {row.review_year}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {row.terminal_period ? `${row.terminal_period} ${row.terminal_year ?? ''}` : '—'}
                            </TableCell>
                            <TableCell className="text-sm">{row.terminal_score ?? '—'}</TableCell>
                            <TableCell>
                              {row.recovery_type === 'cross_year' ? (
                                <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 dark:text-amber-400">Cross-Year</Badge>
                              ) : row.recovery_type === 'audit_log' ? (
                                <Badge variant="outline" className="text-xs border-purple-400 text-purple-700 dark:text-purple-400">Audit Log</Badge>
                              ) : row.recovery_type === 'same_year' ? (
                                <Badge variant="outline" className="text-xs">Same-Year</Badge>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={row.action === 'repaired' ? 'default' : row.action === 'error' ? 'destructive' : 'secondary'}
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

                {repairResults.verification && (
                  <div className="rounded-lg border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30 p-3 space-y-2">
                    <span className="text-sm font-medium">Post-Repair Verification</span>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="text-center p-2 rounded bg-background">
                        <div className="text-lg font-bold">{repairResults.verification.kpis_verified}</div>
                        <div className="text-xs text-muted-foreground">KPIs → Approved ✓</div>
                      </div>
                      <div className="text-center p-2 rounded bg-background">
                        <div className="text-lg font-bold">{repairResults.verification.submissions_verified}</div>
                        <div className="text-xs text-muted-foreground">Submissions Created ✓</div>
                      </div>
                      <div className="text-center p-2 rounded bg-background">
                        <div className="text-lg font-bold">{repairResults.verification.remaining_stuck}</div>
                        <div className="text-xs text-muted-foreground">Still Stuck</div>
                      </div>
                    </div>
                  </div>
                )}

                {repairResults.errors.length > 0 && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
                    <span className="text-sm font-medium text-destructive">Errors ({repairResults.errors.length})</span>
                    <ul className="mt-1 text-xs text-muted-foreground list-disc list-inside">
                      {repairResults.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>

      <ConfirmDestructiveDialog
        open={showConfirm}
        onConfirm={handleRepairSelected}
        onCancel={() => setShowConfirm(false)}
        title={`Re-percolate ${selectedIds.size} sibling KPIs?`}
        description="This will copy terminal sibling scores to the selected KPIs and advance them to 'approved'. This action is logged but cannot be automatically reversed."
        confirmLabel="Re-percolate Selected"
        isLoading={isRepairing}
      />
    </Card>
  );
}
