import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/layout/PageHeader';
import { useCustomReport } from '@/hooks/useCustomReports';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getFieldByKey } from '@/lib/reportFieldRegistry';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function CustomReport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: report, isLoading: reportLoading } = useCustomReport(id);

  // Build and execute the dynamic query
  const { data: rows = [], isLoading: dataLoading } = useQuery({
    queryKey: ['custom-report-data', id, report?.columns],
    enabled: !!report && (report.columns?.length ?? 0) > 0,
    queryFn: async () => {
      if (!report) return [];

      // Determine which tables we need
      const columns = report.columns || [];
      const needsKpis = columns.some(c => c.key.startsWith('kpi.') || c.key.startsWith('workflow.assigned_at'));
      const needsScores = columns.some(c => c.key.startsWith('scores.') || c.key.startsWith('achieved.') || c.key === 'workflow.submitted_at');
      const needsOrg = columns.some(c => c.key.startsWith('org.'));

      // Build the select string for profiles
      let selectParts: string[] = ['id', 'employee_code', 'full_name', 'email', 'designation', 'pms_grade', 'joining_date', 'is_active'];
      if (needsOrg) {
        selectParts.push('departments:department_id(name)');
        selectParts.push('divisions:division_id(name)');
        selectParts.push('business_units:business_unit_id(name)');
      }

      // If we need KPI data, we query from kpis with profile join instead
      if (needsKpis || needsScores) {
        let kpiSelect = '*, employee:employee_id(id, employee_code, full_name, email, designation, pms_grade, joining_date, is_active';
        if (needsOrg) {
          kpiSelect += ', departments:department_id(name), divisions:division_id(name), business_units:business_unit_id(name)';
        }
        kpiSelect += ')';

        if (needsScores) {
          kpiSelect += ', review_submissions(*)';
        }

        kpiSelect += ', category:category_id(name)';

        let query = (supabase.from('kpis') as any).select(kpiSelect);

        // Apply filters
        for (const filter of report.filters || []) {
          if (!filter.field || !filter.value) continue;
          const fieldDef = getFieldByKey(filter.field);
          if (!fieldDef) continue;

          const column = resolveColumnPath(filter.field);
          switch (filter.operator) {
            case 'eq': query = query.eq(column, filter.value); break;
            case 'neq': query = query.neq(column, filter.value); break;
            case 'gt': query = query.gt(column, filter.value); break;
            case 'gte': query = query.gte(column, filter.value); break;
            case 'lt': query = query.lt(column, filter.value); break;
            case 'lte': query = query.lte(column, filter.value); break;
            case 'like': query = query.ilike(column, `%${filter.value}%`); break;
          }
        }

        query = query.limit(500);

        const { data, error } = await query;
        if (error) throw error;

        // Flatten the nested data
        return (data || []).map((row: any) => flattenRow(row, columns));
      }

      // Employee-only query
      let query = supabase.from('profiles').select(selectParts.join(', ')).eq('is_active', true).limit(500);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map((row: any) => flattenRow(row, columns));
    },
  });

  const flattenRow = (row: any, columns: { key: string; alias?: string }[]) => {
    const flat: Record<string, any> = {};
    const emp = row.employee || row;
    const sub = row.review_submissions?.[0] || {};

    for (const col of columns) {
      const key = col.key;
      if (key.startsWith('employee.')) {
        flat[key] = emp[key.replace('employee.', '')] ?? '';
      } else if (key === 'org.division') {
        flat[key] = emp.divisions?.name || row.divisions?.name || '';
      } else if (key === 'org.business_unit') {
        flat[key] = emp.business_units?.name || row.business_units?.name || '';
      } else if (key === 'org.department') {
        flat[key] = emp.departments?.name || row.departments?.name || '';
      } else if (key.startsWith('kpi.')) {
        const field = key.replace('kpi.', '');
        if (field === 'category') {
          flat[key] = row.category?.name || '';
        } else {
          flat[key] = row[field] ?? '';
        }
      } else if (key.startsWith('scores.') || key.startsWith('achieved.')) {
        const fieldDef = getFieldByKey(key);
        flat[key] = fieldDef ? (sub[fieldDef.field] ?? '') : '';
      } else if (key === 'workflow.submitted_at') {
        flat[key] = sub.submitted_at || '';
      } else if (key === 'workflow.assigned_at') {
        flat[key] = row.assigned_at || '';
      } else {
        flat[key] = '';
      }
    }
    return flat;
  };

  const resolveColumnPath = (fieldKey: string): string => {
    if (fieldKey.startsWith('employee.')) return `employee.${fieldKey.replace('employee.', '')}`;
    if (fieldKey.startsWith('kpi.')) {
      const f = fieldKey.replace('kpi.', '');
      return f === 'category' ? 'category.name' : f;
    }
    return fieldKey;
  };

  const handleExportExcel = () => {
    if (!report || rows.length === 0) return;
    const columns = report.columns || [];
    const headers = columns.map(c => c.alias || getFieldByKey(c.key)?.label || c.key);
    const wsData = [headers, ...rows.map(row => columns.map(c => row[c.key] ?? ''))];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, report.name.slice(0, 31));
    XLSX.writeFile(wb, `${report.filename_template || report.name}.xlsx`);
  };

  if (reportLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-[400px]" />
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">Report not found.</p>
        <Button variant="link" onClick={() => navigate('/reports')}>Back to Reports</Button>
      </div>
    );
  }

  const columns = report.columns || [];

  return (
    <div className="space-y-4">
      <PageHeader
        title={report.name}
        description={report.description || 'Custom report'}
        backTo="/reports"
      />

      <div className="flex justify-end gap-2">
        {report.export_excel && (
          <Button variant="outline" size="sm" onClick={handleExportExcel} disabled={rows.length === 0} className="gap-2">
            <Download className="h-4 w-4" /> Export Excel
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {dataLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Loading report data...</div>
          ) : rows.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No data found for this report configuration.</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">#</TableHead>
                    {columns.map(col => (
                      <TableHead key={col.key} className="text-xs whitespace-nowrap">
                        {col.alias || getFieldByKey(col.key)?.label || col.key}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      {columns.map(col => (
                        <TableCell key={col.key} className="text-xs whitespace-nowrap">
                          {formatCellValue(row[col.key], col.key)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-right">Showing {rows.length} rows (max 500)</p>
    </div>
  );
}

function formatCellValue(value: any, key: string): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (key.includes('score') || key.includes('weightage')) return value.toFixed(2);
    return String(value);
  }
  if (key.includes('_at') || key.includes('date')) {
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return String(value);
    }
  }
  return String(value);
}
