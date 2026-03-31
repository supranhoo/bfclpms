import { useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Download, CheckCircle2, DollarSign, Calculator, Loader2 } from 'lucide-react';
import { useIncentiveRecords, useConfirmIncentiveRecords, useMarkIncentivePaid, useComputeIncentives } from '@/hooks/useIncentiveRecords';
import { useIncentivePrograms } from '@/hooks/useIncentivePrograms';
import { useAuth } from '@/contexts/AuthContext';
import { IncentiveDryRunDialog } from './IncentiveDryRunDialog';
import { IncentiveStatusOverride, IncentiveStatusBadge } from './IncentiveStatusOverride';
import * as XLSX from 'xlsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function MonthlyIncentiveTable() {
  const { user } = useAuth();
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[currentDate.getMonth()]);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [incentiveStatusFilter, setIncentiveStatusFilter] = useState<string>('all');
  const [eligibilityFilter, setEligibilityFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProgram, setSelectedProgram] = useState<string>('');
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [employeeNameMap, setEmployeeNameMap] = useState<Map<string, { name: string; code: string }>>(new Map());

  const { data: programs = [] } = useIncentivePrograms();
  const activePrograms = (programs as any[]).filter((p: any) => p.is_active);

  const { data: records = [], isLoading } = useIncentiveRecords(selectedMonth, selectedYear);
  const confirmRecords = useConfirmIncentiveRecords();
  const markPaid = useMarkIncentivePaid();
  const computeIncentives = useComputeIncentives();

  const filteredRecords = useMemo(() => {
    return (records as any[]).filter(r => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (incentiveStatusFilter !== 'all' && r.incentive_status !== incentiveStatusFilter) return false;
      if (eligibilityFilter === 'eligible' && r.is_disqualified) return false;
      if (eligibilityFilter === 'disqualified' && !r.is_disqualified) return false;
      if (eligibilityFilter === 'prorata' && r.pro_rata_factor >= 1) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const name = r.profiles?.full_name?.toLowerCase() || '';
        const code = r.profiles?.employee_code?.toLowerCase() || '';
        if (!name.includes(term) && !code.includes(term)) return false;
      }
      return true;
    });
  }, [records, statusFilter, incentiveStatusFilter, eligibilityFilter, searchTerm]);

  const summaryStats = useMemo(() => {
    const total = records.length;
    const eligible = (records as any[]).filter((r: any) => !r.is_disqualified).length;
    const disqualified = (records as any[]).filter((r: any) => r.is_disqualified).length;
    const prorata = (records as any[]).filter((r: any) => !r.is_disqualified && r.pro_rata_factor < 1).length;
    const avgIncentive = eligible > 0 ? (records as any[]).filter((r: any) => !r.is_disqualified).reduce((s: number, r: any) => s + (r.final_incentive_percent || 0), 0) / eligible : 0;
    const totalAmount = (records as any[]).reduce((s: number, r: any) => s + (r.incentive_amount || 0), 0);
    return { total, eligible, disqualified, prorata, avgIncentive, totalAmount };
  }, [records]);

  const handleExport = () => {
    const exportData = filteredRecords.map((r: any) => ({
      'Employee Code': r.profiles?.employee_code,
      'Employee Name': r.profiles?.full_name,
      'Department': r.profiles?.departments?.name,
      'PMS Score': r.pms_score?.toFixed(2),
      'Matched Slab': r.incentive_slabs ? `${r.incentive_slabs.min_value}-${r.incentive_slabs.max_value}` : '—',
      'Base Incentive %': r.base_incentive_percent,
      'DQ Reasons': r.disqualification_reasons?.join(', ') || '',
      'LTI Penalty %': r.lti_penalty_percent,
      'Pro-rata Factor': r.pro_rata_factor,
      'Final Incentive %': r.final_incentive_percent,
      'Status': r.status,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Incentive Report');
    XLSX.writeFile(wb, `incentive_report_${selectedMonth}_${selectedYear}.xlsx`);
  };

  const handleConfirmAll = () => {
    const draftIds = filteredRecords.filter((r: any) => r.status === 'draft').map((r: any) => r.id);
    if (draftIds.length > 0 && user?.id) confirmRecords.mutate({ ids: draftIds, confirmedBy: user.id });
  };

  const handleMarkAllPaid = () => {
    const confirmedIds = filteredRecords.filter((r: any) => r.status === 'confirmed').map((r: any) => r.id);
    if (confirmedIds.length > 0) markPaid.mutate(confirmedIds);
  };

  const handleCompute = async () => {
    if (!selectedProgram) return;
    try {
      const result = await computeIncentives.mutateAsync({
        review_period: selectedMonth,
        review_year: selectedYear,
        program_id: selectedProgram,
        dry_run: true,
      });
      setDryRunResult(result);
      setShowPreview(true);

      // Fetch employee names for dry run records
      const ids = (result as any)?.records?.map((r: any) => r.employee_id) || [];
      if (ids.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, employee_code')
          .in('id', ids);
        const nameMap = new Map<string, { name: string; code: string }>(
          (profiles || []).map((p: any) => [p.id, { name: p.full_name || 'Unknown', code: p.employee_code || '' }])
        );
        setEmployeeNameMap(nameMap);
      }
    } catch { /* error handled by hook */ }
  };

  const handleConfirmCompute = async () => {
    if (!selectedProgram) return;
    try {
      await computeIncentives.mutateAsync({
        review_period: selectedMonth,
        review_year: selectedYear,
        program_id: selectedProgram,
        dry_run: false,
      });
      setShowPreview(false);
      setDryRunResult(null);
    } catch { /* error handled by hook */ }
  };

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-6">
        {[
          { label: 'Total Employees', value: summaryStats.total },
          { label: 'Eligible', value: summaryStats.eligible },
          { label: 'Disqualified', value: summaryStats.disqualified },
          { label: 'Pro-rata', value: summaryStats.prorata },
          { label: 'Avg Incentive %', value: summaryStats.avgIncentive.toFixed(1) + '%' },
          { label: 'Total Amount', value: '₹' + summaryStats.totalAmount.toLocaleString('en-IN') },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p className="text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Monthly Incentive Report</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 flex-wrap items-center">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
              <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
              <SelectContent>{[2024, 2025, 2026, 2027].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
              </SelectContent>
            </Select>
            <Select value={eligibilityFilter} onValueChange={setEligibilityFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Eligibility" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="eligible">Eligible</SelectItem>
                <SelectItem value="disqualified">Disqualified</SelectItem>
                <SelectItem value="prorata">Pro-rata</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-[180px]" />
            <Select value={incentiveStatusFilter} onValueChange={setIncentiveStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="Incentive Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Incentive</SelectItem>
                <SelectItem value="hold">Hold</SelectItem>
                <SelectItem value="finalised">Finalised</SelectItem>
                <SelectItem value="forfeited">Forfeited</SelectItem>
                <SelectItem value="released">Released</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedProgram} onValueChange={setSelectedProgram}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select Program" /></SelectTrigger>
              <SelectContent>
                {activePrograms.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={handleCompute} disabled={!selectedProgram || computeIncentives.isPending}>
                {computeIncentives.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Calculator className="h-4 w-4 mr-1" />}
                Compute
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" /> Export</Button>
              <Button size="sm" onClick={handleConfirmAll} disabled={confirmRecords.isPending}><CheckCircle2 className="h-4 w-4 mr-1" /> Confirm All</Button>
              <Button size="sm" variant="secondary" onClick={handleMarkAllPaid} disabled={markPaid.isPending}><DollarSign className="h-4 w-4 mr-1" /> Mark Paid</Button>
            </div>
          </div>

          <div className="rounded-md border overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>PMS Score</TableHead>
                  <TableHead>Slab</TableHead>
                  <TableHead>Base %</TableHead>
                  <TableHead>DQ Reason</TableHead>
                  <TableHead>LTI Penalty</TableHead>
                  <TableHead>Pro-rata</TableHead>
                  <TableHead>Final %</TableHead>
                  <TableHead>Amount (₹)</TableHead>
                   <TableHead>Status</TableHead>
                   <TableHead>Incentive Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filteredRecords.length === 0 ? (
                  <TableRow><TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No records found. Run incentive computation first.</TableCell></TableRow>
                ) : (
                  filteredRecords.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="text-sm font-medium">{r.profiles?.full_name}</div>
                        <div className="text-xs text-muted-foreground">{r.profiles?.employee_code}</div>
                      </TableCell>
                      <TableCell className="text-sm">{r.profiles?.departments?.name || '—'}</TableCell>
                      <TableCell>{r.pms_score?.toFixed(2) || '—'}</TableCell>
                      <TableCell>
                        {r.incentive_slabs ? (
                          <span className="text-xs">{r.incentive_slabs.min_value}–{r.incentive_slabs.max_value}</span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{r.base_incentive_percent}%</TableCell>
                      <TableCell>
                        {r.is_disqualified ? (
                          <Badge variant="destructive" className="text-xs">{r.disqualification_reasons?.[0] || 'DQ'}</Badge>
                        ) : '—'}
                      </TableCell>
                      <TableCell>{r.lti_penalty_percent > 0 ? `${r.lti_penalty_percent}%` : '—'}</TableCell>
                      <TableCell>{r.pro_rata_factor < 1 ? r.pro_rata_factor.toFixed(2) : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={r.final_incentive_percent > 0 ? 'default' : 'secondary'}>
                          {r.final_incentive_percent}%
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'paid' ? 'default' : r.status === 'confirmed' ? 'secondary' : 'outline'}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <IncentiveStatusOverride recordId={r.id} currentStatus={r.incentive_status || 'hold'} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <IncentiveDryRunDialog
        open={showPreview}
        onOpenChange={setShowPreview}
        result={dryRunResult}
        onConfirm={handleConfirmCompute}
        isConfirming={computeIncentives.isPending}
        employeeNames={employeeNameMap}
      />
    </div>
  );
}
