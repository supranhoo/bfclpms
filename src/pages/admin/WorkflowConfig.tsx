import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { fetchAllPaged } from '@/lib/fetchAll';
import { 
  useWorkflowTemplates, 
  useWorkflowConfigs, 
  useUpsertWorkflowConfig, 
  useDeleteWorkflowConfig,
  useDeleteWorkflowTemplate,
  useSetDefaultWorkflowTemplate,
  useArchiveWorkflowTemplate,
  useRestoreWorkflowTemplate,
  useUpdateBatchOngoing,
  getStageLabel,
  type WorkflowTemplate,
} from '@/hooks/useWorkflowConfig';
import { useDepartments } from '@/hooks/useOrganization';
import { GitBranch, Users, Building2, Award, Trash2, Search, ArrowRight, Check, Plus, Pencil, Star, Archive, RotateCcw, ChevronDown, Calendar, Globe, ChevronsRight, Info } from 'lucide-react';
import { Scale } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ReviewPanelSkeleton } from '@/components/ui/LoadingSkeletons';
import CustomWorkflowDialog from '@/components/admin/CustomWorkflowDialog';
import ReconcileOrphanedKpisDialog from '@/components/admin/ReconcileOrphanedKpisDialog';
import { WorkflowConfigExport } from '@/components/admin/WorkflowConfigExport';
import MigrateGlobalDefaultsDialog from '@/components/admin/MigrateGlobalDefaultsDialog';
import { FinalScoreRulesTab } from '@/components/admin/FinalScoreRulesTab';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// Stage color mapping
const stageColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  manager_check: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300',
  audit: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
  admin_review: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  management_review: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
};

function WorkflowStagesPreview({ stages }: { stages: string[] }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {stages.map((stage, index) => (
        <div key={stage} className="flex items-center gap-1">
          <Badge variant="outline" className={`text-xs ${stageColors[stage] || ''}`}>
            {getStageLabel(stage)}
          </Badge>
          {index < stages.length - 1 && (
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
          )}
        </div>
      ))}
    </div>
  );
}

export default function WorkflowConfig() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('templates');
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<WorkflowTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowTemplate | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<WorkflowTemplate | null>(null);
  const [archivedOpen, setArchivedOpen] = useState(false);
  const [isOngoing, setIsOngoing] = useState(false);
  const [showPmsGradeColumn, setShowPmsGradeColumn] = useState(false);
  const [employeePage, setEmployeePage] = useState(1);
  const PAGE_SIZE = 50;

  // Period selector state: 'global' or specific period
  const currentYear = new Date().getFullYear();
  // Default to 'specific'. 'global' is now read-only legacy fallback view only.
  const [periodMode, setPeriodMode] = useState<'global' | 'specific'>('specific');
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const years = [currentYear - 1, currentYear, currentYear + 1];
  const [migrateOpen, setMigrateOpen] = useState(false);

  const { data: allTemplates, isLoading: templatesLoading } = useWorkflowTemplates(true);
  const { data: configs, isLoading: configsLoading } = useWorkflowConfigs();
  const { data: departments } = useDepartments();
  const upsertConfig = useUpsertWorkflowConfig();
  const deleteConfig = useDeleteWorkflowConfig();
  const deleteTemplate = useDeleteWorkflowTemplate();
  const setDefaultTemplate = useSetDefaultWorkflowTemplate();
  const archiveTemplate = useArchiveWorkflowTemplate();
  const restoreTemplate = useRestoreWorkflowTemplate();
  const batchUpdateOngoing = useUpdateBatchOngoing();
  
  // Split templates into active and archived
  const templates = useMemo(() => allTemplates?.filter(t => t.is_active) || [], [allTemplates]);
  const archivedTemplates = useMemo(() => allTemplates?.filter(t => !t.is_active) || [], [allTemplates]);

  // Helper to convert month name to index for comparison
  const monthIndex = useCallback((m: string) => MONTHS.indexOf(m) + 1, []);

  // Filter configs based on period selection
  const filteredConfigs = useMemo(() => {
    if (!configs) return [];
    if (periodMode === 'global') {
      return configs.filter(c => !c.review_period);
    }
    // Exact match for the selected period
    const exactConfigs = configs.filter(c => c.review_period === selectedMonth && c.review_year === selectedYear);
    // Ongoing configs effective for this period (from earlier months)
    const selectedSortKey = selectedYear * 100 + monthIndex(selectedMonth);
    const ongoingConfigs = configs.filter(c => {
      if (!c.is_ongoing || !c.review_period || !c.review_year) return false;
      // Exclude exact matches (already included above)
      if (c.review_period === selectedMonth && c.review_year === selectedYear) return false;
      const configSortKey = c.review_year * 100 + monthIndex(c.review_period);
      if (configSortKey > selectedSortKey) return false;
      // Check if there's an exact config or a later ongoing config that supersedes it
      const hasExact = exactConfigs.some(e => e.config_type === c.config_type && e.config_value === c.config_value);
      if (hasExact) return false;
      // Check if a later ongoing config supersedes this one
      const hasLaterOngoing = configs.some(later => {
        if (!later.is_ongoing || !later.review_period || !later.review_year) return false;
        if (later.config_type !== c.config_type || later.config_value !== c.config_value) return false;
        if (later.id === c.id) return false;
        const laterKey = later.review_year * 100 + monthIndex(later.review_period);
        return laterKey > configSortKey && laterKey <= selectedSortKey;
      });
      return !hasLaterOngoing;
    });
    return [...exactConfigs, ...ongoingConfigs];
  }, [configs, periodMode, selectedMonth, selectedYear, monthIndex]);

  // Also get global configs for showing "inherited" indicators when in period mode
  const globalConfigs = useMemo(() => {
    if (!configs) return [];
    return configs.filter(c => !c.review_period);
  }, [configs]);
  
  // Fetch all profiles for employee tab
  const { data: profiles } = useQuery({
    queryKey: ['all-profiles-workflow'],
    queryFn: async () => {
      // Use paged fetch to bypass PostgREST's 1000-row default cap (~2,533 employees)
      return await fetchAllPaged<any>((from, to) =>
        supabase
          .from('profiles')
          .select('id, full_name, email, employee_code, pms_grade, department_id, reporting_manager_id, functional_manager_id')
          .order('full_name')
          .range(from, to)
      );
    },
  });
  
  // Get unique PMS grades
  const pmsGrades = useMemo(() => {
    if (!profiles) return [];
    const grades = profiles
      .map(p => p.pms_grade)
      .filter((g): g is string => !!g);
    return [...new Set(grades)].sort();
  }, [profiles]);
  
  // Filter employees by search
  const filteredProfiles = useMemo(() => {
    if (!profiles) return [];
    if (!employeeSearch) return profiles;
    const search = employeeSearch.toLowerCase();
    return profiles.filter(p => 
      p.full_name?.toLowerCase().includes(search) ||
      p.email?.toLowerCase().includes(search) ||
      p.employee_code?.toLowerCase().includes(search)
    );
  }, [profiles, employeeSearch]);

  // Reset to page 1 when search changes
  useMemo(() => { setEmployeePage(1); }, [employeeSearch]);

  const totalPages = Math.max(1, Math.ceil((filteredProfiles?.length || 0) / PAGE_SIZE));
  const safePage = Math.min(employeePage, totalPages);
  const pagedProfiles = useMemo(
    () => filteredProfiles.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredProfiles, safePage]
  );

  // FM mapping coverage — surfaced as a banner inside the Employee tab so
  // admins are warned when templates include the Functional Manager stage
  // but employees lack a functional_manager_id (the stage would resolve to
  // N/A — `no_functional_manager_on_profile`).
  const fmTemplatesCount = useMemo(
    () => (templates || []).filter(t => t.stages?.includes('functional_manager_check')).length,
    [templates],
  );
  const employeesMissingFm = useMemo(
    () => (profiles || []).filter(p => !p.functional_manager_id).length,
    [profiles],
  );
  const startIdx = filteredProfiles.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(safePage * PAGE_SIZE, filteredProfiles.length);
  
  // Helper to get config for a specific type and value (from filtered configs)
  const getConfigFor = (type: string, value: string) => {
    return filteredConfigs.find(c => c.config_type === type && c.config_value === value);
  };

  // Helper to get global config for showing inherited badge
  const getGlobalConfigFor = (type: string, value: string) => {
    return globalConfigs.find(c => c.config_type === type && c.config_value === value);
  };
  
  // Helper to get template by id
  const getTemplate = (id: string) => {
    return templates?.find(t => t.id === id);
  };
  
  // Handle workflow assignment
  const handleAssignWorkflow = async (
    configType: 'employee' | 'department' | 'pms_grade',
    configValue: string,
    templateId: string
  ) => {
    if (periodMode !== 'specific') {
      toast({
        title: 'Read-only legacy view',
        description: 'New workflow mappings must be Period-Specific. Switch Scope to "Specific Period" first.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await upsertConfig.mutateAsync({
        configType,
        configValue,
        workflowTemplateId: templateId,
        reviewPeriod: selectedMonth,
        reviewYear: selectedYear,
        isOngoing,
      });
      toast({
        title: 'Workflow assigned',
        description: isOngoing
          ? `Workflow assigned from ${selectedMonth} ${selectedYear} onward.`
          : `Workflow assigned for ${selectedMonth} ${selectedYear}.`,
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to assign workflow.',
        variant: 'destructive',
      });
    }
  };
  
  // Handle config removal
  const handleRemoveConfig = async (configId: string) => {
    try {
      await deleteConfig.mutateAsync(configId);
      toast({
        title: 'Configuration removed',
        description: 'The workflow will now inherit from a higher level.',
      });
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to remove configuration.',
        variant: 'destructive',
      });
    }
  };
  
  if (templatesLoading || configsLoading) {
    return <ReviewPanelSkeleton />;
  }

  // Render inherited/ongoing badge when in period mode
  const renderInheritedBadge = (type: string, value: string) => {
    if (periodMode !== 'specific') return null;
    const periodConfig = getConfigFor(type, value);
    const globalConfig = getGlobalConfigFor(type, value);
    if (!periodConfig && globalConfig) {
      const tmpl = getTemplate(globalConfig.workflow_template_id);
      return (
        <div className="mt-1">
          <Badge variant="outline" className="text-xs gap-1">
            <Globe className="h-3 w-3" />
            Inherits: {tmpl?.display_name || 'Global'}
          </Badge>
        </div>
      );
    }
    if (periodConfig) {
      const isOngoingConfig = (periodConfig as any).is_ongoing;
      const isInherited = periodConfig.review_period !== selectedMonth || periodConfig.review_year !== selectedYear;
      if (isInherited && isOngoingConfig) {
        return (
          <Badge variant="outline" className="text-xs gap-1 mt-1 border-primary/50 text-primary">
            <ChevronsRight className="h-3 w-3" />
            Ongoing from {periodConfig.review_period} {periodConfig.review_year} →
          </Badge>
        );
      }
      if (isOngoingConfig) {
        return (
          <Badge variant="secondary" className="text-xs gap-1 mt-1">
            <ChevronsRight className="h-3 w-3" />
            Ongoing from {selectedMonth} {selectedYear} →
          </Badge>
        );
      }
      return (
        <Badge variant="secondary" className="text-xs gap-1 mt-1">
          <Calendar className="h-3 w-3" />
          {selectedMonth} {selectedYear} only
        </Badge>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Workflow Configuration</h1>
          <p className="text-muted-foreground">
            Configure review workflows per employee, department, or PMS grade for a specific review period.
          </p>
        </div>
        <Button variant="outline" onClick={() => setMigrateOpen(true)}>
          <GitBranch className="h-4 w-4 mr-1" />
          Convert Global Defaults to Period-Specific
        </Button>
      </div>
      <MigrateGlobalDefaultsDialog open={migrateOpen} onOpenChange={setMigrateOpen} />

      <Alert className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4 text-primary" />
        <AlertDescription className="text-sm">
          Changing workflow templates will automatically reconcile any in-flight KPIs for affected employees in the selected period.
        </AlertDescription>
      </Alert>
      
      {/* Priority explanation */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Priority Cascade
          </CardTitle>
          <CardDescription>
            {periodMode === 'specific' 
              ? `Workflows are resolved for the selected review period in this order: Employee > Department > PMS Grade > Period Default`
              : `Legacy fallback view (read-only). New mappings must be Period-Specific.`
            }
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Period Selector */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium whitespace-nowrap">Scope:</span>
            </div>
            <Select value={periodMode} onValueChange={(v) => setPeriodMode(v as 'global' | 'specific')}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">
                  <span className="flex items-center gap-2">
                    <Globe className="h-3.5 w-3.5" />
                    Legacy Fallback (read-only)
                  </span>
                </SelectItem>
                <SelectItem value="specific">
                  <span className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" />
                    Specific Period
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {periodMode === 'specific' && (
              <div className="flex gap-2">
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                  <SelectTrigger className="w-[90px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map(y => (
                      <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {periodMode === 'specific' && (
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isOngoing}
                    onChange={(e) => {
                      const newVal = e.target.checked;
                      setIsOngoing(newVal);
                      // Batch-update existing configs for this period
                      const periodConfigs = (configs || []).filter(
                        c => c.review_period === selectedMonth && c.review_year === selectedYear
                      );
                      if (periodConfigs.length > 0) {
                        batchUpdateOngoing.mutate(
                          { reviewPeriod: selectedMonth, reviewYear: selectedYear, isOngoing: newVal },
                          {
                            onSuccess: (data) => {
                              toast({
                                title: newVal ? 'Ongoing enabled' : 'Ongoing disabled',
                                description: `Updated ${data?.length || 0} config(s) for ${selectedMonth} ${selectedYear}`,
                              });
                            },
                            onError: (err: any) => {
                              toast({ title: 'Error', description: err.message, variant: 'destructive' });
                            },
                          }
                        );
                      }
                    }}
                    className="rounded border-border"
                  />
                  <span className="text-sm text-muted-foreground whitespace-nowrap flex items-center gap-1">
                    <ChevronsRight className="h-3.5 w-3.5" />
                    Apply from this month onward
                  </span>
                </label>
              </div>
            )}
            {periodMode === 'specific' && (
              <Badge variant="outline" className="text-xs">
                {isOngoing 
                  ? `Ongoing from ${selectedMonth} ${selectedYear} →`
                  : `Showing overrides for ${selectedMonth} ${selectedYear}`
                }
              </Badge>
            )}
            <div className="ml-auto flex items-center gap-2">
              <WorkflowConfigExport
                templates={templates}
                archivedTemplates={archivedTemplates}
                configs={configs || []}
                profiles={profiles || []}
                departments={departments || []}
              />
              <ReconcileOrphanedKpisDialog
                periodMode={periodMode}
                selectedMonth={selectedMonth}
                selectedYear={selectedYear}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="templates">
            <Check className="h-4 w-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="employee">
            <Users className="h-4 w-4 mr-2" />
            Per Employee
          </TabsTrigger>
          <TabsTrigger value="department">
            <Building2 className="h-4 w-4 mr-2" />
            Per Department
          </TabsTrigger>
          <TabsTrigger value="pms_grade">
            <Award className="h-4 w-4 mr-2" />
            Per PMS Grade
          </TabsTrigger>
          <TabsTrigger value="final_score_rules">
            <Scale className="h-4 w-4 mr-2" />
            Final Score Rules
          </TabsTrigger>
        </TabsList>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Available Workflow Templates</CardTitle>
                  <CardDescription>
                    Predefined and custom workflows that can be assigned
                  </CardDescription>
                </div>
                <Button onClick={() => { setEditingTemplate(null); setDialogOpen(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Custom Template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {templates?.map(template => (
                  <Card key={template.id} className={template.is_default ? 'border-primary' : ''}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold">{template.display_name}</h3>
                            {template.is_default && (
                              <Badge variant="secondary">Default</Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setEditingTemplate(template); setDialogOpen(true); }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {!template.is_default && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Set as Default"
                                disabled={setDefaultTemplate.isPending}
                                onClick={async () => {
                                  try {
                                    await setDefaultTemplate.mutateAsync(template.id);
                                    toast({
                                      title: 'Default updated',
                                      description: 'This only affects employees inheriting the default workflow.',
                                    });
                                  } catch {
                                    toast({ title: 'Error', description: 'Failed to set default.', variant: 'destructive' });
                                  }
                                }}
                              >
                                <Star className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Archive template"
                                onClick={() => setArchiveTarget(template)}
                              >
                                <Archive className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <WorkflowStagesPreview stages={template.stages} />
                    </CardContent>
                  </Card>
                ))}

                {/* Archived Templates Section */}
                {archivedTemplates.length > 0 && (
                  <Collapsible open={archivedOpen} onOpenChange={setArchivedOpen}>
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" className="w-full justify-between mt-4">
                        <span className="text-sm text-muted-foreground">
                          Archived Templates ({archivedTemplates.length})
                        </span>
                        <ChevronDown className={`h-4 w-4 transition-transform ${archivedOpen ? 'rotate-180' : ''}`} />
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4 mt-2">
                      {archivedTemplates.map(template => (
                        <Card key={template.id} className="opacity-70 border-dashed">
                          <CardContent className="pt-4">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <h3 className="font-semibold">{template.display_name}</h3>
                                  <Badge variant="outline">Archived</Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">{template.description}</p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Restore template"
                                  onClick={async () => {
                                    try {
                                      await restoreTemplate.mutateAsync(template.id);
                                      toast({ title: 'Template restored' });
                                    } catch (err: any) {
                                      toast({ title: 'Error', description: err?.message || 'Failed to restore.', variant: 'destructive' });
                                    }
                                  }}
                                >
                                  <RotateCcw className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Permanently delete"
                                  onClick={() => setDeleteTarget(template)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                            <WorkflowStagesPreview stages={template.stages} />
                          </CardContent>
                        </Card>
                      ))}
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Employee Tab */}
        <TabsContent value="employee" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Employee Workflow Overrides</CardTitle>
              <CardDescription>
                Assign specific workflows to individual employees (highest priority)
                {periodMode === 'specific' && ` — showing overrides for ${selectedMonth} ${selectedYear}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search employees..."
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="show-pms-grade"
                    checked={showPmsGradeColumn}
                    onCheckedChange={setShowPmsGradeColumn}
                  />
                  <Label htmlFor="show-pms-grade" className="text-sm cursor-pointer whitespace-nowrap">
                    Show PMS Grade
                  </Label>
                </div>
              </div>

              {fmTemplatesCount > 0 && employeesMissingFm > 0 && (
                <Alert variant="default" className="mb-4 border-amber-500/40 bg-amber-500/5">
                  <Info className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-sm">
                    <span className="font-medium">{employeesMissingFm}</span> employee
                    {employeesMissingFm === 1 ? '' : 's'} have no Functional Manager assigned.{' '}
                    {fmTemplatesCount} active template{fmTemplatesCount === 1 ? '' : 's'} include
                    the Functional Manager review stage — that stage will resolve to
                    <span className="font-mono text-xs mx-1">N/A</span>
                    for these employees. Assign a Functional Manager from User Management to enable the stage.
                  </AlertDescription>
                </Alert>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Code</TableHead>
                    {showPmsGradeColumn && <TableHead>PMS Grade</TableHead>}
                    <TableHead>Assigned Workflow</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedProfiles.map(profile => {
                    const config = getConfigFor('employee', profile.id);
                    const template = config ? getTemplate(config.workflow_template_id) : null;
                    
                    return (
                      <TableRow key={profile.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{profile.full_name}</div>
                            <div className="text-sm text-muted-foreground">{profile.email}</div>
                          </div>
                        </TableCell>
                        <TableCell>{profile.employee_code || '-'}</TableCell>
                        {showPmsGradeColumn && <TableCell>{profile.pms_grade || '-'}</TableCell>}
                        <TableCell>
                          <Select
                            value={config?.workflow_template_id || ''}
                            onValueChange={(value) => handleAssignWorkflow('employee', profile.id, value)}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Inherit (default)" />
                            </SelectTrigger>
                            <SelectContent>
                              {templates?.map(t => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.display_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {template && (
                            <div className="mt-1">
                              <WorkflowStagesPreview stages={template.stages} />
                            </div>
                          )}
                          {renderInheritedBadge('employee', profile.id)}
                        </TableCell>
                        <TableCell>
                          {config && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveConfig(config.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4">
                <p className="text-sm text-muted-foreground">
                  {filteredProfiles.length === 0
                    ? 'No employees found'
                    : `Showing ${startIdx}–${endIdx} of ${filteredProfiles.length} employee${filteredProfiles.length === 1 ? '' : 's'}`}
                  {employeeSearch && filteredProfiles.length > 0 && ` (${filteredProfiles.length} match${filteredProfiles.length === 1 ? '' : 'es'})`}
                </p>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEmployeePage(p => Math.max(1, p - 1))}
                      disabled={safePage === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {safePage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEmployeePage(p => Math.min(totalPages, p + 1))}
                      disabled={safePage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Department Tab */}
        <TabsContent value="department" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Department Workflows</CardTitle>
              <CardDescription>
                Assign workflows to entire departments
                {periodMode === 'specific' && ` — showing overrides for ${selectedMonth} ${selectedYear}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Department</TableHead>
                    <TableHead>Assigned Workflow</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments?.map(dept => {
                    const config = getConfigFor('department', dept.id);
                    const template = config ? getTemplate(config.workflow_template_id) : null;
                    
                    return (
                      <TableRow key={dept.id}>
                        <TableCell className="font-medium">{dept.name}</TableCell>
                        <TableCell>
                          <Select
                            value={config?.workflow_template_id || ''}
                            onValueChange={(value) => handleAssignWorkflow('department', dept.id, value)}
                          >
                            <SelectTrigger className="w-[200px]">
                              <SelectValue placeholder="Inherit (default)" />
                            </SelectTrigger>
                            <SelectContent>
                              {templates?.map(t => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.display_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {template && (
                            <div className="mt-1">
                              <WorkflowStagesPreview stages={template.stages} />
                            </div>
                          )}
                          {renderInheritedBadge('department', dept.id)}
                        </TableCell>
                        <TableCell>
                          {config && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemoveConfig(config.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PMS Grade Tab */}
        <TabsContent value="pms_grade" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>PMS Grade Workflows</CardTitle>
              <CardDescription>
                Assign workflows based on employee PMS grades
                {periodMode === 'specific' && ` — showing overrides for ${selectedMonth} ${selectedYear}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pmsGrades.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No PMS grades found. Assign PMS grades to employees first.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PMS Grade</TableHead>
                      <TableHead>Employees</TableHead>
                      <TableHead>Assigned Workflow</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pmsGrades.map(grade => {
                      const config = getConfigFor('pms_grade', grade);
                      const template = config ? getTemplate(config.workflow_template_id) : null;
                      const employeeCount = profiles?.filter(p => p.pms_grade === grade).length || 0;
                      
                      return (
                        <TableRow key={grade}>
                          <TableCell className="font-medium">{grade}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{employeeCount}</Badge>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={config?.workflow_template_id || ''}
                              onValueChange={(value) => handleAssignWorkflow('pms_grade', grade, value)}
                            >
                              <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Inherit (default)" />
                              </SelectTrigger>
                              <SelectContent>
                                {templates?.map(t => (
                                  <SelectItem key={t.id} value={t.id}>
                                    {t.display_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {template && (
                              <div className="mt-1">
                                <WorkflowStagesPreview stages={template.stages} />
                              </div>
                            )}
                            {renderInheritedBadge('pms_grade', grade)}
                          </TableCell>
                          <TableCell>
                            {config && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemoveConfig(config.id)}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Custom Workflow Dialog */}
      <CustomWorkflowDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editTemplate={editingTemplate}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete "{deleteTarget?.display_name}"? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await deleteTemplate.mutateAsync(deleteTarget.id);
                  toast({ title: 'Template deleted permanently' });
                } catch (err: any) {
                  toast({
                    title: 'Cannot delete',
                    description: err?.message || 'Failed to delete template.',
                    variant: 'destructive',
                  });
                }
                setDeleteTarget(null);
              }}
            >
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive Confirmation */}
      <AlertDialog open={!!archiveTarget} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Template</AlertDialogTitle>
            <AlertDialogDescription>
              Archive "{archiveTarget?.display_name}"? It will be hidden from assignment dropdowns but preserved for audit history. You can restore it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!archiveTarget) return;
                try {
                  await archiveTemplate.mutateAsync(archiveTarget.id);
                  toast({ title: 'Template archived' });
                } catch (err: any) {
                  toast({
                    title: 'Cannot archive',
                    description: err?.message || 'Failed to archive template.',
                    variant: 'destructive',
                  });
                }
                setArchiveTarget(null);
              }}
            >
              Archive
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
