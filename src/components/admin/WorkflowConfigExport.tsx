import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getStageLabel, type WorkflowTemplate, type WorkflowConfig } from '@/hooks/useWorkflowConfig';
import { buildResolverContext, type ResolverProfile } from '@/lib/workflowResolver';
import {
  buildEmployeeOverrideRows,
  buildResolvedEmployeeRows,
  unresolvedCount,
  formatStages,
  EM_DASH,
  type ExportConfig,
  type ExportTemplate,
} from '@/lib/reports/workflowConfigExportRows';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRpcPaged } from '@/lib/fetchAll';
import { useState } from 'react';
import { toast } from 'sonner';

interface Department {
  id: string;
  name: string;
}

interface WorkflowConfigExportProps {
  templates: WorkflowTemplate[];
  archivedTemplates: WorkflowTemplate[];
  configs: WorkflowConfig[];
  departments: Department[];
}

function deriveMonth(reviewPeriod: string | null | undefined): string {
  if (!reviewPeriod) return 'All Months';
  const p = reviewPeriod.trim();
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  if (months.includes(p)) return p;
  const qMap: Record<string, string> = { 'Q1': 'January–March', 'Q2': 'April–June', 'Q3': 'July–September', 'Q4': 'October–December' };
  if (qMap[p]) return qMap[p];
  const hMap: Record<string, string> = { 'H1': 'January–June', 'H2': 'July–December' };
  if (hMap[p]) return hMap[p];
  const biMonthly: Record<string, string> = {
    'Jan-Feb': 'January, February', 'Mar-Apr': 'March, April', 'May-Jun': 'May, June',
    'Jul-Aug': 'July, August', 'Sep-Oct': 'September, October', 'Nov-Dec': 'November, December',
  };
  if (biMonthly[p]) return biMonthly[p];
  return p;
}

function addHeader(
  ws: XLSX.WorkSheet,
  totalTemplates: number,
  totalOverrides: number,
  warning?: string,
) {
  const now = new Date().toLocaleString();
  XLSX.utils.sheet_add_aoa(ws, [
    ['Workflow Configuration Report'],
    [`Generated: ${now} | Templates: ${totalTemplates} | Total Overrides: ${totalOverrides}`],
    warning ? [warning] : [],
  ], { origin: 'A1' });
}

export function WorkflowConfigExport({
  templates,
  archivedTemplates,
  configs,
  departments,
}: WorkflowConfigExportProps) {
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    try {
      // ADR-214: the export fetches its own roster instead of relying on the
      // screen's in-flight profile query. Previously a click before that query
      // resolved produced a workbook where every employee cell printed "—".
      const [rosterRows, roleRes] = await Promise.all([
        fetchAllRpcPaged<any>((from, to) =>
          supabase.rpc('get_reviewer_roster_slim').range(from, to),
        ),
        supabase.from('user_roles').select('user_id, role'),
      ]);
      if (roleRes.error) throw roleRes.error;

      const profiles: ResolverProfile[] = (rosterRows || []).map((p: any) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        employee_code: p.employee_code,
        pms_grade: p.pms_grade,
        department_id: p.department_id,
        reporting_manager_id: p.reporting_manager_id,
        functional_manager_id: p.functional_manager_id ?? null,
        is_active: p.is_active !== false,
      }));

      // Fail loudly rather than emitting a placeholder-only workbook.
      if (profiles.length === 0) {
        toast.error('Employee directory could not be loaded — export cancelled. Please retry; if it persists your account may not have directory access.');
        return;
      }

      const allTemplates = [...templates, ...archivedTemplates];
      const templateMap = new Map<string, ExportTemplate>(
        allTemplates.map(t => [t.id, t as unknown as ExportTemplate]),
      );
      const deptMap = new Map(departments.map(d => [d.id, d.name]));
      const profilesById = new Map(profiles.map(p => [p.id, p]));
      const exportConfigs = configs as unknown as ExportConfig[];

      const missing = unresolvedCount(exportConfigs, profilesById);
      const warning = missing > 0
        ? `WARNING: ${missing} employee override row(s) could not be matched to a directory record and are flagged as "Unresolved".`
        : undefined;
      if (missing > 0) {
        toast.warning(`${missing} override row(s) could not be matched to an employee record — flagged in the file.`);
      }

      const wb = XLSX.utils.book_new();

      // --- Sheet 1: Templates ---
      const templatesRows = allTemplates.map(t => ({
        'Template Name': t.display_name,
        'Description': t.description || '',
        'Stages': formatStages(t.stages, getStageLabel),
        'Stage Count': t.stages.length,
        'Is Default': t.is_default ? 'Yes' : 'No',
        'Status': t.is_active ? 'Active' : 'Archived',
      }));
      const ws1 = XLSX.utils.aoa_to_sheet([]);
      addHeader(ws1, allTemplates.length, configs.length, warning);
      XLSX.utils.sheet_add_json(ws1, templatesRows, { origin: 'A4' });
      ws1['!cols'] = [{ wch: 25 }, { wch: 35 }, { wch: 60 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws1, 'Templates');

      // --- Sheet 2: Employee Overrides ---
      const empRows = buildEmployeeOverrideRows({
        configs: exportConfigs,
        profilesById,
        templatesById: templateMap,
        departmentsById: deptMap,
        stageLabel: getStageLabel,
        monthOf: deriveMonth,
      });
      const ws2 = XLSX.utils.aoa_to_sheet([]);
      addHeader(ws2, allTemplates.length, configs.length, warning);
      XLSX.utils.sheet_add_json(
        ws2,
        empRows.length ? empRows : [{ 'Employee Name': 'No employee overrides configured' }],
        { origin: 'A4' },
      );
      ws2['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Employee Overrides');

      // --- Sheet 3: Department Assignments ---
      const deptConfigs = configs.filter(c => c.config_type === 'department');
      const deptRows = deptConfigs.map(c => {
        const tmpl = templateMap.get(c.workflow_template_id);
        return {
          'Department': deptMap.get(c.config_value) || c.config_value,
          'Assigned Template': tmpl?.display_name || EM_DASH,
          'Stages': tmpl ? formatStages(tmpl.stages, getStageLabel) : EM_DASH,
          'Scope': c.review_period ? 'Period-Specific' : 'Global',
          'Review Period': c.review_period || EM_DASH,
          'Review Year': c.review_year ?? EM_DASH,
          'Month': deriveMonth(c.review_period),
        };
      });
      const ws3 = XLSX.utils.aoa_to_sheet([]);
      addHeader(ws3, allTemplates.length, configs.length, warning);
      XLSX.utils.sheet_add_json(ws3, deptRows.length ? deptRows : [{ 'Department': 'No department assignments configured' }], { origin: 'A4' });
      ws3['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws3, 'Department Assignments');

      // --- Sheet 4: PMS Grade Assignments ---
      const gradeConfigs = configs.filter(c => c.config_type === 'pms_grade');
      const gradeRows = gradeConfigs.map(c => {
        const tmpl = templateMap.get(c.workflow_template_id);
        const empCount = profiles.filter(p => p.pms_grade === c.config_value).length;
        return {
          'PMS Grade': c.config_value,
          'Employee Count': empCount,
          'Assigned Template': tmpl?.display_name || EM_DASH,
          'Stages': tmpl ? formatStages(tmpl.stages, getStageLabel) : EM_DASH,
          'Scope': c.review_period ? 'Period-Specific' : 'Global',
          'Review Period': c.review_period || EM_DASH,
          'Review Year': c.review_year ?? EM_DASH,
          'Month': deriveMonth(c.review_period),
        };
      });
      const ws4 = XLSX.utils.aoa_to_sheet([]);
      addHeader(ws4, allTemplates.length, configs.length, warning);
      XLSX.utils.sheet_add_json(ws4, gradeRows.length ? gradeRows : [{ 'PMS Grade': 'No PMS grade assignments configured' }], { origin: 'A4' });
      ws4['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
      XLSX.utils.book_append_sheet(wb, ws4, 'PMS Grade Assignments');

      // --- Sheet 5: All Employees (Resolved) ---
      // Global templates only; the period-aware surface is
      // /reports/workflow-resolution.
      const ctx = buildResolverContext(profiles, (roleRes.data as any) || []);
      const defaultTpl = templateMap.get(
        (allTemplates.find(t => t.is_default && t.is_active) || allTemplates[0])?.id ?? '',
      );
      const resolvedRows = buildResolvedEmployeeRows({
        profiles,
        configs: exportConfigs,
        templatesById: templateMap,
        departmentsById: deptMap,
        defaultTemplate: defaultTpl,
        ctx,
      });
      const ws5 = XLSX.utils.aoa_to_sheet([]);
      addHeader(ws5, allTemplates.length, configs.length, warning);
      XLSX.utils.sheet_add_json(ws5, resolvedRows.length ? resolvedRows : [{ 'Employee Code': 'No employees' }], { origin: 'A4' });
      ws5['!cols'] = [
        { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 20 }, { wch: 12 }, { wch: 24 }, { wch: 12 },
        { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 10 },
      ];
      XLSX.utils.book_append_sheet(wb, ws5, 'All Employees (Resolved)');

      XLSX.writeFile(wb, `Workflow_Configuration_Report.xlsx`);
    } catch (e) {
      console.error('Workflow configuration export failed', e);
      toast.error(`Export failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={busy} className="gap-1.5">
      <Download className="h-4 w-4" />
      {busy ? 'Preparing…' : 'Export Report'}
    </Button>
  );
}
