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
  /**
   * RLS-safe company filter. Primary source of company scoping for the
   * daily export — the resolver uses the RPC-provided company_id, not
   * the RLS-restricted profiles map. RCA 2026-06-26 (Upendra / Bihar
   * Foundry & Casting Metal Sizing blank export).
   */
  selectedCompanyId?: string;
  /**
   * Legacy fallback — used only when `selectedCompanyId` is absent.
   * Sourced from `useCompanyFilter` which reads `profiles` directly and
   * is RLS-restricted for non-admin Incentive Data Entry users.
   */
  filterByCompany?: (employeeId: string | undefined | null) => boolean;
}

export function IncentiveDataExport({
  programId,
  programName,
  programType,
  month,
  year,
  selectedCompanyId,
  filterByCompany,
}: ExportProps) {
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const handleExport = async () => {
    setExporting(true);
    try {
      let ws: XLSX.WorkSheet;
      const fileName = `${programName.replace(/\s+/g, '_')}_${month}_${year}.xlsx`;

      if (programType === 'vessel') {
        ws = await exportVesselData(programId, month, year, selectedCompanyId, filterByCompany);
      } else if (programType === 'daily') {
        ws = await exportDailyData(programId, month, year, selectedCompanyId, filterByCompany);
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

async function exportVesselData(
  programId: string,
  month: string,
  year: number,
  selectedCompanyId?: string,
  filterByCompany?: (employeeId: string | undefined | null) => boolean,
): Promise<XLSX.WorkSheet> {
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
  // Company filter (RLS-safe via RPC roster) — mirrors VesselDataEntryGrid.
  let filteredRates: any[] = rates || [];
  const useRpcCompanyId = !!selectedCompanyId && selectedCompanyId !== 'all';
  if (useRpcCompanyId) {
    const { data: roster, error: rosterErr } = await supabase.rpc(
      'get_incentive_program_employees',
      { _program_id: programId },
    );
    if (rosterErr) throw rosterErr;
    const companyOf = new Map<string, string | null>(
      ((roster ?? []) as any[]).map((r) => [r.id as string, (r.company_id ?? null) as string | null]),
    );
    filteredRates = filteredRates.filter((r: any) => companyOf.get(r.employee_id) === selectedCompanyId);
  } else if (filterByCompany) {
    filteredRates = filteredRates.filter((r: any) => filterByCompany(r.employee_id));
  }
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
    new Set(filteredRates.map((r: any) => r.employee_id).filter(Boolean)),
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
  const rows = filteredRates.map((r: any) => {
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

async function exportDailyData(
  programId: string,
  month: string,
  year: number,
  selectedCompanyId?: string,
  filterByCompany?: (employeeId: string | undefined | null) => boolean,
): Promise<XLSX.WorkSheet> {
  // Roster + rates + entries all sourced via the shared resolver, which
  // mirrors the on-screen grid: RPC-resolved mapped roster, RPC-resolved
  // company_id filter, canonical 5-tier rate cascade. Fixes blank exports
  // for non-admin users on company-rate programs (Upendra / Metal Sizing).
  const { employees, entries, daysInMonth, effectiveRates } =
    await resolveDailyExportData(programId, month, year, {
      selectedCompanyId,
      filterByCompany: filterByCompany
        ? (id) => filterByCompany(id)
        : undefined,
    });

  const entryMap = new Map(entries.map((e) => [e.employee_id, e.daily_values || {}]));

  let sumTotal = 0;
  let sumAmount = 0;
  const rows = employees.map((p) => {
    const dailyVals: Record<string, any> = entryMap.get(p.id) || {};
    // Canonical cascade: employee → department → BU → company → common.
    const rate = effectiveRates.get(p.id) ?? 0;
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
    // Write the raw amount (no per-row Math.round). The grid SSOT
    // (ProductionDailyGrid.tsx → filteredGrandTotal) is sum-then-round;
    // per-row rounding here would diverge from the PMS Grand Total by a
    // few rupees over hundreds of rows (RCA: ADR-095). Excel cell format
    // still displays the integer rupee to the user.
    const amount = total * rate;
    row['Amount (₹)'] = amount;
    sumTotal += total;
    sumAmount += amount;
    return row;
  });

  // Append a Grand Total row using the EXACT same expression the grid uses,
  // guaranteeing the spreadsheet's bottom line equals the PMS Grand Total.
  if (rows.length) {
    rows.push({
      'Employee': 'Grand Total',
      'Code': '',
      'Designation': '',
      'Department': '',
      'Rate/Ton (₹)': '',
      'Total': sumTotal,
      'Amount (₹)': Math.round(sumAmount),
    });
  }

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
