import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Users, ShieldAlert, Clock, IndianRupee, Search } from 'lucide-react';
import { useIncentiveReportData } from '@/hooks/useIncentiveRecords';
import { useIncentivePrograms } from '@/hooks/useIncentivePrograms';
import * as XLSX from 'xlsx';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const YEARS = Array.from({ length: 5 }, (_, i) => String(2024 + i));

export function IncentiveReportExport() {
  const [month, setMonth] = useState('all');
  const [year, setYear] = useState('all');
  const [programId, setProgramId] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [search, setSearch] = useState('');

  const { data: programs } = useIncentivePrograms();
  const { data: records, isLoading } = useIncentiveReportData({ month, year, programId });

  const filtered = useMemo(() => {
    if (!records) return [];
    let result = records;
    if (periodFilter !== 'all') {
      result = result.filter((r: any) => r.payment_period === periodFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r: any) => {
        const p = r.profiles;
        return (
          p?.full_name?.toLowerCase().includes(q) ||
          p?.employee_code?.toLowerCase().includes(q) ||
          p?.designation?.toLowerCase().includes(q) ||
          p?.departments?.name?.toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [records, search, periodFilter]);

  const stats = useMemo(() => {
    const list = filtered || [];
    const total = list.length;
    const eligible = list.filter((r: any) => !r.is_disqualified).length;
    const dq = list.filter((r: any) => r.is_disqualified).length;
    const proRata = list.filter((r: any) => r.pro_rata_factor < 1).length;
    const totalAmount = list.reduce((sum: number, r: any) => sum + (r.incentive_amount || 0), 0);
    return { total, eligible, dq, proRata, totalAmount };
  }, [filtered]);

  const handleExport = () => {
    if (!filtered?.length) return;
    const rows = filtered.map((r: any) => {
      const p = r.profiles;
      const dept = p?.departments;
      const bu = dept?.business_units;
      const div = bu?.divisions;
      const slab = r.incentive_slabs;
      const prog = r.incentive_programs;
      return {
        'Employee Code': p?.employee_code ?? '',
        'Employee Name': p?.full_name ?? '',
        'Designation': p?.designation ?? '',
        'Department': dept?.name ?? '',
        'Business Unit': bu?.name ?? '',
        'Division': div?.name ?? '',
        'Month': r.review_period,
        'Year': r.review_year,
        'Period': r.payment_period === 'full' ? '' : r.payment_period,
        'Programme Name': prog?.name ?? '',
        'PMS Score': r.pms_score ?? '',
        'Slab Range': slab ? `${slab.min_value}–${slab.max_value}` : '',
        'Slab Rating': slab?.rating_label ?? '',
        'Base Incentive %': r.base_incentive_percent,
        'Is Disqualified': r.is_disqualified ? 'Yes' : 'No',
        'DQ Reasons': (r.disqualification_reasons || []).join(', '),
        'LTI Penalty %': r.lti_penalty_percent,
        'Pro-rata Factor': r.pro_rata_factor,
        'Production Value': r.production_value ?? '',
        'Original Score': r.original_score ?? '',
        'Adjusted Score': r.adjusted_score ?? '',
        'Final Incentive %': r.final_incentive_percent,
        'Incentive Status': r.incentive_status,
        'Record Status': r.status,
        'Incentive Base': prog?.incentive_base ?? '',
        'Retroactive Adjustment': r.is_retroactive_adjustment ? 'Yes' : 'No',
        'Adjustment Source Period': r.adjustment_source_period ?? '',
        'Computed At': r.computed_at ?? '',
        'Confirmed By': r.confirmed_by ?? '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Incentive Report');
    const suffix = month !== 'all' ? `_${month}` : '';
    const ySuffix = year !== 'all' ? `_${year}` : '';
    XLSX.writeFile(wb, `Incentive_Report${suffix}${ySuffix}.xlsx`);
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'confirmed': return 'default';
      case 'paid': return 'secondary';
      case 'draft': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-40">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Month</label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Months</SelectItem>
                  {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Year</label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Years</SelectItem>
                  {YEARS.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-48">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Programme</label>
              <Select value={programId} onValueChange={setProgramId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Programmes</SelectItem>
                  {programs?.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
             <div className="w-36">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Period</label>
              <Select value={periodFilter} onValueChange={setPeriodFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Periods</SelectItem>
                  <SelectItem value="Full Month">Full Month</SelectItem>
                  <SelectItem value="1-10">1-10</SelectItem>
                  <SelectItem value="11-20">11-20</SelectItem>
                  <SelectItem value="21-31">21-31</SelectItem>
                </SelectContent>
              </Select>
            </div>
             <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Search</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-8" placeholder="Name, code, dept..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleExport} disabled={!filtered?.length} className="gap-1.5">
              <Download className="h-4 w-4" />
              Export Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryCard icon={Users} label="Total Records" value={stats.total} />
        <SummaryCard icon={Users} label="Eligible" value={stats.eligible} className="text-primary" />
        <SummaryCard icon={ShieldAlert} label="Disqualified" value={stats.dq} className="text-destructive" />
        <SummaryCard icon={Clock} label="Pro-rata" value={stats.proRata} className="text-accent-foreground" />
        <SummaryCard icon={IndianRupee} label="Total Amount (₹)" value={stats.totalAmount.toLocaleString('en-IN')} />
      </div>

      {/* Preview Table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium">
            Preview {filtered.length > 50 ? `(showing 50 of ${filtered.length})` : `(${filtered.length} records)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No records found. Adjust filters or compute incentives first.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Designation</TableHead>
                   <TableHead>Dept</TableHead>
                   <TableHead>Month</TableHead>
                   <TableHead>Year</TableHead>
                   <TableHead>Programme</TableHead>
                   <TableHead className="text-right">Final %</TableHead>
                   <TableHead className="text-right">Amount (₹)</TableHead>
                   <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 50).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.profiles?.employee_code}</TableCell>
                    <TableCell>{r.profiles?.full_name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{r.profiles?.designation}</TableCell>
                    <TableCell className="text-xs">{r.profiles?.departments?.name}</TableCell>
                    <TableCell>{r.review_period}</TableCell>
                    <TableCell>{r.review_year}</TableCell>
                    <TableCell className="text-xs">{r.incentive_programs?.name}</TableCell>
                    <TableCell className="text-right font-medium">{r.final_incentive_percent}%</TableCell>
                    <TableCell className="text-right font-medium">₹{(r.incentive_amount || 0).toLocaleString('en-IN')}</TableCell>
                    <TableCell>
                      <Badge variant={statusColor(r.status)} className="text-xs">{r.status}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, className }: { icon: any; label: string; value: string | number; className?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 py-3 px-4">
        <Icon className={`h-5 w-5 text-muted-foreground ${className || ''}`} />
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={`text-lg font-semibold ${className || ''}`}>{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}
