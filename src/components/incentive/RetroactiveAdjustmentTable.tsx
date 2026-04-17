import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Download, Bell, Search, Loader2 } from 'lucide-react';
import { useIncentiveRevisions, useMarkPayrollNotified } from '@/hooks/useIncentiveRevisions';
import { useDetectRetroactiveChanges } from '@/hooks/useIncentiveRecords';
import { useIncentivePrograms } from '@/hooks/useIncentivePrograms';
import { useCompanyFilter } from '@/hooks/useCompanyFilter';
import { MultiSelectFilter } from '@/components/ui/multi-select-filter';
import * as XLSX from 'xlsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function RetroactiveAdjustmentTable() {
  const [affectedYear, setAffectedYear] = useState(new Date().getFullYear());
  const [slabChangeOnly, setSlabChangeOnly] = useState(false);
  const [detectMonth, setDetectMonth] = useState(MONTHS[new Date().getMonth()]);
  const [detectProgram, setDetectProgram] = useState<string>('');

  const { data: programs = [] } = useIncentivePrograms();
  const activePrograms = (programs as any[]).filter((p: any) => p.is_active);

  const { data: revisions = [], isLoading } = useIncentiveRevisions({ affectedYear, slabChangeOnly });
  const markNotified = useMarkPayrollNotified();
  const detectChanges = useDetectRetroactiveChanges();

  const handleDetect = () => {
    detectChanges.mutate({
      review_period: detectMonth,
      review_year: affectedYear,
      ...(detectProgram ? { program_id: detectProgram } : {}),
    });
  };

  const handleExport = () => {
    const exportData = (revisions as any[]).map((r: any) => ({
      'Employee Code': r.profiles?.employee_code,
      'Employee Name': r.profiles?.full_name,
      'Department': r.profiles?.departments?.name,
      'Affected Month': r.affected_period,
      'Original Score': r.original_score?.toFixed(2),
      'Revised Score': r.revised_score?.toFixed(2),
      'Score Delta': ((r.revised_score || 0) - (r.original_score || 0)).toFixed(2),
      'Original Slab %': r.original_slab_percent,
      'New Slab %': r.revised_slab_percent,
      'Incentive Delta': ((r.revised_slab_percent || 0) - (r.original_slab_percent || 0)).toFixed(1) + '%',
      'Reason': r.revision_reason,
      'Payroll Status': r.is_payroll_notified ? 'Notified' : 'Pending',
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Retroactive Adjustments');
    XLSX.writeFile(wb, `retroactive_adjustments_${affectedYear}.xlsx`);
  };

  const handleMarkAllNotified = () => {
    const pendingIds = (revisions as any[]).filter((r: any) => !r.is_payroll_notified).map((r: any) => r.id);
    if (pendingIds.length > 0) markNotified.mutate(pendingIds);
  };

  const pendingCount = (revisions as any[]).filter((r: any) => !r.is_payroll_notified).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Retroactive Adjustment Report</CardTitle>
          <CardDescription>Employees whose past-month incentive slab changed due to Quarterly/Bi-Monthly KPI resolution</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-wrap items-center">
            <Select value={String(affectedYear)} onValueChange={v => setAffectedYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Switch checked={slabChangeOnly} onCheckedChange={setSlabChangeOnly} id="slab-change-only" />
              <Label htmlFor="slab-change-only" className="text-sm">Slab changes only</Label>
            </div>
            {pendingCount > 0 && (
              <Badge variant="destructive">{pendingCount} pending notification{pendingCount > 1 ? 's' : ''}</Badge>
            )}
            <div className="ml-auto flex gap-2">
              <Select value={detectProgram} onValueChange={setDetectProgram}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Program" /></SelectTrigger>
                <SelectContent>
                  {activePrograms.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={detectMonth} onValueChange={setDetectMonth}>
                <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={handleDetect} disabled={detectChanges.isPending}>
                {detectChanges.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Search className="h-4 w-4 mr-1" />}
                Detect Changes
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" /> Export</Button>
              <Button size="sm" onClick={handleMarkAllNotified} disabled={markNotified.isPending || pendingCount === 0}>
                <Bell className="h-4 w-4 mr-1" /> Mark All Notified
              </Button>
            </div>
          </div>

          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Affected Month</TableHead>
                  <TableHead>Original Score</TableHead>
                  <TableHead>Revised Score</TableHead>
                  <TableHead>Δ Score</TableHead>
                  <TableHead>Original → New Slab</TableHead>
                  <TableHead>Δ Incentive</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : (revisions as any[]).length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No retroactive adjustments found</TableCell></TableRow>
                ) : (
                  (revisions as any[]).map((r: any) => {
                    const delta = (r.revised_score || 0) - (r.original_score || 0);
                    const slabDelta = (r.revised_slab_percent || 0) - (r.original_slab_percent || 0);
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="text-sm font-medium">{r.profiles?.full_name}</div>
                          <div className="text-xs text-muted-foreground">{r.profiles?.employee_code}</div>
                        </TableCell>
                        <TableCell className="text-sm">{r.profiles?.departments?.name || '—'}</TableCell>
                        <TableCell>{r.affected_period}</TableCell>
                        <TableCell>{r.original_score?.toFixed(2) || '—'}</TableCell>
                        <TableCell>{r.revised_score?.toFixed(2) || '—'}</TableCell>
                        <TableCell>
                          <Badge variant={delta > 0 ? 'default' : delta < 0 ? 'destructive' : 'secondary'}>
                            {delta > 0 ? '+' : ''}{delta.toFixed(2)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs">{r.original_slab_percent ?? 0}% → {r.revised_slab_percent ?? 0}%</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={slabDelta > 0 ? 'default' : slabDelta < 0 ? 'destructive' : 'secondary'}>
                            {slabDelta > 0 ? '+' : ''}{slabDelta.toFixed(1)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{r.revision_reason?.replace(/_/g, ' ')}</TableCell>
                        <TableCell>
                          <Badge variant={r.is_payroll_notified ? 'default' : 'destructive'}>
                            {r.is_payroll_notified ? 'Notified' : 'Pending'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {!r.is_payroll_notified && (
                            <Button size="sm" variant="outline" onClick={() => markNotified.mutate([r.id])} disabled={markNotified.isPending}>
                              Notify
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
