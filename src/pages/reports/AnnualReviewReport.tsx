import { useMemo, useState } from 'react';
import { useCycles, useAnnualReviewInstancesPaginated, useCycleStatusCounts } from '@/hooks/useAnnualReview';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AnnualReviewStatusBadge } from '@/components/annual-review/AnnualReviewStatusBadge';
import { Download, FileBarChart2 } from 'lucide-react';
import { toast } from 'sonner';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DepartmentSubmissionTab } from '@/components/reports/annual-review/DepartmentSubmissionTab';
import { ReviewerQueuesTab } from '@/components/reports/annual-review/ReviewerQueuesTab';
import { PendingDrilldownTab } from '@/components/reports/annual-review/PendingDrilldownTab';
import { ComprehensiveTab } from '@/components/reports/annual-review/ComprehensiveTab';
import { BellCurveTab } from '@/components/reports/annual-review/BellCurveTab';
import { useAnnualReviewRatingSlabs } from '@/hooks/useAnnualReviewRatingSlabs';
import {
  toRatingOutOf5,
  resolveSlabPercent,
  formatRating5,
  formatSlabPercent,
} from '@/lib/annualReview/ratingSlab';
import { useEmployeeFilterOptions } from '@/hooks/useEmployeeFilterOptions';
import { useAnnualReviewCalibrations } from '@/hooks/useAnnualReviewCalibrations';
import { effectiveRating, isCalibrated } from '@/lib/annualReview/effectiveRating';
import { useAuth } from '@/contexts/AuthContext';
import { Badge } from '@/components/ui/badge';
import { CalibrateRatingDialog, type CalibrationTarget } from '@/components/annual-review/CalibrateRatingDialog';
import { SlidersHorizontal } from 'lucide-react';

type StatusFilter = 'all' | 'not_started' | 'pending_self' | 'pending_manager' | 'pending_skip' | 'pending_bu' | 'pending_hr' | 'completed';

/**
 * Annual Review Report (v1) — read-only, cycle-scoped, with server-side
 * pagination. Distinct from the Admin → Progress tab which is operational
 * (bulk finalize, send back, evidence upload). This page is for reporting
 * consumers (managers, HR, leadership) and supports a focused export.
 */
export default function AnnualReviewReport() {
  const { data: cycles = [] } = useCycles();
  const { effectiveRole } = useAuth();
  const canCalibrate = effectiveRole === 'admin';
  const [calibrationTarget, setCalibrationTarget] = useState<CalibrationTarget | null>(null);
  const [cycleId, setCycleId] = useState<string | undefined>(undefined);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [ratingBand, setRatingBand] = useState<string>('all');
  const [pmsGrade, setPmsGrade] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const args = cycleId ? { cycleId, page, pageSize, search, status, pmsGrade: pmsGrade === 'all' ? undefined : pmsGrade } : undefined;
  const { data: paged, isFetching } = useAnnualReviewInstancesPaginated(args);
  const { data: counts } = useCycleStatusCounts(cycleId);
  const { data: slabs } = useAnnualReviewRatingSlabs();
  const { grades: gradeOptions } = useEmployeeFilterOptions({ enabledGrades: true });
  const rows = paged?.rows ?? [];
  const total = paged?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const filtered = useMemo(
    () => rows.filter((r) => ratingBand === 'all' || (r.final_rating ?? '') === ratingBand),
    [rows, ratingBand],
  );

  const { data: calibrations = {} } = useAnnualReviewCalibrations(filtered.map((r) => r.id));
  /** Effective (calibrated when present) rating for a listed instance. */
  const ratingFor = (id: string, score: number | null) =>
    effectiveRating({ total_score: score, calibrated_rating: calibrations[id]?.calibrated_rating ?? null });

  const ratingOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.final_rating) set.add(r.final_rating);
    return Array.from(set).sort();
  }, [rows]);

  const onExport = async () => {
    try {
      const XLSX = await import('xlsx');
      const data = filtered.map((i: InstanceWithEmployee) => ({
        'Employee Code': i.employee?.employee_code ?? '',
        'Employee Name': i.employee?.full_name ?? '',
        'Designation': i.employee?.designation ?? '',
        'Stage': i.overall_status,
        'Total Score': i.total_score ?? '',
        'Final Rating': i.final_rating ?? '',
        'Final Rating (out of 5)': ratingFor(i.id, i.total_score) ?? '',
        'Slab %': resolveSlabPercent(ratingFor(i.id, i.total_score), slabs) ?? '',
        'Computed Rating': toRatingOutOf5(i.total_score) ?? '',
        'Calibrated Rating': calibrations[i.id]?.calibrated_rating ?? '',
        'Calibration Reason': calibrations[i.id]?.calibration_reason ?? '',
        'Finalized At': i.finalized_at ?? '',
      }));
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Annual Review');
      const cycleName = cycles.find((c) => c.id === cycleId)?.name ?? 'cycle';
      const safe = cycleName.replace(/[^a-zA-Z0-9._-]/g, '_');
      XLSX.writeFile(wb, `annual-review_${safe}_p${page}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <header className="flex items-center gap-2">
        <FileBarChart2 className="h-5 w-5 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Annual Review Report</h1>
          <p className="text-sm text-muted-foreground">Cycle-scoped, paginated view for managers and HR.</p>
        </div>
      </header>

      <Card>
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-5">
          <div className="space-y-1">
            <Label>Cycle</Label>
            <Select value={cycleId ?? ''} onValueChange={(v) => { setCycleId(v); setPage(1); }}>
              <SelectTrigger className="h-10"><SelectValue placeholder="Choose a cycle…" /></SelectTrigger>
              <SelectContent>
                {cycles.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.review_year})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Stage</Label>
            <Select value={status} onValueChange={(v) => { setStatus(v as StatusFilter); setPage(1); }}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stages</SelectItem>
                <SelectItem value="not_started">Not started</SelectItem>
                <SelectItem value="pending_self">Pending self</SelectItem>
                <SelectItem value="pending_manager">Pending manager</SelectItem>
                <SelectItem value="pending_skip">Pending skip</SelectItem>
                <SelectItem value="pending_bu">Pending BU</SelectItem>
                <SelectItem value="pending_hr">Pending HR</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Rating</Label>
            <Select value={ratingBand} onValueChange={setRatingBand}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All ratings</SelectItem>
                {ratingOptions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>PMS Grade</Label>
            <Select value={pmsGrade} onValueChange={(v) => { setPmsGrade(v); setPage(1); }}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All grades</SelectItem>
                {gradeOptions.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Search</Label>
            <Input
              placeholder="Employee name…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      {cycleId && counts && (
        <div className="grid gap-3 md:grid-cols-4">
          {[
            { label: 'Total', val: counts.total },
            { label: 'Self pending', val: counts.pending_self },
            { label: 'In progress', val: counts.pending_manager + counts.pending_skip + counts.pending_bu + counts.pending_hr },
            { label: 'Completed', val: counts.completed },
          ].map((m) => (
            <Card key={m.label}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{m.label}</p>
                <p className="text-3xl font-bold">{m.val}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue="comprehensive" className="space-y-3">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="comprehensive">Comprehensive</TabsTrigger>
          <TabsTrigger value="bell-curve">Bell Curve</TabsTrigger>
          <TabsTrigger value="detail">Detail</TabsTrigger>
          <TabsTrigger value="by-dept">By Department</TabsTrigger>
          <TabsTrigger value="by-reviewer">By Reviewer</TabsTrigger>
          <TabsTrigger value="pending">Pending Drill-down</TabsTrigger>
        </TabsList>
        <TabsContent value="comprehensive">
          <ComprehensiveTab cycleId={cycleId} cycleName={cycles.find((c) => c.id === cycleId)?.name ?? 'Cycle'} />
        </TabsContent>
        <TabsContent value="bell-curve">
          <BellCurveTab cycleId={cycleId} cycleName={cycles.find((c) => c.id === cycleId)?.name ?? 'Cycle'} />
        </TabsContent>
        <TabsContent value="detail">
          <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Results {isFetching && <span className="text-xs text-muted-foreground">(loading…)</span>}</CardTitle>
          <Button variant="outline" size="sm" className="gap-2" disabled={!cycleId || filtered.length === 0} onClick={onExport}>
            <Download className="h-4 w-4" /> Export page to Excel
          </Button>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="text-right">Rating</TableHead>
                <TableHead className="text-right" title="Final Score converted to a 5-point rating.">Final Rating (/5)</TableHead>
                <TableHead className="text-right" title="Increment slab resolved from the /5 rating.">Slab %</TableHead>
                {canCalibrate && <TableHead className="text-right">Calibrate</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <div className="font-medium">{i.employee?.full_name ?? i.employee_id}</div>
                    <div className="text-xs text-muted-foreground">{i.employee?.employee_code}</div>
                  </TableCell>
                  <TableCell className="text-sm">{i.employee?.designation ?? '—'}</TableCell>
                  <TableCell><AnnualReviewStatusBadge status={i.overall_status} /></TableCell>
                  <TableCell className="text-right tabular-nums">{i.total_score?.toFixed(2) ?? '—'}</TableCell>
                  <TableCell className="text-right">{i.final_rating ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatRating5(ratingFor(i.id, i.total_score))}
                    {calibrations[i.id] && (
                      <Badge
                        variant="outline"
                        className="ml-2 text-[10px]"
                        title={`Computed ${formatRating5(toRatingOutOf5(i.total_score))} → calibrated ${formatRating5(calibrations[i.id].calibrated_rating)}`
                          + (calibrations[i.id].calibration_reason ? ` · ${calibrations[i.id].calibration_reason}` : '')}
                      >
                        Calibrated
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatSlabPercent(resolveSlabPercent(ratingFor(i.id, i.total_score), slabs))}</TableCell>
                  {canCalibrate && (
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-10 gap-1 text-xs"
                        onClick={() => setCalibrationTarget({
                          instance_id: i.id,
                          employee_name: i.employee?.full_name ?? null,
                          employee_code: i.employee?.employee_code ?? null,
                          computed_rating: toRatingOutOf5(i.total_score),
                          calibrated_rating: calibrations[i.id]?.calibrated_rating ?? null,
                        })}
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        <span className="sr-only">Calibrate {i.employee?.full_name ?? 'employee'}</span>
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={canCalibrate ? 8 : 7} className="text-center py-8 text-muted-foreground">
                  {cycleId ? 'No matching reviews.' : 'Pick a cycle to begin.'}
                </TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        {cycleId && total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t p-3 text-sm">
            <p className="text-muted-foreground tabular-nums">
              Showing {(page - 1) * pageSize + 1}–{(page - 1) * pageSize + filtered.length} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Rows</Label>
              <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                <SelectTrigger className="w-20 h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</Button>
              <span className="text-xs tabular-nums">Page {page} / {pageCount}</span>
              <Button variant="outline" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next</Button>
            </div>
          </div>
        )}
          </Card>
        </TabsContent>
        <TabsContent value="by-dept"><DepartmentSubmissionTab cycleId={cycleId} /></TabsContent>
        <TabsContent value="by-reviewer"><ReviewerQueuesTab cycleId={cycleId} /></TabsContent>
        <TabsContent value="pending"><PendingDrilldownTab cycleId={cycleId} /></TabsContent>
      </Tabs>
    </div>
  );
}