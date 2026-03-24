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
import { useAllEligibilityFields } from '@/hooks/useIncentivePrograms';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import * as XLSX from 'xlsx';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Core fields that map directly to typed columns on the eligibility table
const CORE_FIELD_KEYS = new Set([
  'absent_days', 'lwp_days', 'has_warning_letter', 'is_suspended',
  'is_contract_worker', 'lti_count', 'department_lti_count',
  'total_working_days', 'present_days', 'weekly_off_days',
  'production_value', 'availability_percent', 'shutdown_hours',
]);

export function EligibilityDataEntry() {
  const { user } = useAuth();
  const currentDate = new Date();
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[currentDate.getMonth()]);
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [searchTerm, setSearchTerm] = useState('');

  const { data: eligibilityData = [], isLoading } = useIncentiveEligibility(selectedMonth, selectedYear);
  const { data: fieldDefs = [] } = useAllEligibilityFields();
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

  // Deduplicate fields by field_key, keeping program-specific over global
  const activeFields = useMemo(() => {
    const byKey = new Map<string, any>();
    for (const f of fieldDefs) {
      const existing = byKey.get(f.field_key);
      if (!existing || (f.program_id && !existing.program_id)) {
        byKey.set(f.field_key, f);
      }
    }
    return Array.from(byKey.values()).sort((a: any, b: any) => a.sort_order - b.sort_order);
  }, [fieldDefs]);

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
        const defaults: Record<string, any> = {};
        for (const f of activeFields) {
          if (CORE_FIELD_KEYS.has(f.field_key)) {
            defaults[f.field_key] = existing?.[f.field_key] ?? (f.field_type === 'boolean' ? false : f.field_type === 'number' ? 0 : null);
          } else {
            const customFields = existing?.custom_fields as Record<string, any> || {};
            defaults[f.field_key] = customFields[f.field_key] ?? (f.field_type === 'boolean' ? false : f.field_type === 'number' ? 0 : null);
          }
        }
        return {
          employee_id: emp.id,
          employee_name: emp.full_name,
          employee_code: emp.employee_code,
          department: emp.departments?.name || '—',
          id: existing?.id,
          ...defaults,
        };
      });
  }, [allEmployees, eligibilityData, searchTerm, activeFields]);

  const getEligibilityStatus = (row: any) => {
    if (row.absent_days >= 1) return { status: 'Disqualified', reason: `Absent ${row.absent_days} day(s)` };
    if (row.has_warning_letter) return { status: 'Disqualified', reason: 'Warning letter' };
    if (row.is_suspended) return { status: 'Disqualified', reason: 'Suspended' };
    if (row.is_contract_worker) return { status: 'Disqualified', reason: 'Contract worker' };
    if (row.lwp_days > 3) return { status: 'Pro-rata', reason: `LWP ${row.lwp_days} days` };
    return { status: 'Eligible', reason: '' };
  };

  const handleSaveRow = (row: any) => {
    const coreData: Record<string, any> = {};
    const customFields: Record<string, any> = {};
    for (const f of activeFields) {
      if (CORE_FIELD_KEYS.has(f.field_key)) {
        coreData[f.field_key] = row[f.field_key];
      } else {
        customFields[f.field_key] = row[f.field_key];
      }
    }
    upsertEligibility.mutate({
      id: row.id,
      employee_id: row.employee_id,
      review_period: selectedMonth,
      review_year: selectedYear,
      ...coreData,
      custom_fields: customFields,
      remarks: null,
      entered_by: user?.id,
    } as any);
  };

  const handleExportTemplate = () => {
    const headers: Record<string, any> = { 'Employee Code': '', 'Employee Name': '' };
    for (const f of activeFields) {
      headers[f.field_label] = f.field_type === 'boolean' ? 'N' : f.field_type === 'number' ? 0 : '';
    }
    const ws = XLSX.utils.json_to_sheet(
      allEmployees.map((emp: any) => ({
        'Employee Code': emp.employee_code,
        'Employee Name': emp.full_name,
        ...Object.fromEntries(activeFields.map((f: any) => [f.field_label, f.field_type === 'boolean' ? 'N' : f.field_type === 'number' ? 0 : ''])),
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

      const labelToField = new Map(activeFields.map((f: any) => [f.field_label, f]));
      const empCodeMap = new Map(allEmployees.map((emp: any) => [emp.employee_code, emp.id]));

      const rows = json
        .filter(row => empCodeMap.has(String(row['Employee Code'])))
        .map(row => {
          const coreData: Record<string, any> = {};
          const customFields: Record<string, any> = {};
          for (const [label, value] of Object.entries(row)) {
            const field = labelToField.get(label);
            if (!field) continue;
            const parsed = field.field_type === 'boolean'
              ? String(value).toUpperCase() === 'Y'
              : field.field_type === 'number'
                ? (value ? Number(value) : null)
                : value;
            if (CORE_FIELD_KEYS.has(field.field_key)) {
              coreData[field.field_key] = parsed;
            } else {
              customFields[field.field_key] = parsed;
            }
          }
          return {
            employee_id: empCodeMap.get(String(row['Employee Code']))!,
            review_period: selectedMonth,
            review_year: selectedYear,
            ...coreData,
            custom_fields: customFields,
            remarks: null,
          };
        });

      if (rows.length > 0) bulkUpsert.mutate(rows as any);
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
                {activeFields.map((f: any) => (
                  <TableHead key={f.field_key}>{f.field_label}</TableHead>
                ))}
                <TableHead>Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={activeFields.length + 4} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : mergedData.length === 0 ? (
                <TableRow><TableCell colSpan={activeFields.length + 4} className="text-center py-8 text-muted-foreground">No employees found</TableCell></TableRow>
              ) : (
                mergedData.slice(0, 100).map((row: any) => {
                  const mergedRow = { ...row, ...editedRows[row.employee_id] };
                  const { status, reason } = getEligibilityStatus(mergedRow);
                  return (
                    <TableRow key={row.employee_id}>
                      <TableCell className="sticky left-0 bg-background z-10">
                        <div className="text-sm font-medium">{row.employee_name}</div>
                        <div className="text-xs text-muted-foreground">{row.employee_code}</div>
                      </TableCell>
                      <TableCell className="text-xs">{row.department}</TableCell>
                      {activeFields.map((f: any) => (
                        <TableCell key={f.field_key}>
                          {f.field_type === 'boolean' ? (
                            <Switch
                              checked={getRowValue(row, f.field_key)}
                              onCheckedChange={v => updateLocalRow(row.employee_id, f.field_key, v)}
                            />
                          ) : f.field_type === 'number' ? (
                            <Input
                              type="number"
                              className="h-7 w-16"
                              value={getRowValue(row, f.field_key) ?? ''}
                              onChange={e => updateLocalRow(row.employee_id, f.field_key, e.target.value ? Number(e.target.value) : null)}
                            />
                          ) : (
                            <Input
                              className="h-7 w-24"
                              value={getRowValue(row, f.field_key) ?? ''}
                              onChange={e => updateLocalRow(row.employee_id, f.field_key, e.target.value)}
                            />
                          )}
                        </TableCell>
                      ))}
                      <TableCell>
                        <Badge variant={status === 'Eligible' ? 'default' : status === 'Disqualified' ? 'destructive' : 'secondary'}>
                          {status}
                        </Badge>
                        {reason && <div className="text-xs text-muted-foreground mt-0.5">{reason}</div>}
                      </TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => handleSaveRow(mergedRow)} disabled={upsertEligibility.isPending}>
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
