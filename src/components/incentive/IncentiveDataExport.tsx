import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { fetchAllPaged } from '@/lib/fetchAll';
import { resolveDailyExportData } from '@/lib/incentiveExportData';

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
  // Paged reads — bypass the 1,000-row PostgREST cap.
  const rates = await fetchAllPaged<any>((from, to) =>
    supabase
      .from('incentive_vessel_rates')
      // PII-hardening: name/code resolved via SECURITY DEFINER directory RPC
      // below — direct `profiles` embed would return null for non-admin
      // exporters (e.g. managers) and produce blank Employee/Code columns.
      .select('employee_id, rate_per_vessel')
      .eq('program_id', programId)
      .range(from, to) as any,
  );
  const entries = await fetchAllPaged<any>((from, to) =>
    supabase
      .from('vessel_monthly_entries')
      .select('employee_id, vessels_handled, remarks')
      .eq('program_id', programId)
      .eq('month', month)
      .eq('year', year)
      .range(from, to) as any,
  );

  const ids = Array.from(
    new Set((rates || []).map((r: any) => r.employee_id).filter(Boolean)),
  ) as string[];
  const profileMap = new Map<string, { full_name: string | null; employee_code: string | null }>();
  if (ids.length) {
    const { data: dir, error: dirErr } = await supabase.rpc(
      'get_profile_directory_entries_v2',
      { _ids: ids },
    );
    if (dirErr) throw dirErr;
    for (const d of (dir || []) as any[]) {
      profileMap.set(d.id, { full_name: d.full_name, employee_code: d.employee_code });
    }
  }

  const entryMap = new Map((entries || []).map((e: any) => [e.employee_id, e]));
  const rows = (rates || []).map((r: any) => {
    const entry = entryMap.get(r.employee_id) || {};
    const vessels = (entry as any).vessels_handled ?? 0;
    const rate = r.rate_per_vessel || 0;
    const prof = profileMap.get(r.employee_id);
    return {
      'Employee': prof?.full_name || '—',
      'Code': prof?.employee_code || '—',
      'Rate/Vessel (₹)': rate,
      'Vessels Handled': vessels,
      'Total (₹)': vessels * rate,
      'Remarks': (entry as any).remarks || '',
    };
  });

  return XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Employee': 'No data' }]);
}

async function exportDailyData(programId: string, month: string, year: number): Promise<XLSX.WorkSheet> {
  // Roster + rates + entries all sourced via the shared resolver, which
  // mirrors the on-screen grid (mappings → cascade), pages every read past
  // the 1k cap, and batches profile lookups. Fixes empty/dash export rows.
  const { employees, entries, daysInMonth, empRates, commonRate } =
    await resolveDailyExportData(programId, month, year);

  const entryMap = new Map(entries.map((e) => [e.employee_id, e.daily_values || {}]));

  const rows = employees.map((p) => {
    const dailyVals: Record<string, any> = entryMap.get(p.id) || {};
    const rate = empRates.get(p.id) ?? commonRate;
    let total = 0;
    const row: Record<string, any> = {
      'Employee': p.full_name || '—',
      'Code': p.employee_code || '—',
      'Designation': p.designation || '—',
      'Department': p.departments?.name || '—',
      'Rate/Ton (₹)': rate,
    };
    for (let d = 1; d <= daysInMonth; d++) {
      const val = Number(dailyVals[String(d)] || 0);
      row[`Day ${d}`] = val || '';
      total += val;
    }
    row['Total'] = total;
    row['Amount (₹)'] = Math.round(total * rate);
    return row;
  });

  return XLSX.utils.json_to_sheet(rows.length ? rows : [{ 'Employee': 'No data' }]);
}

async function exportTargetData(programId: string, month: string, year: number): Promise<XLSX.WorkSheet> {
  const targets = await fetchAllPaged<any>((from, to) =>
    supabase
      .from('production_targets')
      .select('*')
      .eq('program_id', programId)
      .eq('month', month)
      .eq('year', year)
      .order('created_at')
      .range(from, to) as any,
  );

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
