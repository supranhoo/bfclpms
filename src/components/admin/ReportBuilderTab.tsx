import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useCustomReports, useCreateCustomReport, useUpdateCustomReport, useDeleteCustomReport, CustomReport } from '@/hooks/useCustomReports';
import { ReportSequenceConfig } from './ReportSequenceConfig';
import { ReportFieldPicker } from './ReportFieldPicker';
import { ReportFilterConfig } from './ReportFilterConfig';
import { ALL_APP_ROLES } from '@/lib/roles';
import { Plus, Pencil, Trash2, FileText, GripVertical, Eye, EyeOff } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

const ICON_OPTIONS = ['FileText', 'BarChart3', 'Users', 'TrendingUp', 'Table2', 'Grid3X3', 'ClipboardList', 'Workflow', 'AlertTriangle', 'GraduationCap'];
const COLOR_OPTIONS = [
  { label: 'Primary', value: 'text-primary' },
  { label: 'Blue', value: 'text-blue-500' },
  { label: 'Green', value: 'text-green-500' },
  { label: 'Purple', value: 'text-purple-500' },
  { label: 'Orange', value: 'text-orange-500' },
  { label: 'Rose', value: 'text-rose-500' },
  { label: 'Teal', value: 'text-teal-500' },
  { label: 'Amber', value: 'text-amber-500' },
  { label: 'Indigo', value: 'text-indigo-500' },
  { label: 'Cyan', value: 'text-cyan-500' },
];

interface ReportFormData {
  name: string;
  description: string;
  icon: string;
  color: string;
  category: string;
  columns: { key: string; alias?: string; width?: string }[];
  filters: { field: string; operator: string; value: string; user_selectable?: boolean }[];
  view_roles: string[];
  export_excel: boolean;
  export_pdf: boolean;
  is_active: boolean;
}

const DEFAULT_FORM: ReportFormData = {
  name: '',
  description: '',
  icon: 'FileText',
  color: 'text-primary',
  category: 'Custom',
  columns: [],
  filters: [],
  view_roles: ['admin'],
  export_excel: true,
  export_pdf: false,
  is_active: true,
};

export function ReportBuilderTab() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Report Builder</h2>
        <p className="text-sm text-muted-foreground">Create custom reports, reorder the Reports Hub, and customize pre-built report columns</p>
      </div>

      <Tabs defaultValue="custom" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sequence">Report Sequence</TabsTrigger>
          <TabsTrigger value="customize">Customize Columns</TabsTrigger>
          <TabsTrigger value="custom">Custom Reports</TabsTrigger>
        </TabsList>

        <TabsContent value="sequence" className="mt-4">
          <ReportSequenceConfig />
        </TabsContent>

        <TabsContent value="customize" className="mt-4">
          <PreBuiltCustomization />
        </TabsContent>

        <TabsContent value="custom" className="mt-4">
          <CustomReportsCRUD />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Pre-built report column customization (placeholder with guidance) ──
function PreBuiltCustomization() {
  const PREBUILT_REPORTS = [
    { key: 'employee-summary', label: 'Employee Performance Summary' },
    { key: 'performance', label: 'Performance Report' },
    { key: 'monthly-scorecard', label: 'Monthly Scorecard' },
    { key: 'kra-issuance', label: 'KRA Issuance Report' },
    { key: 'queries', label: 'Query Report' },
    { key: 'issues', label: 'Unified Issues Report' },
    { key: 'completion', label: 'Completion Rate Report' },
    { key: 'department', label: 'Department Summary' },
    { key: 'audit-trail', label: 'Audit Trail Report' },
    { key: 'tni', label: 'Training Needs (TNI)' },
    { key: 'kpi-detail', label: 'KPI Detail Report' },
    { key: 'bottleneck', label: 'Workflow Bottleneck Report' },
    { key: 'kpi-status-tracker', label: 'KPI Status Tracker' },
    { key: 'kpi-journey', label: 'KPI Journey Timeline' },
    { key: 'variance', label: 'Variance Report' },
    { key: 'manager-team-kpi', label: 'Same KPI — Manager vs Team' },
    { key: 'team-vs-manager-score', label: 'Team Vs Manager Monthly Score' },
    { key: 'kpi-scorecard-detail', label: 'KPI Scorecard Detail' },
    { key: 'kpi-employee-matrix', label: 'KPI-Employee Score Matrix' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pre-built Report Column Customization</CardTitle>
        <CardDescription>Add, remove, or reorder columns in existing reports. Changes are saved per report.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {PREBUILT_REPORTS.map(report => (
            <Card key={report.key} className="p-3 hover:bg-muted/50 cursor-pointer transition-colors">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{report.label}</span>
                <Badge variant="outline" className="text-xs">Configure</Badge>
              </div>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Column customization for pre-built reports will be available in a future update. Custom reports with full field selection are available now.
        </p>
      </CardContent>
    </Card>
  );
}

// ── Custom Reports CRUD ──
function CustomReportsCRUD() {
  const { data: reports = [], isLoading } = useCustomReports();
  const createReport = useCreateCustomReport();
  const updateReport = useUpdateCustomReport();
  const deleteReport = useDeleteCustomReport();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState<CustomReport | null>(null);
  const [form, setForm] = useState<ReportFormData>(DEFAULT_FORM);
  const [activeStep, setActiveStep] = useState<'details' | 'fields' | 'filters'>('details');

  const openCreate = () => {
    setEditingReport(null);
    setForm(DEFAULT_FORM);
    setActiveStep('details');
    setDialogOpen(true);
  };

  const openEdit = (report: CustomReport) => {
    setEditingReport(report);
    setForm({
      name: report.name,
      description: report.description || '',
      icon: report.icon,
      color: report.color,
      category: report.category || 'Custom',
      columns: report.columns || [],
      filters: report.filters || [],
      view_roles: report.view_roles || ['admin'],
      export_excel: report.export_excel,
      export_pdf: report.export_pdf,
      is_active: report.is_active,
    });
    setActiveStep('details');
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!form.name.trim()) {
      toast({ title: 'Validation Error', description: 'Report name is required.', variant: 'destructive' });
      return;
    }
    if (form.columns.length === 0) {
      toast({ title: 'Validation Error', description: 'Select at least one field for the report.', variant: 'destructive' });
      return;
    }

    if (editingReport) {
      updateReport.mutate({
        id: editingReport.id,
        name: form.name,
        description: form.description || null,
        icon: form.icon,
        color: form.color,
        category: form.category,
        columns: form.columns,
        filters: form.filters,
        view_roles: form.view_roles,
        export_excel: form.export_excel,
        export_pdf: form.export_pdf,
        is_active: form.is_active,
      }, { onSuccess: () => setDialogOpen(false) });
    } else {
      createReport.mutate({
        name: form.name,
        description: form.description || null,
        icon: form.icon,
        color: form.color,
        category: form.category,
        columns: form.columns,
        filters: form.filters,
        view_roles: form.view_roles,
        export_excel: form.export_excel,
        export_pdf: form.export_pdf,
        is_active: form.is_active,
      }, { onSuccess: () => setDialogOpen(false) });
    }
  };

  const [deletingReportId, setDeletingReportId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    setDeletingReportId(id);
  };

  const confirmDelete = () => {
    if (!deletingReportId) return;
    deleteReport.mutate(deletingReportId, {
      onSuccess: () => setDeletingReportId(null),
    });
  };

  const toggleActive = (report: CustomReport) => {
    updateReport.mutate({ id: report.id, is_active: !report.is_active });
  };

  const toggleRole = (role: string) => {
    setForm(prev => ({
      ...prev,
      view_roles: prev.view_roles.includes(role)
        ? prev.view_roles.filter(r => r !== role)
        : [...prev.view_roles, role],
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Custom Reports</h3>
          <p className="text-sm text-muted-foreground">Create dynamic reports by selecting fields from system data sources</p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" /> New Report
        </Button>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-8 text-center">Loading reports...</div>
      ) : reports.length === 0 ? (
        <Card className="p-8 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No custom reports yet. Click "New Report" to create one.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {reports.map(report => (
            <Card key={report.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{report.name}</span>
                      <Badge variant={report.is_active ? 'default' : 'secondary'} className="text-xs">
                        {report.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{report.columns?.length || 0} fields</Badge>
                    </div>
                    {report.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{report.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => toggleActive(report)} title={report.is_active ? 'Deactivate' : 'Activate'}>
                    {report.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(report)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(report.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingReport ? 'Edit Report' : 'Create Custom Report'}</DialogTitle>
          </DialogHeader>

          <Tabs value={activeStep} onValueChange={(v) => setActiveStep(v as any)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="fields">Fields ({form.columns.length})</TabsTrigger>
              <TabsTrigger value="filters">Filters ({form.filters.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Report Name *</Label>
                  <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Monthly Score Overview" />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="e.g. Custom, HR, Compliance" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Brief description of the report" rows={2} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Icon</Label>
                  <Select value={form.icon} onValueChange={v => setForm(p => ({ ...p, icon: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ICON_OPTIONS.map(icon => (
                        <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Color</Label>
                  <Select value={form.color} onValueChange={v => setForm(p => ({ ...p, color: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COLOR_OPTIONS.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Visible to Roles</Label>
                <div className="flex flex-wrap gap-2">
                  {ALL_APP_ROLES.map(role => (
                    <Badge
                      key={role}
                      variant={form.view_roles.includes(role) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleRole(role)}
                    >
                      {role}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Switch checked={form.export_excel} onCheckedChange={v => setForm(p => ({ ...p, export_excel: v }))} />
                  <Label>Excel Export</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.export_pdf} onCheckedChange={v => setForm(p => ({ ...p, export_pdf: v }))} />
                  <Label>PDF Export</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={form.is_active} onCheckedChange={v => setForm(p => ({ ...p, is_active: v }))} />
                  <Label>Active</Label>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="fields" className="mt-4">
              <ReportFieldPicker
                selectedColumns={form.columns}
                onChange={(cols) => setForm(p => ({ ...p, columns: cols }))}
              />
            </TabsContent>

            <TabsContent value="filters" className="mt-4">
              <ReportFilterConfig
                filters={form.filters}
                onChange={(filters) => setForm(p => ({ ...p, filters }))}
              />
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={createReport.isPending || updateReport.isPending}>
              {(createReport.isPending || updateReport.isPending) ? 'Saving...' : editingReport ? 'Update Report' : 'Create Report'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
