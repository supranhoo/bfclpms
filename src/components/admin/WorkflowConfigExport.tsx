import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { getStageLabel, type WorkflowTemplate, type WorkflowConfig } from '@/hooks/useWorkflowConfig';

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  employee_code: string | null;
  pms_grade: string | null;
  department_id: string | null;
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
  const handleExport = () => {
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
      return {
        'Employee Name': p?.full_name || '—',
        'Employee Code': p?.employee_code || '—',
        'Email': p?.email || '—',
        'PMS Grade': p?.pms_grade || '—',
        'Department': p?.department_id ? (deptMap.get(p.department_id) || '—') : '—',
        'Assigned Template': tmpl?.display_name || '—',
        'Stages': tmpl ? formatStages(tmpl.stages) : '—',
        'Scope': c.review_period ? 'Period-Specific' : 'Global',
        'Review Period': c.review_period || '—',
        'Review Year': c.review_year ?? '—',
      };
    });
    const ws2 = XLSX.utils.aoa_to_sheet([]);
    addHeader(ws2, allTemplates.length, configs.length);
    XLSX.utils.sheet_add_json(ws2, empRows.length ? empRows : [{ 'Employee Name': 'No employee overrides configured' }], { origin: 'A4' });
    ws2['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 22 }, { wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];
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
      };
    });
    const ws3 = XLSX.utils.aoa_to_sheet([]);
    addHeader(ws3, allTemplates.length, configs.length);
    XLSX.utils.sheet_add_json(ws3, deptRows.length ? deptRows : [{ 'Department': 'No department assignments configured' }], { origin: 'A4' });
    ws3['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];
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
      };
    });
    const ws4 = XLSX.utils.aoa_to_sheet([]);
    addHeader(ws4, allTemplates.length, configs.length);
    XLSX.utils.sheet_add_json(ws4, gradeRows.length ? gradeRows : [{ 'PMS Grade': 'No PMS grade assignments configured' }], { origin: 'A4' });
    ws4['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 50 }, { wch: 16 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws4, 'PMS Grade Assignments');

    XLSX.writeFile(wb, `Workflow_Configuration_Report.xlsx`);
  };

  return (
    <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
      <Download className="h-4 w-4" />
      Export Report
    </Button>
  );
}
