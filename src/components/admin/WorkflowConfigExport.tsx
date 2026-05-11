import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getStageLabel, type WorkflowTemplate, type WorkflowConfig } from '@/hooks/useWorkflowConfig';
import { CHAIN_STAGES, CHAIN_STAGE_LABEL, NA_REASON_LABEL, buildResolverContext, resolveChain, type ResolverProfile } from '@/lib/workflowResolver';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { toast } from 'sonner';

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  employee_code: string | null;
  pms_grade: string | null;
  department_id: string | null;
  reporting_manager_id: string | null;
}

interface Department {
  id: string;
  name: string;
}

interface WorkflowConfigExportProps {
  templates: WorkflowTemplate[];
  archivedTemplates: WorkflowTemplate[];
  configs: WorkflowConfig[];
  profiles: Profile[];
  departments: Department[];
}

function formatStages(stages: string[]): string {
  return stages.map(s => getStageLabel(s)).join(' → ');
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

function getTemplateById(templates: WorkflowTemplate[], id: string) {
  return templates.find(t => t.id === id);
}

function addHeader(ws: XLSX.WorkSheet, totalTemplates: number, totalOverrides: number) {
  const now = new Date().toLocaleString();
  XLSX.utils.sheet_add_aoa(ws, [
    ['Workflow Configuration Report'],
    [`Generated: ${now} | Templates: ${totalTemplates} | Total Overrides: ${totalOverrides}`],
    [],
  ], { origin: 'A1' });
}

export function WorkflowConfigExport({
  templates,
  archivedTemplates,
  configs,
  profiles,
  departments,
}: WorkflowConfigExportProps) {
  const [busy, setBusy] = useState(false);

  const handleExport = async () => {
    setBusy(true);
    try {
    const allTemplates = [...templates, ...archivedTemplates];
    const templateMap = new Map(allTemplates.map(t => [t.id, t]));
    const deptMap = new Map(departments.map(d => [d.id, d.name]));
    const profileMap = new Map(profiles.map(p => [p.id, p]));

    const wb = XLSX.utils.book_new();

    // --- Sheet 1: Templates ---
    const templatesRows = allTemplates.map(t => ({
      'Template Name': t.display_name,
      'Description': t.description || '',
      'Stages': formatStages(t.stages),
      'Stage Count': t.stages.length,
      'Is Default': t.is_default ? 'Yes' : 'No',
      'Status': t.is_active ? 'Active' : 'Archived',
    }));
    const ws1 = XLSX.utils.aoa_to_sheet([]);
    addHeader(ws1, allTemplates.length, configs.length);
    XLSX.utils.sheet_add_json(ws1, templatesRows, { origin: 'A4' });
    ws1['!cols'] = [{ wch: 25 }, { wch: 35 }, { wch: 60 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Templates');

    // --- Sheet 2: Employee Overrides ---
    const empConfigs = configs.filter(c => c.config_type === 'employee');
    const empRows = empConfigs.map(c => {
      const p = profileMap.get(c.config_value);
      const tmpl = templateMap.get(c.workflow_template_id);
      const manager = p?.reporting_manager_id ? profileMap.get(p.reporting_manager_id) : null;
      const skipManager = manager?.reporting_manager_id ? profileMap.get(manager.reporting_manager_id) : null;
      return {
        'Employee Name': p?.full_name || '—',
        'Employee Code': p?.employee_code || '—',
        'Email': p?.email || '—',
        'PMS Grade': p?.pms_grade || '—',
        'Department': p?.department_id ? (deptMap.get(p.department_id) || '—') : '—',
        'Reporting Manager': manager?.full_name || '—',
        'Skip-Level Manager': skipManager?.full_name || '—',
        'Assigned Template': tmpl?.display_name || '—',
        'Stages': tmpl ? formatStages(tmpl.stages) : '—',
        'Scope': c.review_period ? 'Period-Specific' : 'Global',
        'Review Period': c.review_period || '—',
        'Review Year': c.review_year ?? '—',
        'Month': deriveMonth(c.review_period),
      };
    });
    const ws2 = XLSX.utils.aoa_to_sheet([]);
    addHeader(ws2, allTemplates.length, configs.length);
    XLSX.utils.sheet_add_json(ws2, empRows.length ? empRows : [{ 'Employee Name': 'No employee overrides configured' }], { origin: 'A4' });
    ws2['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Employee Overrides');

    // --- Sheet 3: Department Assignments ---
    const deptConfigs = configs.filter(c => c.config_type === 'department');
    const deptRows = deptConfigs.map(c => {
      const tmpl = templateMap.get(c.workflow_template_id);
      return {
        'Department': deptMap.get(c.config_value) || c.config_value,
        'Assigned Template': tmpl?.display_name || '—',
        'Stages': tmpl ? formatStages(tmpl.stages) : '—',
        'Scope': c.review_period ? 'Period-Specific' : 'Global',
        'Review Period': c.review_period || '—',
        'Review Year': c.review_year ?? '—',
        'Month': deriveMonth(c.review_period),
      };
    });
    const ws3 = XLSX.utils.aoa_to_sheet([]);
    addHeader(ws3, allTemplates.length, configs.length);
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
        'Assigned Template': tmpl?.display_name || '—',
        'Stages': tmpl ? formatStages(tmpl.stages) : '—',
        'Scope': c.review_period ? 'Period-Specific' : 'Global',
        'Review Period': c.review_period || '—',
        'Review Year': c.review_year ?? '—',
        'Month': deriveMonth(c.review_period),
      };
    });
    const ws4 = XLSX.utils.aoa_to_sheet([]);
    addHeader(ws4, allTemplates.length, configs.length);
    XLSX.utils.sheet_add_json(ws4, gradeRows.length ? gradeRows : [{ 'PMS Grade': 'No PMS grade assignments configured' }], { origin: 'A4' });
    ws4['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 12 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'PMS Grade Assignments');

    // --- Sheet 5: All Employees (Resolved) ---
    // Period-aware resolution requires a (period, year). Since this export sits
    // on /admin/workflow-config which has no global period selector, we resolve
    // GLOBAL templates only (no period-specific overrides) so the sheet always
    // produces something useful. The new in-app Workflow Resolution Report
    // (/reports/workflow-resolution) is the period-aware surface.
    try {
      const { data: roleRows } = await supabase.from('user_roles').select('user_id, role');
      const resolverProfiles: ResolverProfile[] = profiles.map(p => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        employee_code: p.employee_code,
        pms_grade: p.pms_grade,
        department_id: p.department_id,
        reporting_manager_id: p.reporting_manager_id,
        is_active: true,
      }));
      const ctx = buildResolverContext(resolverProfiles, (roleRows as any) || []);

      // Build per-employee global template (employee override > department > grade > default)
      const empOverride = new Map<string, string>();
      const deptOverride = new Map<string, string>();
      const gradeOverride = new Map<string, string>();
      for (const c of configs) {
        if (c.review_period) continue; // skip period-specific
        if (c.config_type === 'employee') empOverride.set(c.config_value, c.workflow_template_id);
        else if (c.config_type === 'department') deptOverride.set(c.config_value, c.workflow_template_id);
        else if (c.config_type === 'pms_grade') gradeOverride.set(c.config_value, c.workflow_template_id);
      }
      const defaultTpl = allTemplates.find(t => t.is_default && t.is_active) || allTemplates[0];

      const resolvedRows = resolverProfiles.map(p => {
        let tplId: string | undefined;
        let source: 'employee' | 'department' | 'pms_grade' | 'default' = 'default';
        if (empOverride.has(p.id)) { tplId = empOverride.get(p.id); source = 'employee'; }
        else if (p.department_id && deptOverride.has(p.department_id)) { tplId = deptOverride.get(p.department_id); source = 'department'; }
        else if (p.pms_grade && gradeOverride.has(p.pms_grade)) { tplId = gradeOverride.get(p.pms_grade); source = 'pms_grade'; }
        else { tplId = defaultTpl?.id; source = 'default'; }
        const tpl = tplId ? templateMap.get(tplId) : undefined;

        const chain = resolveChain(p, {
          templateId: tpl?.id ?? null,
          templateName: tpl?.display_name ?? null,
          stages: tpl?.stages ?? [],
          source,
        }, ctx);

        const cell = (st: any) => {
          const s = chain.stages[st];
          if (!s.inTemplate) return 'N/A — Stage not in template';
          if (s.naReason) return `N/A — ${NA_REASON_LABEL[s.naReason]}`;
          return s.users.map(u => u.full_name || u.email).join('; ');
        };

        return {
          'Employee Code': p.employee_code || '—',
          'Employee Name': p.full_name || p.email,
          'Department': p.department_id ? (deptMap.get(p.department_id) || '—') : '—',
          'PMS Grade': p.pms_grade || '—',
          'Resolved Template (Global)': tpl?.display_name || '—',
          'Source': source,
          ...Object.fromEntries(CHAIN_STAGES.map(s => [CHAIN_STAGE_LABEL[s], cell(s)])),
          'Has N/A': chain.hasAnyNa ? 'Yes' : 'No',
        };
      });

      const ws5 = XLSX.utils.aoa_to_sheet([]);
      addHeader(ws5, allTemplates.length, configs.length);
      XLSX.utils.sheet_add_json(ws5, resolvedRows.length ? resolvedRows : [{ 'Employee Code': 'No employees' }], { origin: 'A4' });
      ws5['!cols'] = [
        { wch: 14 }, { wch: 24 }, { wch: 20 }, { wch: 12 }, { wch: 24 }, { wch: 12 },
        { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 10 },
      ];
      XLSX.utils.book_append_sheet(wb, ws5, 'All Employees (Resolved)');
    } catch (e) {
      console.error('Failed to build resolved sheet', e);
      toast.error('Resolved-chain sheet skipped (see console). Other sheets exported.');
    }

    XLSX.writeFile(wb, `Workflow_Configuration_Report.xlsx`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={busy} className="gap-1.5">
      <Download className="h-4 w-4" />
      {busy ? 'Exporting…' : 'Export Report'}
    </Button>
  );
}
