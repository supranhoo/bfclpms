import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { AlertCircle, CheckCircle2, Download, RefreshCw, Search, Wrench, Database, ArrowRight } from 'lucide-react';
import { SiblingRepairSection } from './SiblingRepairSection';
import { BulkZeroScoreSection } from './BulkZeroScoreSection';
import { LateJoinerBackfillSection } from './LateJoinerBackfillSection';
import { OrgKpiInheritanceReconciler } from './OrgKpiInheritanceReconciler';
import { OrgKpiCycleAnchorRepair } from './OrgKpiCycleAnchorRepair';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface DetailRow {
  kpi_id: string;
  kpi_name: string;
  kra_name: string;
  employee_id: string;
  employee_name: string;
  category: string;
  review_period: string;
  review_year: number;
  achieved_value: number | null;
  self_score: number | null;
  self_rating: string | null;
  action: 'repairable' | 'skippable' | 'repaired' | 'error';
  reason: string;
}

interface Verification {
  kpis_verified: number;
  submissions_verified: number;
  remaining_orphans: number;
}

interface RepairResult {
  mode:
    | 'scan'
    | 'repair'
    | 'scan_stuck'
    | 'repair_stuck'
    | 'scan_propagation_failures'
    | 'repair_propagation_failures';
  repaired: number;
  null_values_fixed: number;
  skipped: number;
  total_checked: number;
  errors: string[];
  details: DetailRow[];
  ran_at: string;
  message?: string;
  verification?: Verification | null;
}

const REASON_LABELS: Record<string, string> = {
  submission_exists: 'Submission already exists',
  no_org_value: 'No org KPI value found',
  no_matching_value: 'No matching value for employee',
  null_achieved_value: 'Achieved value is NULL',
  missing_submission: 'Missing submission — repairable',
  submission_created: 'Submission created successfully',
  propagation_failure_zero_advance: 'Propagated but 0 employees advanced — Bucket F',
  okv_reset_to_draft: 'OKV reset to draft — DO can re-propagate',
  no_matching_kpis: 'No matching employee KPIs (orphaned definition)',
  partial_advance_healthy: 'Some employees advanced — not a failure',
};

export function DataRepairTab() {
  const [isScanning, setIsScanning] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [scanResults, setScanResults] = useState<DetailRow[] | null>(null);
  const [repairResults, setRepairResults] = useState<RepairResult | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  // Status-Stuck repair state (separate pass — kpis stuck at 'kra_set' even though submission exists)
  const [stuckScanning, setStuckScanning] = useState(false);
  const [stuckRepairing, setStuckRepairing] = useState(false);
  const [stuckResults, setStuckResults] = useState<RepairResult | null>(null);
  const [showStuckConfirm, setShowStuckConfirm] = useState(false);
  // Bucket F — Propagation Failures (OKV propagated but 0 employees advanced)
  const [pfScanning, setPfScanning] = useState(false);
  const [pfRepairing, setPfRepairing] = useState(false);
  const [pfResults, setPfResults] = useState<RepairResult | null>(null);
  const [showPfConfirm, setShowPfConfirm] = useState(false);

  const repairableRows = useMemo(
    () => scanResults?.filter(r => r.action === 'repairable') ?? [],
    [scanResults]
  );

  const stuckRepairableCount = useMemo(
    () => stuckResults?.details?.filter(r => r.action === 'repairable').length ?? 0,
    [stuckResults]
  );

  const pfRepairableCount = useMemo(
    () => pfResults?.details?.filter(r => r.action === 'repairable').length ?? 0,
    [pfResults]
  );

  const handleStuckScan = async () => {
    setStuckScanning(true);
    setStuckResults(null);
    try {
      const { data, error } = await supabase.functions.invoke('repair-orphaned-propagations', {
        body: { mode: 'scan_stuck', limit: 1500 },
      });
      if (error) throw error;
      const result = data as RepairResult;
      setStuckResults(result);
      toast({
        title: 'Status-Stuck scan complete',
        description: `Found ${result.details?.filter(d => d.action === 'repairable').length ?? 0} status-stuck KPI(s) ready to repair.`,
      });
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setStuckScanning(false);
    }
  };

  const handleStuckRepair = async () => {
    setShowStuckConfirm(false);
    setStuckRepairing(true);
    try {
      const { data, error } = await supabase.functions.invoke('repair-orphaned-propagations', {
        body: { mode: 'repair_stuck', limit: 1500 },
      });
      if (error) throw error;
      const result = data as RepairResult;
      setStuckResults(result);
      toast({
        title: 'Status-Stuck repair complete',
        description: `Advanced ${result.repaired} KPI(s) from "KRA Set" to "Self Review".`,
      });
    } catch (err: any) {
      toast({ title: 'Repair failed', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setStuckRepairing(false);
    }
  };

  const handlePfScan = async () => {
    setPfScanning(true);
    setPfResults(null);
    try {
      const { data, error } = await supabase.functions.invoke('repair-orphaned-propagations', {
        body: { mode: 'scan_propagation_failures', limit: 1500 },
      });
      if (error) throw error;
      const result = data as RepairResult;
      setPfResults(result);
      const found = result.details?.filter(d => d.action === 'repairable').length ?? 0;
      toast({
        title: 'Propagation-failure scan complete',
        description: `Found ${found} OKV definition(s) where Propagate ran but 0 employees advanced.`,
      });
    } catch (err: any) {
      toast({ title: 'Scan failed', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setPfScanning(false);
    }
  };

  const handlePfRepair = async () => {
    setShowPfConfirm(false);
    setPfRepairing(true);
    try {
      const repairableIds = (pfResults?.details ?? [])
        .filter(d => d.action === 'repairable')
        .map(d => d.kpi_id);
      const { data, error } = await supabase.functions.invoke('repair-orphaned-propagations', {
        body: { mode: 'repair_propagation_failures', okv_ids: repairableIds, limit: 1500 },
      });
      if (error) throw error;
      const result = data as RepairResult;
      setPfResults(result);
      toast({
        title: 'Propagation-failure repair complete',
        description: `Reset ${result.repaired} OKV definition(s) back to draft.`,
      });
    } catch (err: any) {
      toast({ title: 'Repair failed', description: err.message || 'Unknown error', variant: 'destructive' });
    } finally {
      setPfRepairing(false);
    }
  };

  const handleScan = async () => {
    setIsScanning(true);
    setScanResults(null);
    setRepairResults(null);
    setSelectedIds(new Set());
    try {
      const { data, error } = await supabase.functions.invoke('repair-orphaned-propagations', {
        body: { mode: 'scan', limit: 1500 },
      });
      if (error) throw error;
      const result = data as RepairResult;
      setScanResults(result.details || []);
      const repairableIds = new Set(
        (result.details || []).filter((d: DetailRow) => d.action === 'repairable').map((d: DetailRow) => d.kpi_id)
      );
      setSelectedIds(repairableIds);
      toast({
        title: 'Scan complete',
        description: `Found ${repairableIds.size} repairable and ${(result.details || []).length - repairableIds.size} skippable KPIs.`,
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
      const { data, error } = await supabase.functions.invoke('repair-orphaned-propagations', {
        body: { mode: 'repair', kpi_ids: ids, limit: 1500, fix_null_values: true },
      });
      if (error) throw error;
      const result = data as RepairResult;
      setRepairResults(result);
      setScanResults(null);
      toast({
        title: 'Repair completed',
        description: `Repaired: ${result.repaired}, Skipped: ${result.skipped}, NULL fixed: ${result.null_values_fixed}`,
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

  const exportToExcel = (rows: DetailRow[], fileName: string, summary?: RepairResult) => {
    const detailSheet = rows.map(r => ({
      'Employee': r.employee_name,
      'Category': r.category,
      'KRA': r.kra_name,
      'KPI': r.kpi_name,
      'Period': r.review_period,
      'Year': r.review_year,
      'Achieved': r.achieved_value ?? '',
      'Score': r.self_score ?? '',
      'Rating': r.self_rating ?? '',
      'Status': r.action,
      'Reason': REASON_LABELS[r.reason] || r.reason,
    }));

    const wb = XLSX.utils.book_new();

    if (summary) {
      const summaryData = [
        ['Repair Report'],
        ['Ran At', summary.ran_at],
        ['Total Checked', summary.total_checked],
        ['Repaired', summary.repaired],
        ['Skipped', summary.skipped],
        ['NULL Values Fixed', summary.null_values_fixed],
        ['Errors', summary.errors.length],
      ];
      const sumWs = XLSX.utils.aoa_to_sheet(summaryData);
      sumWs['!cols'] = [{ wch: 20 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, sumWs, 'Summary');
    }

    const detWs = XLSX.utils.json_to_sheet(detailSheet);
    detWs['!cols'] = [
      { wch: 22 }, { wch: 18 }, { wch: 25 }, { wch: 35 },
      { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 8 },
      { wch: 8 }, { wch: 12 }, { wch: 30 },
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Repair Orphaned Propagations
          </CardTitle>
          <CardDescription>
            Scan for org-level KPIs stuck at "KRA Set" with no review submission, then select which ones to repair.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <p className="text-muted-foreground">
              <strong>Step 1:</strong> Scan to preview orphaned KPIs.{' '}
              <strong>Step 2:</strong> Review and select entries.{' '}
              <strong>Step 3:</strong> Repair selected entries with confirmation.
            </p>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleScan} disabled={isScanning || isRepairing} variant="outline">
              {isScanning ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Scanning…</>
              ) : (
                <><Search className="h-4 w-4" /> Scan for Orphaned KPIs</>
              )}
            </Button>
          </div>

          {/* Scan Results Table */}
          {scanResults && scanResults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{scanResults.length} found</Badge>
                  <Badge variant="outline">{repairableRows.length} repairable</Badge>
                  <Badge variant="outline">{selectedIds.size} selected</Badge>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                      exportToExcel(scanResults, `Scan_Report_${ts}.xlsx`);
                    }}
                  >
                    <Download className="h-4 w-4" /> Download Scan Report
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
                      <TableHead>KRA</TableHead>
                      <TableHead>KPI</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Achieved</TableHead>
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
                        <TableCell className="text-sm max-w-[150px] truncate">{row.kra_name}</TableCell>
                        <TableCell className="text-sm max-w-[180px] truncate">{row.kpi_name}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{row.review_period} {row.review_year}</TableCell>
                        <TableCell className="text-sm">{row.achieved_value ?? '—'}</TableCell>
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
              <span>No orphaned KPIs found. Everything looks good!</span>
            </div>
          )}

          {/* Repair Results */}
          {repairResults && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-sm">Repair Results</span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                    exportToExcel(repairResults.details, `Repair_Report_${ts}.xlsx`, repairResults);
                  }}
                >
                  <Download className="h-4 w-4" /> Download Repair Report
                </Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="text-center p-2 rounded bg-muted/50">
                  <div className="text-lg font-bold">{repairResults.repaired}</div>
                  <div className="text-xs text-muted-foreground">Repaired</div>
                </div>
                <div className="text-center p-2 rounded bg-muted/50">
                  <div className="text-lg font-bold">{repairResults.null_values_fixed}</div>
                  <div className="text-xs text-muted-foreground">NULL Fixed</div>
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
                        <TableHead>Achieved</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {repairResults.details.map(row => (
                        <TableRow key={row.kpi_id}>
                          <TableCell className="text-sm">{row.employee_name}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{row.kpi_name}</TableCell>
                          <TableCell className="text-sm">{row.achieved_value ?? '—'}</TableCell>
                          <TableCell className="text-sm">{row.self_score ?? '—'}</TableCell>
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
                      <div className="text-xs text-muted-foreground">KPIs → Self Review ✓</div>
                    </div>
                    <div className="text-center p-2 rounded bg-background">
                      <div className="text-lg font-bold">{repairResults.verification.submissions_verified}</div>
                      <div className="text-xs text-muted-foreground">Submissions Created ✓</div>
                    </div>
                    <div className="text-center p-2 rounded bg-background">
                      <div className="text-lg font-bold">{repairResults.verification.remaining_orphans}</div>
                      <div className="text-xs text-muted-foreground">Remaining Orphans</div>
                    </div>
                  </div>
                  {repairResults.verification.kpis_verified < repairResults.repaired && (
                    <p className="text-xs text-amber-600">
                      ⚠ {repairResults.repaired - repairResults.verification.kpis_verified} KPI(s) did not advance to Self Review — investigate manually.
                    </p>
                  )}
                </div>
              )}

              {repairResults.errors.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-destructive">Errors ({repairResults.errors.length}):</span>
                  {repairResults.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive/80 font-mono">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <SiblingRepairSection />

      <BulkZeroScoreSection />

      {/* Status-Stuck Org KPIs (Part 2 — second bug variant) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Repair Status-Stuck Org KPIs
          </CardTitle>
          <CardDescription>
            Org KPIs stuck at "KRA Set" even though a self-review submission exists. Single column update — advances <code>kpis.status</code> from <code>kra_set</code> → <code>self_review</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handleStuckScan} disabled={stuckScanning || stuckRepairing} variant="outline">
              {stuckScanning ? <><RefreshCw className="h-4 w-4 animate-spin" /> Scanning…</> : <><Search className="h-4 w-4" /> Scan Status-Stuck</>}
            </Button>
            {stuckResults && stuckRepairableCount > 0 && (
              <Button onClick={() => setShowStuckConfirm(true)} disabled={stuckRepairing}>
                <Wrench className="h-4 w-4" /> Repair {stuckRepairableCount} Stuck KPI(s)
              </Button>
            )}
          </div>

          {stuckResults && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{stuckResults.total_checked} checked</Badge>
                <Badge variant="outline">{stuckRepairableCount} repairable</Badge>
                {stuckResults.repaired > 0 && stuckResults.mode === 'repair_stuck' && (
                  <Badge>{stuckResults.repaired} repaired</Badge>
                )}
                <Badge variant="secondary">{stuckResults.skipped} skipped</Badge>
              </div>
              {stuckResults.details.length > 0 && (
                <div className="rounded-md border max-h-[320px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>KPI</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stuckResults.details.map(row => (
                        <TableRow key={row.kpi_id} className={row.action === 'skippable' ? 'opacity-60' : ''}>
                          <TableCell className="text-sm">{row.employee_name}</TableCell>
                          <TableCell className="text-sm max-w-[220px] truncate">{row.kpi_name}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{row.review_period} {row.review_year}</TableCell>
                          <TableCell className="text-sm">{row.self_score ?? '—'}</TableCell>
                          <TableCell>
                            <Badge
                              variant={row.action === 'repaired' ? 'default' : row.action === 'error' ? 'destructive' : row.action === 'repairable' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {row.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {stuckResults.errors.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-destructive">Errors ({stuckResults.errors.length}):</span>
                  {stuckResults.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive/80 font-mono">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* One-time Employee Master Backfill — recover historically-missed profiles */}
      <Card className="border-2 border-primary/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Employee Master Backfill (One-time)
          </CardTitle>
          <CardDescription>
            Re-upload your employee master file to recover profiles that were silently dropped by past imports. <strong>Insert-only · idempotent · admin-only.</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link to="/admin/employee-master-backfill">
              Open Backfill Tool <ArrowRight className="h-4 w-4 ml-1.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Bucket F — Propagation Failures (OKV propagated, 0 employees advanced) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Repair Propagation Failures (Bucket F)
          </CardTitle>
          <CardDescription>
            Org KPI definitions marked as <code>propagated</code> where the per-employee loop silently failed —
            zero matching employees advanced past <code>kra_set</code>. Repair resets <code>org_kpi_values.status</code>
            back to <code>draft</code> so the Data Owner can re-run Propagate.
            <br />
            <strong className="text-amber-600">Note:</strong> until the RPC patch (roadmap Step 3) ships,
            re-propagation may re-trigger the bug. Use this scan after each propagation cycle until the patch lands.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button onClick={handlePfScan} disabled={pfScanning || pfRepairing} variant="outline">
              {pfScanning ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> Scanning…</>
              ) : (
                <><Search className="h-4 w-4" /> Scan Propagation Failures</>
              )}
            </Button>
            {pfResults && pfRepairableCount > 0 && (
              <Button onClick={() => setShowPfConfirm(true)} disabled={pfRepairing}>
                <Wrench className="h-4 w-4" /> Reset {pfRepairableCount} OKV Definition(s)
              </Button>
            )}
          </div>

          {pfResults && (
            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{pfResults.total_checked} OKV checked</Badge>
                <Badge variant="outline">{pfRepairableCount} failed propagations</Badge>
                {pfResults.repaired > 0 && pfResults.mode === 'repair_propagation_failures' && (
                  <Badge>{pfResults.repaired} reset to draft</Badge>
                )}
                <Badge variant="secondary">{pfResults.skipped} skipped</Badge>
              </div>
              {pfResults.details.length > 0 && (
                <div className="rounded-md border max-h-[320px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead>KRA</TableHead>
                        <TableHead>KPI</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Achieved</TableHead>
                        <TableHead>Detection</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pfResults.details.map(row => (
                        <TableRow key={row.kpi_id} className={row.action === 'skippable' ? 'opacity-60' : ''}>
                          <TableCell className="text-sm max-w-[140px] truncate">{row.category}</TableCell>
                          <TableCell className="text-sm max-w-[160px] truncate">{row.kra_name}</TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate">{row.kpi_name}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">{row.review_period} {row.review_year}</TableCell>
                          <TableCell className="text-sm">{row.achieved_value ?? '—'}</TableCell>
                          <TableCell className="text-xs">{row.employee_name}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                row.action === 'repaired'
                                  ? 'default'
                                  : row.action === 'error'
                                  ? 'destructive'
                                  : row.action === 'repairable'
                                  ? 'default'
                                  : 'secondary'
                              }
                              className="text-xs"
                            >
                              {row.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {REASON_LABELS[row.reason] || row.reason}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {pfResults.errors.length > 0 && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-destructive">Errors ({pfResults.errors.length}):</span>
                  {pfResults.errors.map((e, i) => (
                    <p key={i} className="text-xs text-destructive/80 font-mono">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bucket K — Late-Joiner Auto-Pull (Phase B2) */}
      <LateJoinerBackfillSection />

      {/* v2.66.6 — Org KPI Inheritance Reconciler */}
      <OrgKpiInheritanceReconciler />

      {/* v2.66.7.2 — Org KPI Cycle Anchor Repair */}
      <OrgKpiCycleAnchorRepair />

      <ConfirmDestructiveDialog
        open={showConfirm}
        onConfirm={handleRepairSelected}
        onCancel={() => setShowConfirm(false)}
        title={`Repair ${selectedIds.size} KPI(s)?`}
        description={`This will create missing review submissions and advance ${selectedIds.size} KPI(s) from "KRA Set" to "Self Review". This action cannot be undone.`}
        confirmLabel="Repair Selected"
        isLoading={isRepairing}
      />

      <ConfirmDestructiveDialog
        open={showStuckConfirm}
        onConfirm={handleStuckRepair}
        onCancel={() => setShowStuckConfirm(false)}
        title={`Repair ${stuckRepairableCount} status-stuck KPI(s)?`}
        description={`This will advance ${stuckRepairableCount} KPI(s) from "KRA Set" to "Self Review" where a self-review submission already exists. This action cannot be undone.`}
        confirmLabel="Repair Stuck"
        isLoading={stuckRepairing}
      />

      <ConfirmDestructiveDialog
        open={showPfConfirm}
        onConfirm={handlePfRepair}
        onCancel={() => setShowPfConfirm(false)}
        title={`Reset ${pfRepairableCount} OKV definition(s) to draft?`}
        description={`This will reset ${pfRepairableCount} org_kpi_values row(s) from "propagated" back to "draft" so the Data Owner can re-run Propagate. Audit logs are written to every affected employee KPI. This action is reversible by manually re-running Propagate.`}
        confirmLabel="Reset to Draft"
        isLoading={pfRepairing}
      />
    </div>
  );
}
