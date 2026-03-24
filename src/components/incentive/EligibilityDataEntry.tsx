import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Download, Upload, Save } from 'lucide-react';
import { useIncentiveEligibility, useUpsertEligibility, useBulkUpsertEligibility } from '@/hooks/useIncentiveEligibility';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import * as XLSX from 'xlsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function EligibilityDataEntry() {
  const { user } = useAuth();
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[currentDate.getMonth()]);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [searchTerm, setSearchTerm] = useState('');

  const { data: eligibilityData = [], isLoading } = useIncentiveEligibility(selectedMonth, selectedYear);
  const { data: allEmployees = [] } = useQuery({
    queryKey: ['all-employees-for-eligibility'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code, department_id, departments(name)')
        .eq('is_active', true)
        .order('employee_code');
      return data || [];
    },
  });

  const upsertEligibility = useUpsertEligibility();
  const bulkUpsert = useBulkUpsertEligibility();

  // Merge employees with existing eligibility data
  const mergedData = useMemo(() => {
    const eligMap = new Map(eligibilityData.map((e: any) => [e.employee_id, e]));
    return allEmployees
      .filter((emp: any) => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return emp.full_name?.toLowerCase().includes(term) || emp.employee_code?.toLowerCase().includes(term);
      })
      .map((emp: any) => {
        const existing = eligMap.get(emp.id);
        return {
          employee_id: emp.id,
          employee_name: emp.full_name,
          employee_code: emp.employee_code,
          department: emp.departments?.name || '—',
          ...(existing || {
            absent_days: 0,
            lwp_days: 0,
            has_warning_letter: false,
            is_suspended: false,
            is_contract_worker: false,
            lti_count: 0,
            department_lti_count: 0,
            total_working_days: null,
            present_days: null,
            weekly_off_days: null,
            production_value: null,
            availability_percent: null,
            shutdown_hours: null,
          }),
          id: existing?.id,
        };
      });
  }, [allEmployees, eligibilityData, searchTerm]);

  const getEligibilityStatus = (row: any) => {
    if (row.absent_days >= 1) return { status: 'Disqualified', reason: `Absent ${row.absent_days} day(s)` };
    if (row.has_warning_letter) return { status: 'Disqualified', reason: 'Warning letter' };
    if (row.is_suspended) return { status: 'Disqualified', reason: 'Suspended' };
    if (row.is_contract_worker) return { status: 'Disqualified', reason: 'Contract worker' };
    if (row.lwp_days > 3) return { status: 'Pro-rata', reason: `LWP ${row.lwp_days} days` };
    return { status: 'Eligible', reason: '' };
  };

  const handleSaveRow = (row: any) => {
    upsertEligibility.mutate({
      id: row.id,
      employee_id: row.employee_id,
      review_period: selectedMonth,
      review_year: selectedYear,
      absent_days: row.absent_days,
      lwp_days: row.lwp_days,
      has_warning_letter: row.has_warning_letter,
      is_suspended: row.is_suspended,
      is_contract_worker: row.is_contract_worker,
      lti_count: row.lti_count,
      department_lti_count: row.department_lti_count,
      total_working_days: row.total_working_days,
      present_days: row.present_days,
      weekly_off_days: row.weekly_off_days,
      production_value: row.production_value,
      availability_percent: row.availability_percent,
      shutdown_hours: row.shutdown_hours,
      remarks: null,
      entered_by: user?.id,
    });
  };

  const handleExportTemplate = () => {
    const ws = XLSX.utils.json_to_sheet(
      allEmployees.map((emp: any) => ({
        'Employee Code': emp.employee_code,
        'Employee Name': emp.full_name,
        'Absent Days': 0,
        'LWP Days': 0,
        'Warning Letter (Y/N)': 'N',
        'Suspended (Y/N)': 'N',
        'Contract Worker (Y/N)': 'N',
        'LTI Count': 0,
        'Dept LTI Count': 0,
        'Total Working Days': '',
        'Present Days': '',
        'Weekly Off Days': '',
        'Production Value': '',
        'Availability %': '',
        'Shutdown Hours': '',
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Eligibility');
    XLSX.writeFile(wb, `eligibility_template_${selectedMonth}_${selectedYear}.xlsx`);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const wb = XLSX.read(evt.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws) as any[];

      const empCodeMap = new Map(allEmployees.map((emp: any) => [emp.employee_code, emp.id]));
      const rows = json
        .filter(row => empCodeMap.has(String(row['Employee Code'])))
        .map(row => ({
          employee_id: empCodeMap.get(String(row['Employee Code']))!,
          review_period: selectedMonth,
          review_year: selectedYear,
          absent_days: Number(row['Absent Days']) || 0,
          lwp_days: Number(row['LWP Days']) || 0,
          has_warning_letter: String(row['Warning Letter (Y/N)']).toUpperCase() === 'Y',
          is_suspended: String(row['Suspended (Y/N)']).toUpperCase() === 'Y',
          is_contract_worker: String(row['Contract Worker (Y/N)']).toUpperCase() === 'Y',
          lti_count: Number(row['LTI Count']) || 0,
          department_lti_count: Number(row['Dept LTI Count']) || 0,
          total_working_days: row['Total Working Days'] ? Number(row['Total Working Days']) : null,
          present_days: row['Present Days'] ? Number(row['Present Days']) : null,
          weekly_off_days: row['Weekly Off Days'] ? Number(row['Weekly Off Days']) : null,
          production_value: row['Production Value'] ? Number(row['Production Value']) : null,
          availability_percent: row['Availability %'] ? Number(row['Availability %']) : null,
          shutdown_hours: row['Shutdown Hours'] ? Number(row['Shutdown Hours']) : null,
          remarks: null,
        }));

      if (rows.length > 0) bulkUpsert.mutate(rows);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // Local editing state
  const [editedRows, setEditedRows] = useState<Record<string, any>>({});

  const updateLocalRow = (empId: string, field: string, value: any) => {
    setEditedRows(prev => ({
      ...prev,
      [empId]: { ...(prev[empId] || {}), [field]: value },
    }));
  };

  const getRowValue = (row: any, field: string) => {
    return editedRows[row.employee_id]?.[field] ?? row[field];
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Eligibility Data Entry</CardTitle>
        <CardDescription>Enter monthly disqualification & attendance data for employees</CardDescription>
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
          <Input placeholder="Search employee..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-[200px]" />
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportTemplate}><Download className="h-4 w-4 mr-1" /> Template</Button>
            <Button variant="outline" size="sm" asChild>
              <label className="cursor-pointer"><Upload className="h-4 w-4 mr-1" /> Import<input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} /></label>
            </Button>
          </div>
        </div>

        <div className="rounded-md border overflow-auto max-h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="sticky left-0 bg-background z-10">Employee</TableHead>
                <TableHead>Dept</TableHead>
                <TableHead>Absent</TableHead>
                <TableHead>LWP</TableHead>
                <TableHead>Warning</TableHead>
                <TableHead>Suspended</TableHead>
                <TableHead>Contract</TableHead>
                <TableHead>LTI</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : mergedData.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">No employees found</TableCell></TableRow>
              ) : (
                mergedData.slice(0, 100).map((row: any) => {
                  const { status, reason } = getEligibilityStatus({ ...row, ...editedRows[row.employee_id] });
                  return (
                    <TableRow key={row.employee_id}>
                      <TableCell className="sticky left-0 bg-background z-10">
                        <div className="text-sm font-medium">{row.employee_name}</div>
                        <div className="text-xs text-muted-foreground">{row.employee_code}</div>
                      </TableCell>
                      <TableCell className="text-xs">{row.department}</TableCell>
                      <TableCell>
                        <Input type="number" className="h-7 w-16" value={getRowValue(row, 'absent_days')} onChange={e => updateLocalRow(row.employee_id, 'absent_days', Number(e.target.value))} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" className="h-7 w-16" value={getRowValue(row, 'lwp_days')} onChange={e => updateLocalRow(row.employee_id, 'lwp_days', Number(e.target.value))} />
                      </TableCell>
                      <TableCell>
                        <Switch checked={getRowValue(row, 'has_warning_letter')} onCheckedChange={v => updateLocalRow(row.employee_id, 'has_warning_letter', v)} />
                      </TableCell>
                      <TableCell>
                        <Switch checked={getRowValue(row, 'is_suspended')} onCheckedChange={v => updateLocalRow(row.employee_id, 'is_suspended', v)} />
                      </TableCell>
                      <TableCell>
                        <Switch checked={getRowValue(row, 'is_contract_worker')} onCheckedChange={v => updateLocalRow(row.employee_id, 'is_contract_worker', v)} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" className="h-7 w-14" value={getRowValue(row, 'lti_count')} onChange={e => updateLocalRow(row.employee_id, 'lti_count', Number(e.target.value))} />
                      </TableCell>
                      <TableCell>
                        <Badge variant={status === 'Eligible' ? 'default' : status === 'Disqualified' ? 'destructive' : 'secondary'}>
                          {status}
                        </Badge>
                        {reason && <div className="text-xs text-muted-foreground mt-0.5">{reason}</div>}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => handleSaveRow({ ...row, ...editedRows[row.employee_id] })} disabled={upsertEligibility.isPending}>
                          <Save className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {mergedData.length > 100 && (
          <p className="text-xs text-muted-foreground">Showing first 100 of {mergedData.length} employees. Use search to filter.</p>
        )}
      </CardContent>
    </Card>
  );
}
