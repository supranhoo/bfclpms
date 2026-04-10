import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ExportProps {
  programId: string;
  programName: string;
  programType: 'vessel' | 'daily' | 'target';
  month: string;
  year: number;
}

export function IncentiveDataExport({ programId, programName, programType, month, year }: ExportProps) {
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setExporting(true);
    try {
      let ws: XLSX.WorkSheet;
      const fileName = `${programName.replace(/\s+/g, '_')}_${month}_${year}.xlsx`;

      if (programType === 'vessel') {
        ws = await exportVesselData(programId, month, year);
      } else if (programType === 'daily') {
        ws = await exportDailyData(programId, month, year);
      } else {
        ws = await exportTargetData(programId, month, year);
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Data');
      XLSX.writeFile(wb, fileName);
      toast({ title: 'Export complete', description: fileName });
    } catch (err: any) {
      console.error('Export error:', err);
      toast({ title: 'Export failed', description: err.message, variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
      {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
      Download Excel
    </Button>
  );
}

async function exportVesselData(programId: string, month: string, year: number): Promise<XLSX.WorkSheet> {
  const { data: rates } = await supabase
    .from('incentive_vessel_rates')
    .select('employee_id, rate_per_vessel, profiles:employee_id(full_name, employee_code)')
    .eq('program_id', programId);

  const { data: entries } = await supabase
    .from('vessel_monthly_entries')
    .select('employee_id, vessels_handled, remarks')
    .eq('program_id', programId)
    .eq('month', month)
    .eq('year', year);

  const entryMap = new Map((entries || []).map((e: any) => [e.employee_id, e]));
  const rows = (rates || []).map((r: any) => {
    const entry = entryMap.get(r.employee_id) || {};
    const vessels = (entry as any).vessels_handled ?? 0;
    const rate = r.rate_per_vessel || 0;
    return {
      'Employee': r.profiles?.full_name || '—',
      'Code': r.profiles?.employee_code || '—',
      'Rate/Vessel (₹)': rate,
      'Vessels Handled': vessels,
      'Total (₹)': vessels * rate,
      'Remarks': (entry as any).remarks || '',
    };
  });

  return XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Employee': 'No data' }]);
}

async function exportDailyData(programId: string, month: string, year: number): Promise<XLSX.WorkSheet> {
  const { data: rates } = await supabase
    .from('incentive_production_rates')
    .select('employee_id, entity_id, rate_per_ton, rate_type')
    .eq('program_id', programId);

  const { data: entries } = await supabase
    .from('production_daily_entries')
    .select('employee_id, daily_values')
    .eq('program_id', programId)
    .eq('month', month)
    .eq('year', year);

  // Fetch employee profiles for all unique employee IDs from entries
  const empIds = [...new Set([
    ...(rates || []).filter((r: any) => r.rate_type === 'employee').map((r: any) => r.employee_id),
    ...(entries || []).map((e: any) => e.employee_id),
  ].filter(Boolean))];

  const { data: profiles } = empIds.length
    ? await supabase.from('profiles').select('id, full_name, employee_code, designation, department_id, departments(name)').in('id', empIds)
    : { data: [] };

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));
  const entryMap = new Map((entries || []).map((e: any) => [e.employee_id, e.daily_values || {}]));

  // Build rate lookup: employee-level first, then common
  const empRates = new Map<string, number>();
  let commonRate = 0;
  (rates || []).forEach((r: any) => {
    if (r.rate_type === 'employee' && r.employee_id) empRates.set(r.employee_id, r.rate_per_ton);
    if (r.rate_type === 'common') commonRate = r.rate_per_ton;
  });

  const monthIdx = ['January','February','March','April','May','June','July','August','September','October','November','December'].indexOf(month);
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

  // Use entry employee IDs as the grid
  const allEmpIds = [...new Set([...empIds, ...(entries || []).map((e: any) => e.employee_id)])];

  const rows = allEmpIds.map(empId => {
    const p = profileMap.get(empId);
    const dailyVals = entryMap.get(empId) || {};
    const rate = empRates.get(empId) ?? commonRate;
    let total = 0;

    const row: Record<string, any> = {
      'Employee': p?.full_name || '—',
      'Code': p?.employee_code || '—',
      'Designation': p?.designation || '—',
      'Department': (p as any)?.departments?.name || '—',
      'Rate/Ton (₹)': rate,
    };

    for (let d = 1; d <= daysInMonth; d++) {
      const val = Number(dailyVals[String(d)] || 0);
      row[`Day ${d}`] = val || '';
      total += val;
    }
    row['Total'] = total;
    row['Amount (₹)'] = total * rate;
    return row;
  });

  return XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Employee': 'No data' }]);
}

async function exportTargetData(programId: string, month: string, year: number): Promise<XLSX.WorkSheet> {
  const { data: targets } = await supabase
    .from('incentive_production_targets')
    .select('*')
    .eq('program_id', programId)
    .eq('month', month)
    .eq('year', year)
    .order('created_at');

  const rows = (targets || []).map((t: any) => ({
    'Sub-Unit / Furnace': t.sub_unit_label || '',
    'Category': t.slab_category || '',
    'Target': t.target_value ?? 0,
    'Achieved': t.achieved_value ?? 0,
    'Incentive %': t.incentive_percent ?? 0,
    'Remarks': t.remarks || '',
  }));

  return XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Sub-Unit / Furnace': 'No data' }]);
}
